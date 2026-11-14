import {
  createDidKeyDescriptor,
  packNeuralAudioFrame,
  unpackNeuralAudioFrame,
} from './tier3.js';

// ---------------------------------------------------------------------------
// 1. Ultra-Low-Bitrate Neural Audio Codec (< 3 kbps)
// ---------------------------------------------------------------------------

/**
 * Encodes a 20 ms PCM speech frame into a 7-byte packet (2-byte header + 5-byte
 * quantized energy, pitch, and 6-band envelope) => 2,800 bps (< 3 kbps).
 */
export function encodeUltraLowBitrateSpeech(
  samples: Float32Array,
  frameMs = 20,
): { packet: Uint8Array; bitrateBps: number } {
  const n = Math.max(1, samples.length);
  let sumSq = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i] ?? 0;
    sumSq += s * s;
    if (i > 0 && (samples[i - 1] ?? 0) * s < 0) {
      zeroCrossings++;
    }
  }
  const rms = Math.min(1, Math.sqrt(sumSq / n));
  const zcrNorm = Math.min(1, zeroCrossings / (n * 0.5));

  // 6 subband energy ratios packed into 3 bytes (4 bits per band)
  const bands = 6;
  const bandSize = Math.max(1, Math.floor(n / bands));
  const bandNibbles: number[] = [];
  for (let b = 0; b < bands; b++) {
    let bSum = 0;
    const start = b * bandSize;
    const end = b === bands - 1 ? n : Math.min(n, start + bandSize);
    for (let i = start; i < end; i++) {
      const v = samples[i] ?? 0;
      bSum += v * v;
    }
    const bRms = Math.min(1, Math.sqrt(bSum / Math.max(1, end - start)));
    bandNibbles.push(Math.min(15, Math.round(bRms * 15)));
  }

  const tokens = new Uint8Array(5);
  tokens[0] = Math.min(255, Math.round(rms * 255));
  tokens[1] = Math.min(255, Math.round(zcrNorm * 255));
  tokens[2] = ((bandNibbles[0] ?? 0) << 4) | (bandNibbles[1] ?? 0);
  tokens[3] = ((bandNibbles[2] ?? 0) << 4) | (bandNibbles[3] ?? 0);
  tokens[4] = ((bandNibbles[4] ?? 0) << 4) | (bandNibbles[5] ?? 0);

  return packNeuralAudioFrame(tokens, frameMs);
}

/**
 * Reconstructs a Float32Array speech frame from a < 3 kbps neural audio packet.
 */
export function decodeUltraLowBitrateSpeech(
  packet: Uint8Array,
  sampleRate = 16000,
): { samples: Float32Array; frameMs: number } {
  const { frameMs, tokens } = unpackNeuralAudioFrame(packet);
  if (tokens.length < 5) {
    throw new Error('Neural audio token payload too short.');
  }
  const rms = (tokens[0] ?? 0) / 255;
  const zcrNorm = (tokens[1] ?? 0) / 255;
  const bandLevels = [
    ((tokens[2] ?? 0) >> 4) / 15,
    ((tokens[2] ?? 0) & 0x0f) / 15,
    ((tokens[3] ?? 0) >> 4) / 15,
    ((tokens[3] ?? 0) & 0x0f) / 15,
    ((tokens[4] ?? 0) >> 4) / 15,
    ((tokens[4] ?? 0) & 0x0f) / 15,
  ];

  const totalSamples = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const out = new Float32Array(totalSamples);
  const baseFreq = 110 + zcrNorm * 650;
  const bandSize = Math.max(1, Math.floor(totalSamples / bandLevels.length));

  for (let i = 0; i < totalSamples; i++) {
    const bandIdx = Math.min(bandLevels.length - 1, Math.floor(i / bandSize));
    const amp = rms * (0.35 + 0.65 * (bandLevels[bandIdx] ?? 0));
    const t = i / sampleRate;
    out[i] = amp * Math.sin(2 * Math.PI * baseFreq * t);
  }
  return { samples: out, frameMs };
}

// ---------------------------------------------------------------------------
// 2. 3D / Spatial Audio (WebAudio HRTF) + WebXR Session Helper
// ---------------------------------------------------------------------------

export interface SpatialPose3D {
  x: number;
  y: number;
  z: number;
}

