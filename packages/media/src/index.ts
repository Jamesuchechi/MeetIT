import type {
  AgoraConfig,
  IceCandidatePayload,
  JitsiConfig,
  SdpPayload,
  SignalingChannel,
} from '@meetit/protocol';
import { E2eeKeyManager } from './e2eeKeyManager.js';
import { attachReceiverE2ee, attachSenderE2ee } from './e2eeTransform.js';
import {
  generateSasFromFingerprint,
  type E2eeSasResult,
} from './e2eeVerification.js';

export * from './audioEffects.js';
export * from './videoEffects.js';
export * from './livekit.js';
export * from './agora.js';
export * from './jitsi.js';
export * from './fallback.js';
export * from './tier2.js';
export * from './tier3.js';
export * from './e2eeKeyManager.js';
export * from './e2eeVerification.js';
export * from './e2eeTransform.js';

export type TrackSource = 'camera' | 'microphone' | 'screen' | 'screen_audio';
export type ConnectionState =
  'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export type NetworkQualityLevel =
  'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
export type NetworkQualityBars = 0 | 1 | 2 | 3 | 4;
export type BandwidthMode = 'standard' | 'data_saver' | 'audio_only';

export interface PeerNetworkStats {
  peerId: string;
  roundTripTimeMs?: number;
  packetsLost: number;
  packetsReceived: number;
  fractionLost: number;
  bytesReceived: number;
  bytesSent: number;
  availableOutgoingBitrate?: number;
  quality: NetworkQualityLevel;
  bars: NetworkQualityBars;
}

export interface ConnectOptions {
  roomId: string;
  selfId: string;
  iceServers: RTCIceServer[];
  signaling?: SignalingChannel;
  peerIds?: string[];
  iceTransportPolicy?: 'all' | 'relay';
  e2ee?: {
    enabled: boolean;
    sharedSecret?: string;
  };
  livekit?: {
    url: string;
    token: string;
  };
  jitsi?: JitsiConfig;
  agora?: AgoraConfig;
}

export interface RemoteTrackEvent {
  peerId: string;
  source: TrackSource;
  track: MediaStreamTrack;
  stream?: MediaStream;
}

export interface TransportStats {
  roundTripTimeMs?: number;
  packetsLost?: number;
  bytesReceived: number;
  bytesSent: number;
  relayBytesReceived?: number;
  relayBytesSent?: number;
  relayRatio?: number;
  activeCandidatePairType?: 'host' | 'srflx' | 'prflx' | 'relay';
  activeTransportProtocol?: 'udp' | 'tcp' | 'tls';
}

export interface TransportEvents {
  trackSubscribed: RemoteTrackEvent;
  trackUnsubscribed: { peerId: string; source: TrackSource };
  connectionStateChanged: { peerId: string; state: ConnectionState };
  activeSpeakersChanged: { speakerIds: string[] };
  error: Error;
}

export interface MediaTransport {
  connect(options: ConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  publish(
    track: MediaStreamTrack,
    source: TrackSource,
    options?: {
      peerId?: string;
      stream?: MediaStream;
      screenAudio?: boolean;
      highRes?: boolean;
    },
  ): Promise<void>;
  unpublish(source: TrackSource): Promise<void>;
  replaceTrack(source: TrackSource, track: MediaStreamTrack): Promise<void>;
  getStats(): Promise<TransportStats>;
  getPeerStats?(): Promise<Record<string, PeerNetworkStats>>;
  setBandwidthMode?(mode: BandwidthMode): Promise<void>;
  getBandwidthMode?(): BandwidthMode;
  setTrackVisibility?(
    peerId: string,
    source: TrackSource,
    visible: boolean,
  ): Promise<void>;
  setTrackResolutionTier?(
    peerId: string,
    source: TrackSource,
    tier: 'low' | 'medium' | 'high',
  ): Promise<void>;
  on<E extends keyof TransportEvents>(
    event: E,
    callback: (payload: TransportEvents[E]) => void,
  ): () => void;
}

/**
 * Computes a 0-4 bar score and quality label from RTT (ms), packet loss ratio, and connection state.
 */
export function computeNetworkQuality(params: {
  roundTripTimeMs?: number | undefined;
  fractionLost?: number | undefined;
  packetsLost?: number | undefined;
  connectionState?: ConnectionState | undefined;
}): { quality: NetworkQualityLevel; bars: NetworkQualityBars } {
  const { roundTripTimeMs, fractionLost = 0, connectionState } = params;

  if (connectionState === 'failed' || connectionState === 'closed') {
    return { quality: 'poor', bars: 0 };
  }
  if (connectionState === 'reconnecting') {
    return { quality: 'poor', bars: 1 };
  }
  if (roundTripTimeMs === undefined && fractionLost === 0) {
    return { quality: 'excellent', bars: 4 };
  }

  const rtt = roundTripTimeMs ?? 45;
  if (rtt <= 110 && fractionLost <= 0.015) {
    return { quality: 'excellent', bars: 4 };
  }
  if (rtt <= 230 && fractionLost <= 0.04) {
    return { quality: 'good', bars: 3 };
  }
  if (rtt <= 420 && fractionLost <= 0.09) {
    return { quality: 'fair', bars: 2 };
  }
  return { quality: 'poor', bars: 1 };
}

/**
 * Computes per-stream max video bitrate (bps) based on participant count and bandwidth mode.
 */
export function computeMaxVideoBitrate(
  participantCount: number,
  mode: BandwidthMode = 'standard',
): number {
  if (mode === 'audio_only') return 0;
  if (mode === 'data_saver') return 180_000;
  if (participantCount <= 2) return 1_500_000;
  if (participantCount <= 4) return 800_000;
  return 300_000;
}

export interface TuneOpusOptions {
  enableFec?: boolean;
  enableDtx?: boolean;
  enableRed?: boolean;
  maxAverageBitrate?: number;
  stereo?: boolean;
}

/**
 * Tunes Opus SDP parameters to enable DTX, in-band FEC (`usedtx=1;useinbandfec=1`),
 * custom bitrate, stereo, and optional RED (RFC 2198 audio redundancy).
 */
export function tuneOpusSdp(
  sdp: string | undefined,
  options?: TuneOpusOptions,
): string | undefined {
  if (!sdp) return sdp;
  const enableFec = options?.enableFec ?? true;
  const enableDtx = options?.enableDtx ?? true;
  const maxAverageBitrate = options?.maxAverageBitrate ?? 64000;
  const stereo = options?.stereo ?? false;
  const enableRed = options?.enableRed ?? false;

  const lines = sdp.split(/\r?\n/);
  let opusPayloadType: string | null = null;

  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match?.[1]) {
      opusPayloadType = match[1];
      break;
    }
  }

  if (!opusPayloadType) return sdp;

  const fmtpPrefix = `a=fmtp:${opusPayloadType} `;
  let foundFmtp = false;

  const updated = lines.map((line) => {
    if (line.startsWith(fmtpPrefix)) {
      foundFmtp = true;
      let params = line.slice(fmtpPrefix.length);
      if (enableFec && !/useinbandfec=/i.test(params)) {
        params += ';useinbandfec=1';
      }
      if (enableDtx && !/usedtx=/i.test(params)) {
        params += ';usedtx=1';
      }
      if (maxAverageBitrate && !/maxaveragebitrate=/i.test(params)) {
        params += `;maxaveragebitrate=${maxAverageBitrate}`;
      }
      if (stereo) {
        if (!/stereo=/i.test(params)) params += ';stereo=1';
        if (!/sprop-stereo=/i.test(params)) params += ';sprop-stereo=1';
      }
      return `${fmtpPrefix}${params}`;
    }
    return line;
  });

  if (!foundFmtp) {
    const rtpmapIndex = updated.findIndex((l) =>
      l.startsWith(`a=rtpmap:${opusPayloadType} `),
    );
    if (rtpmapIndex !== -1) {
      let params = 'minptime=10';
      if (enableFec) params += ';useinbandfec=1';
      if (enableDtx) params += ';usedtx=1';
      if (maxAverageBitrate)
        params += `;maxaveragebitrate=${maxAverageBitrate}`;
      if (stereo) params += ';stereo=1;sprop-stereo=1';
      updated.splice(rtpmapIndex + 1, 0, `${fmtpPrefix}${params}`);
    }
  }

  // RED (RFC 2198 audio redundancy) format insertion if requested
  if (enableRed && !updated.some((l) => /a=rtpmap:\d+\s+red\/48000/i.test(l))) {
    const audioMlineIndex = updated.findIndex((l) => /^m=audio\s+/i.test(l));
    if (audioMlineIndex !== -1 && updated[audioMlineIndex]) {
      const redPayloadType = '111';
      const parts = updated[audioMlineIndex]!.split(' ');
      if (!parts.includes(redPayloadType)) {
        parts.splice(3, 0, redPayloadType);
        updated[audioMlineIndex] = parts.join(' ');
      }
      updated.splice(
        audioMlineIndex + 1,
        0,
        `a=rtpmap:${redPayloadType} red/48000/2`,
        `a=fmtp:${redPayloadType} ${opusPayloadType}/${opusPayloadType}`,
      );
    }
  }

  return updated.join('\r\n');
}