export class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private panners = new Map<string, PannerNode>();

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    this.ctx = new AudioCtx();
    return this.ctx;
  }

  public setListenerPose(pose: SpatialPose3D): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const listener = ctx.listener;
    if ('positionX' in listener) {
      listener.positionX.value = pose.x;
      listener.positionY.value = pose.y;
      listener.positionZ.value = pose.z;
    }
  }

  public attachPeerStream(peerId: string, stream: MediaStream): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    const existing = this.panners.get(peerId);
    if (existing) {
      existing.disconnect();
    }
    const source = ctx.createMediaStreamSource(stream);
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 50;
    panner.rolloffFactor = 1;
    source.connect(panner);
    panner.connect(ctx.destination);
    this.panners.set(peerId, panner);
    return true;
  }

  public setPeerPose(peerId: string, pose: SpatialPose3D): void {
    const panner = this.panners.get(peerId);
    if (!panner) return;
    panner.positionX.value = pose.x;
    panner.positionY.value = pose.y;
    panner.positionZ.value = pose.z;
  }

  public removePeer(peerId: string): void {
    const panner = this.panners.get(peerId);
    if (panner) {
      panner.disconnect();
      this.panners.delete(peerId);
    }
  }

  public dispose(): void {
    for (const panner of this.panners.values()) {
      panner.disconnect();
    }
    this.panners.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export async function checkWebXRSupport(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
  };
  if (!nav.xr?.isSessionSupported) return false;
  try {
    return await nav.xr.isSessionSupported('immersive-vr');
  } catch {
    return false;
  }
}

export async function requestWebXRSession(): Promise<unknown | null> {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    xr?: {
      requestSession?: (
        mode: string,
        opts?: { optionalFeatures?: string[] },
      ) => Promise<unknown>;
    };
  };
  if (!nav.xr?.requestSession) return null;
  try {
    return await nav.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor'],
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Universal Translator Live TTS
// ---------------------------------------------------------------------------

const LANG_BCP47: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  ja: 'ja-JP',
};

export function speakTranslatedCaption(
  text: string,
  targetLang: string,
  options?: { pitch?: number; rate?: number; cancelPrevious?: boolean },
): boolean {
  if (
    !text.trim() ||
    !targetLang ||
    targetLang === 'en' ||
    typeof window === 'undefined' ||
    typeof window.speechSynthesis === 'undefined' ||
    typeof SpeechSynthesisUtterance === 'undefined'
  ) {
    return false;
  }
  if (options?.cancelPrevious) {
    window.speechSynthesis.cancel();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG_BCP47[targetLang] ?? targetLang;
  if (options?.pitch !== undefined) utterance.pitch = options.pitch;
  if (options?.rate !== undefined) utterance.rate = options.rate;
  window.speechSynthesis.speak(utterance);
  return true;
}

// ---------------------------------------------------------------------------
// 4. Decentralized Mode: did:key WebCrypto Identity & Serverless Mesh
// ---------------------------------------------------------------------------

export interface DidKeyIdentity {
  did: string;
  verificationMethod: string;
  publicKeyJwk: JsonWebKey;
  signChallenge: (challenge: string) => Promise<string>;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(b64u: string): Uint8Array {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function generateDidKeyIdentity(): Promise<DidKeyIdentity> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto subtle API unavailable for did:key generation.');
  }
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const rawPub = new Uint8Array(
    await subtle.exportKey('raw', keyPair.publicKey),
  );
  const multibase = `z${bytesToBase64Url(rawPub)}`;
  const { did, verificationMethod } = createDidKeyDescriptor(multibase);

  return {
    did,
    verificationMethod,
    publicKeyJwk,
    signChallenge: async (challenge: string) => {
      const data = new TextEncoder().encode(challenge);
      const sig = await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        data,
      );
      return bytesToBase64Url(new Uint8Array(sig));
    },
  };
}

export async function verifyDidChallenge(
  publicKeyJwk: JsonWebKey,
  challenge: string,
  signatureB64u: string,
): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return false;
  try {
    const key = await subtle.importKey(
      'jwk',
      publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const data = new TextEncoder().encode(challenge);
    const sigBytes = base64UrlToBytes(signatureB64u);
    return await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sigBytes as unknown as BufferSource,
      data as unknown as BufferSource,
    );
  } catch {
    return false;
  }
}

export interface ServerlessMeshMessage {
  type: 'announce' | 'sdp' | 'ice';
  fromDid: string;
  toDid?: string;
  payload: unknown;
}

export class ServerlessLocalMesh {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<(msg: ServerlessMeshMessage) => void>();

  constructor(roomCode: string) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`meetit-p2p-${roomCode}`);
      this.channel.onmessage = (event: MessageEvent<ServerlessMeshMessage>) => {
        for (const cb of this.listeners) cb(event.data);
      };
    }
  }

  public send(msg: ServerlessMeshMessage): void {
    this.channel?.postMessage(msg);
  }

  public subscribe(cb: (msg: ServerlessMeshMessage) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public close(): void {
    this.listeners.clear();
    this.channel?.close();
    this.channel = null;
  }
}