/**
 * Extracts candidate type ('host' | 'srflx' | 'prflx' | 'relay') from an SDP candidate line.
 */
export function getCandidateType(
  candidateStr: string,
): 'host' | 'srflx' | 'prflx' | 'relay' {
  const match = candidateStr.match(/\btyp\s+(host|srflx|prflx|relay)\b/i);
  return (
    (match?.[1]?.toLowerCase() as 'host' | 'srflx' | 'prflx' | 'relay') ||
    'host'
  );
}

/**
 * Extracts transport protocol ('udp' | 'tcp' | 'tls') from an SDP candidate line.
 */
export function getCandidateProtocol(
  candidateStr: string,
): 'udp' | 'tcp' | 'tls' {
  const parts = candidateStr.trim().split(/\s+/);
  const proto = (parts[2] || 'udp').toLowerCase();
  if (proto === 'tcp' && candidateStr.toLowerCase().includes('tcptype')) {
    return 'tcp';
  }
  return (proto as 'udp' | 'tcp' | 'tls') || 'udp';
}

/**
 * Prioritizes ICE candidates to optimize direct UDP routes and minimize expensive TURN relay:
 * 1. host (local network UDP)
 * 2. srflx (STUN direct UDP)
 * 3. prflx (peer reflexive UDP)
 * 4. relay UDP
 * 5. relay TCP/TLS
 */
export function prioritizeIceCandidates<T extends { candidate: string }>(
  candidates: T[],
): T[] {
  const typeRank: Record<string, number> = {
    host: 10,
    srflx: 8,
    prflx: 6,
    relay: 2,
  };

  return [...candidates].sort((a, b) => {
    const typeA = getCandidateType(a.candidate);
    const typeB = getCandidateType(b.candidate);
    const rankDiff = (typeRank[typeB] ?? 0) - (typeRank[typeA] ?? 0);
    if (rankDiff !== 0) return rankDiff;

    const protoA = getCandidateProtocol(a.candidate);
    const protoB = getCandidateProtocol(b.candidate);
    if (protoA === 'udp' && protoB !== 'udp') return -1;
    if (protoB === 'udp' && protoA !== 'udp') return 1;

    return 0;
  });
}

/**
 * Configures Scalable Video Coding (SVC) modes (e.g. L3T3_KEY, L1T3) on RTCRtpSender.
 */
export async function configureSenderScalabilityMode(
  sender: RTCRtpSender,
  mode: 'L3T3_KEY' | 'L1T3' | 'L1T2' = 'L3T3_KEY',
): Promise<boolean> {
  if (
    typeof sender.getParameters !== 'function' ||
    typeof sender.setParameters !== 'function'
  ) {
    return false;
  }
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) return false;
    for (const encoding of params.encodings) {
      (encoding as { scalabilityMode?: string }).scalabilityMode = mode;
    }
    await sender.setParameters(params);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a WebRTC stats iterable/map into `TransportStats`, including relay metrics.
 */
export function normalizeRtcStats(
  reports: Iterable<Record<string, unknown>>,
): TransportStats {
  let bytesReceived = 0;
  let bytesSent = 0;
  let packetsLost = 0;
  let roundTripTimeMs: number | undefined;
  let activeCandidatePairType: 'host' | 'srflx' | 'prflx' | 'relay' | undefined;
  let activeTransportProtocol: 'udp' | 'tcp' | 'tls' | undefined;

  const candidateMap = new Map<string, { type: string; protocol: string }>();

  for (const stat of reports) {
    if (stat.type === 'local-candidate' || stat.type === 'remote-candidate') {
      const id = typeof stat.id === 'string' ? stat.id : '';
      const cType =
        typeof stat.candidateType === 'string' ? stat.candidateType : 'host';
      const proto =
        typeof stat.protocol === 'string' ? stat.protocol.toLowerCase() : 'udp';
      if (id) {
        candidateMap.set(id, { type: cType, protocol: proto });
      }
    }
  }

  for (const stat of reports) {
    const type = stat.type;
    if (type === 'inbound-rtp') {
      if (typeof stat.bytesReceived === 'number') {
        bytesReceived += stat.bytesReceived;
      }
      if (typeof stat.packetsLost === 'number') {
        packetsLost += Math.max(0, stat.packetsLost);
      }
    } else if (type === 'outbound-rtp') {
      if (typeof stat.bytesSent === 'number') {
        bytesSent += stat.bytesSent;
      }
    } else if (
      type === 'candidate-pair' &&
      (stat.state === 'succeeded' || stat.nominated === true)
    ) {
      if (typeof stat.currentRoundTripTime === 'number') {
        roundTripTimeMs = Math.round(stat.currentRoundTripTime * 1000);
      }
      const local = candidateMap.get(
        typeof stat.localCandidateId === 'string' ? stat.localCandidateId : '',
      );
      const remote = candidateMap.get(
        typeof stat.remoteCandidateId === 'string'
          ? stat.remoteCandidateId
          : '',
      );
      if (local?.type === 'relay' || remote?.type === 'relay') {
        activeCandidatePairType = 'relay';
      } else if (local?.type === 'prflx' || remote?.type === 'prflx') {
        activeCandidatePairType = 'prflx';
      } else if (local?.type === 'srflx' || remote?.type === 'srflx') {
        activeCandidatePairType = 'srflx';
      } else if (local?.type) {
        activeCandidatePairType = 'host';
      }

      const proto = (local?.protocol || remote?.protocol || 'udp') as
        'udp' | 'tcp' | 'tls';
      activeTransportProtocol = proto;
    }
  }

  const isRelayed = activeCandidatePairType === 'relay';
  const relayBytesReceived = isRelayed ? bytesReceived : 0;
  const relayBytesSent = isRelayed ? bytesSent : 0;
  const totalBytes = bytesReceived + bytesSent;
  const relayRatio =
    totalBytes > 0 ? (relayBytesReceived + relayBytesSent) / totalBytes : 0;

  return {
    bytesReceived,
    bytesSent,
    packetsLost,
    relayBytesReceived,
    relayBytesSent,
    relayRatio,
    ...(activeCandidatePairType ? { activeCandidatePairType } : {}),
    ...(activeTransportProtocol ? { activeTransportProtocol } : {}),
    ...(roundTripTimeMs !== undefined ? { roundTripTimeMs } : {}),
  };
}

interface PeerSession {
  peerId: string;
  pc: RTCPeerConnection;
  makingOffer: boolean;
  pendingNegotiation: boolean;
  pendingIceRestart: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  remoteDescriptionSet: boolean;
  queuedCandidates: IceCandidatePayload[];
  senders: Map<TrackSource, RTCRtpSender>;
  receivedVideoTrackIds: Set<string>;
  receivedVideoTracks: Set<MediaStreamTrack>;
  prevPacketsLost: number;
  prevPacketsReceived: number;
  state: ConnectionState;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  renegotiateTimer: ReturnType<typeof setTimeout> | null;
}

export class FakeTransport implements MediaTransport {
  private readonly listeners = new Map<
    keyof TransportEvents,
    Set<(payload: never) => void>
  >();

  private readonly publishedTracks = new Map<TrackSource, MediaStreamTrack>();
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.publishedTracks.clear();
  }

  async publish(track: MediaStreamTrack, source: TrackSource): Promise<void> {
    this.assertConnected();
    this.publishedTracks.set(source, track);
  }

  async unpublish(source: TrackSource): Promise<void> {
    this.publishedTracks.delete(source);
  }

  async replaceTrack(
    source: TrackSource,
    track: MediaStreamTrack,
  ): Promise<void> {
    this.assertConnected();
    if (!this.publishedTracks.has(source)) {
      throw new Error(`No published track for source "${source}"`);
    }
    this.publishedTracks.set(source, track);
  }

  async getStats(): Promise<TransportStats> {
    return { bytesReceived: 0, bytesSent: 0 };
  }

  on<E extends keyof TransportEvents>(
    event: E,
    callback: (payload: TransportEvents[E]) => void,
  ): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback as (payload: never) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(callback as (payload: never) => void);
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('FakeTransport must be connected before publishing');
    }
  }
}

export { LiveKitTransport, type LiveKitTransportOptions } from './livekit.js';
export {
  VideoEffectProcessor,
  DEFAULT_VIRTUAL_BACKGROUNDS,
  type VideoEffectType,
  type VideoEffectsConfig,
  type GestureType,
  type GestureListener,
} from './videoEffects.js';
export {
  AudioEffectProcessor,
  SpatialAudioEngine,
  type NoiseSuppressionMode,
  type AudioEffectsConfig,
  type FeedbackListener,
} from './audioEffects.js';
