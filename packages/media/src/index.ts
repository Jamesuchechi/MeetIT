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

export interface MeshTransportOptions {
  PeerConnectionImpl?: typeof RTCPeerConnection;
  SessionDescriptionImpl?: typeof RTCSessionDescription;
  IceCandidateImpl?: typeof RTCIceCandidate;
  iceRestartGraceMs?: number;
  renegotiateTimeoutMs?: number;
}

export class MeshTransport implements MediaTransport {
  private readonly listeners = new Map<
    keyof TransportEvents,
    Set<(payload: never) => void>
  >();

  private readonly publishedTracks = new Map<
    TrackSource,
    { track: MediaStreamTrack; stream?: MediaStream }
  >();
  private readonly peers = new Map<string, PeerSession>();
  private readonly unsubscribers: Array<() => void> = [];

  private selfId = '';
  private iceServers: RTCIceServer[] = [];
  private iceTransportPolicy: 'all' | 'relay' = 'all';
  private signaling: SignalingChannel | null = null;
  private connected = false;
  private bandwidthMode: BandwidthMode = 'standard';
  private e2eeKeyManager: E2eeKeyManager | null = null;
  private e2eeEnabled = false;

  private readonly PeerConnectionCtor: typeof RTCPeerConnection | undefined;
  private readonly iceRestartGraceMs: number;
  private readonly renegotiateTimeoutMs: number;

  constructor(options: MeshTransportOptions = {}) {
    this.PeerConnectionCtor =
      options.PeerConnectionImpl ??
      (typeof globalThis.RTCPeerConnection !== 'undefined'
        ? globalThis.RTCPeerConnection
        : undefined);
    this.iceRestartGraceMs = options.iceRestartGraceMs ?? 5000;
    this.renegotiateTimeoutMs = options.renegotiateTimeoutMs ?? 15000;
  }

  isPoliteWith(remotePeerId: string): boolean {
    // Lexicographically lower peerId is impolite; higher is polite
    return this.selfId > remotePeerId;
  }

  async connect(options: ConnectOptions): Promise<void> {
    this.selfId = options.selfId;
    this.iceServers = options.iceServers;
    this.iceTransportPolicy = options.iceTransportPolicy ?? 'all';
    this.signaling = options.signaling ?? null;
    this.connected = true;

    if (options.e2ee?.enabled) {
      this.e2eeEnabled = true;
      this.e2eeKeyManager = new E2eeKeyManager(options.e2ee.sharedSecret);
    } else {
      this.e2eeEnabled = false;
      this.e2eeKeyManager = null;
    }

    if (this.signaling) {
      this.unsubscribers.push(
        this.signaling.on('peer.joined', ({ peer }) => {
          if (peer.id !== this.selfId) {
            this.ensurePeer(peer.id, true);
          }
        }),
        this.signaling.on('peer.left', ({ peerId }) => {
          this.removePeer(peerId);
        }),
        this.signaling.on('signal.offer', ({ from, sdp }) => {
          void this.handleRemoteDescription(from, sdp);
        }),
        this.signaling.on('signal.answer', ({ from, sdp }) => {
          void this.handleRemoteDescription(from, sdp);
        }),
        this.signaling.on('signal.ice', ({ from, candidate }) => {
          void this.handleRemoteCandidate(from, candidate);
        }),
      );
    }

    if (options.peerIds) {
      for (const peerId of options.peerIds) {
        if (peerId !== this.selfId) {
          this.ensurePeer(peerId, true);
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const unsub of this.unsubscribers.splice(0)) {
      unsub();
    }
    for (const peerId of Array.from(this.peers.keys())) {
      this.removePeer(peerId);
    }
    this.publishedTracks.clear();
  }

  async publish(
    track: MediaStreamTrack,
    source: TrackSource,
    options?: { peerId?: string; stream?: MediaStream },
  ): Promise<void> {
    this.assertConnected();
    this.publishedTracks.set(source, {
      track,
      ...(options?.stream ? { stream: options.stream } : {}),
    });

    for (const session of this.peers.values()) {
      this.attachTrackToSession(session, source, track, options?.stream);
      void this.negotiate(session);
    }
  }

  async unpublish(source: TrackSource): Promise<void> {
    this.publishedTracks.delete(source);
    for (const session of this.peers.values()) {
      const sender = session.senders.get(source);
      if (sender) {
        try {
          session.pc.removeTrack(sender);
        } catch {
          // ignore if already closed
        }
        session.senders.delete(source);
        void this.negotiate(session);
      }
    }
  }

  async replaceTrack(
    source: TrackSource,
    track: MediaStreamTrack,
  ): Promise<void> {
    this.assertConnected();
    const existing = this.publishedTracks.get(source);
    if (!existing) {
      throw new Error(`No published track for source "${source}"`);
    }
    this.publishedTracks.set(source, {
      track,
      ...(existing.stream ? { stream: existing.stream } : {}),
    });

    for (const session of this.peers.values()) {
      const sender = session.senders.get(source);
      if (sender && typeof sender.replaceTrack === 'function') {
        await sender.replaceTrack(track);
      }
    }
  }

  async getStats(): Promise<TransportStats> {
    const allReports: Array<Record<string, unknown>> = [];
    for (const session of this.peers.values()) {
      if (typeof session.pc.getStats === 'function') {
        const stats = await session.pc.getStats();
        stats.forEach((report: Record<string, unknown>) => {
          allReports.push(report);
        });
      }
    }
    return normalizeRtcStats(allReports);
  }

  async getPeerStats(): Promise<Record<string, PeerNetworkStats>> {
    const result: Record<string, PeerNetworkStats> = {};
    let maxRtt: number | undefined;
    let totalLostDelta = 0;
    let totalRecvDelta = 0;
    let totalBytesRecv = 0;
    let totalBytesSent = 0;

    for (const session of this.peers.values()) {
      let bytesReceived = 0;
      let bytesSent = 0;
      let packetsLost = 0;
      let packetsReceived = 0;
      let roundTripTimeMs: number | undefined;
      let availableOutgoingBitrate: number | undefined;

      if (typeof session.pc.getStats === 'function') {
        try {
          const stats = await session.pc.getStats();
          stats.forEach((report: Record<string, unknown>) => {
            const type = report.type;
            if (type === 'inbound-rtp') {
              if (typeof report.bytesReceived === 'number') {
                bytesReceived += report.bytesReceived;
              }
              if (typeof report.packetsLost === 'number') {
                packetsLost += Math.max(0, report.packetsLost);
              }
              if (typeof report.packetsReceived === 'number') {
                packetsReceived += Math.max(0, report.packetsReceived);
              }
            } else if (type === 'outbound-rtp') {
              if (typeof report.bytesSent === 'number') {
                bytesSent += report.bytesSent;
              }
            } else if (
              type === 'candidate-pair' &&
              report.state === 'succeeded'
            ) {
              if (typeof report.currentRoundTripTime === 'number') {
                roundTripTimeMs = Math.round(
                  report.currentRoundTripTime * 1000,
                );
              }
              if (typeof report.availableOutgoingBitrate === 'number') {
                availableOutgoingBitrate = report.availableOutgoingBitrate;
              }
            }
          });
        } catch {
          // ignore stats read failure
        }
      }

      const deltaLost = Math.max(0, packetsLost - session.prevPacketsLost);
      const deltaRecv = Math.max(
        0,
        packetsReceived - session.prevPacketsReceived,
      );
      session.prevPacketsLost = packetsLost;
      session.prevPacketsReceived = packetsReceived;

      const totalWindowPackets = deltaLost + deltaRecv;
      const fractionLost =
        totalWindowPackets > 0 ? deltaLost / totalWindowPackets : 0;

      const { quality, bars } = computeNetworkQuality({
        roundTripTimeMs,
        fractionLost,
        packetsLost: deltaLost,
        connectionState: session.state,
      });

      result[session.peerId] = {
        peerId: session.peerId,
        ...(roundTripTimeMs !== undefined ? { roundTripTimeMs } : {}),
        packetsLost,
        packetsReceived,
        fractionLost,
        bytesReceived,
        bytesSent,
        ...(availableOutgoingBitrate !== undefined
          ? { availableOutgoingBitrate }
          : {}),
        quality,
        bars,
      };

      if (
        roundTripTimeMs !== undefined &&
        (maxRtt === undefined || roundTripTimeMs > maxRtt)
      ) {
        maxRtt = roundTripTimeMs;
      }
      totalLostDelta += deltaLost;
      totalRecvDelta += deltaRecv;
      totalBytesRecv += bytesReceived;
      totalBytesSent += bytesSent;
    }

    const localTotalPackets = totalLostDelta + totalRecvDelta;
    const localFractionLost =
      localTotalPackets > 0 ? totalLostDelta / localTotalPackets : 0;
    const localQuality = computeNetworkQuality({
      roundTripTimeMs: maxRtt,
      fractionLost: localFractionLost,
      packetsLost: totalLostDelta,
      connectionState: this.connected ? 'connected' : 'closed',
    });

    result.local = {
      peerId: 'local',
      ...(maxRtt !== undefined ? { roundTripTimeMs: maxRtt } : {}),
      packetsLost: totalLostDelta,
      packetsReceived: totalRecvDelta,
      fractionLost: localFractionLost,
      bytesReceived: totalBytesRecv,
      bytesSent: totalBytesSent,
      quality: localQuality.quality,
      bars: localQuality.bars,
    };

    return result;
  }

  getBandwidthMode(): BandwidthMode {
    return this.bandwidthMode;
  }

  async setBandwidthMode(mode: BandwidthMode): Promise<void> {
    this.bandwidthMode = mode;
    const isAudioOnly = mode === 'audio_only';

    // Toggle incoming remote video tracks
    for (const session of this.peers.values()) {
      for (const remoteTrack of session.receivedVideoTracks) {
        remoteTrack.enabled = !isAudioOnly;
      }
    }

    // Toggle or constrain local camera track
    const camEntry = this.publishedTracks.get('camera');
    if (camEntry) {
      if (isAudioOnly) {
        camEntry.track.enabled = false;
      } else if (typeof camEntry.track.applyConstraints === 'function') {
        try {
          if (mode === 'data_saver') {
            await camEntry.track.applyConstraints({
              width: { ideal: 640 },
              height: { ideal: 360 },
              frameRate: { max: 15 },
            });
          } else {
            await camEntry.track.applyConstraints({
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            });
          }
        } catch {
          // ignore if constraints not supported on synthetic/mock track
        }
      }
    }

    this.updateAllPeersBitrateCap();
  }

  on<E extends keyof TransportEvents>(
    event: E,
    callback: (payload: TransportEvents[E]) => void,
  ): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(callback as (payload: never) => void);
    this.listeners.set(event, set);
    return () => {
      set.delete(callback as (payload: never) => void);
    };
  }

  addPeer(peerId: string): void {
    if (peerId !== this.selfId) {
      this.ensurePeer(peerId, true);
    }
  }

  /**
   * Re-synchronizes active mesh peer connections after a signaling reconnect.
   */
  syncPeers(peerIds: string[], iceServers?: RTCIceServer[]): void {
    if (!this.connected) return;
    if (iceServers) {
      this.iceServers = iceServers;
      for (const session of this.peers.values()) {
        if (typeof session.pc.setConfiguration === 'function') {
          try {
            session.pc.setConfiguration({
              iceServers: this.iceServers,
              iceTransportPolicy: this.iceTransportPolicy,
            });
          } catch {
            // ignore if browser rejects runtime ICE config update
          }
        }
      }
    }

    const desired = new Set(peerIds.filter((id) => id !== this.selfId));
    for (const existingId of Array.from(this.peers.keys())) {
      if (!desired.has(existingId)) {
        this.removePeer(existingId);
      }
    }
    for (const peerId of desired) {
      this.ensurePeer(peerId, true);
    }
  }

  private emit<E extends keyof TransportEvents>(
    event: E,
    payload: TransportEvents[E],
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      (cb as (p: TransportEvents[E]) => void)(payload);
    }
  }

  private ensurePeer(peerId: string, initiateIfImpolite = false): PeerSession {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    if (!this.PeerConnectionCtor) {
      throw new Error('RTCPeerConnection is not available in this environment');
    }

    const pc = new this.PeerConnectionCtor({
      iceServers: this.iceServers,
      iceTransportPolicy: this.iceTransportPolicy,
      iceCandidatePoolSize: 1,
    });
    const session: PeerSession = {
      peerId,
      pc,
      makingOffer: false,
      pendingNegotiation: false,
      pendingIceRestart: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      remoteDescriptionSet: false,
      queuedCandidates: [],
      senders: new Map(),
      receivedVideoTrackIds: new Set(),
      receivedVideoTracks: new Set(),
      prevPacketsLost: 0,
      prevPacketsReceived: 0,
      state: 'new',
      disconnectTimer: null,
      renegotiateTimer: null,
    };

    this.peers.set(peerId, session);
    this.updateAllPeersBitrateCap();

    // Attach already-published local tracks
    for (const [source, { track, stream }] of this.publishedTracks.entries()) {
      this.attachTrackToSession(session, source, track, stream);
    }

    pc.onnegotiationneeded = () => {
      void this.negotiate(session);
    };

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate && this.signaling) {
        this.signaling.send({
          v: 1,
          type: 'signal.ice',
          payload: {
            to: peerId,
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid ?? null,
              sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
              usernameFragment: event.candidate.usernameFragment ?? null,
            },
          },
        });
      }
    };

    pc.ontrack = (event: RTCTrackEvent) => {
      const track = event.track;
      const stream = event.streams?.[0];
      let source: TrackSource = 'camera';
      if (track.kind === 'audio') {
        source = 'microphone';
      } else {
        const labelLower = (track.label || '').toLowerCase();
        const streamIdLower = (stream?.id || '').toLowerCase();
        const isSecondVideo =
          session.receivedVideoTrackIds.size > 0 &&
          !session.receivedVideoTrackIds.has(track.id);
        session.receivedVideoTrackIds.add(track.id);
        session.receivedVideoTracks.add(track);
        if (this.bandwidthMode === 'audio_only') {
          track.enabled = false;
        }
        if (
          labelLower.includes('screen') ||
          labelLower.includes('window') ||
          labelLower.includes('display') ||
          streamIdLower.includes('screen') ||
          isSecondVideo
        ) {
          source = 'screen';
        }
      }

      this.emit('trackSubscribed', {
        peerId,
        source,
        track,
        ...(stream ? { stream } : {}),
      });

      if (this.e2eeEnabled && this.e2eeKeyManager && event.receiver) {
        attachReceiverE2ee(event.receiver, this.e2eeKeyManager);
      }

      track.onended = () => {
        session.receivedVideoTrackIds.delete(track.id);
        session.receivedVideoTracks.delete(track);
        this.emit('trackUnsubscribed', { peerId, source });
      };
    };

    const handleStateChange = () => {
      this.handleConnectionStateUpdate(session);
    };

    pc.oniceconnectionstatechange = handleStateChange;
    pc.onconnectionstatechange = handleStateChange;

    // Only the impolite peer initiates the initial offer on join to avoid glare
    if (initiateIfImpolite && !this.isPoliteWith(peerId)) {
      void this.negotiate(session);
    }

    return session;
  }

  private attachTrackToSession(
    session: PeerSession,
    source: TrackSource,
    track: MediaStreamTrack,
    stream?: MediaStream,
  ): void {
    if (session.senders.has(source)) return;
    const streams = stream ? [stream] : [];
    const sender = session.pc.addTrack(track, ...streams);
    session.senders.set(source, sender);
    if (this.e2eeEnabled && this.e2eeKeyManager) {
      attachSenderE2ee(sender, this.e2eeKeyManager);
    }
    void this.applyBitrateCap(sender, track.kind);
  }

  private updateAllPeersBitrateCap(): void {
    for (const session of this.peers.values()) {
      for (const [source, sender] of session.senders.entries()) {
        if (source === 'camera' || source === 'screen') {
          void this.applyBitrateCap(sender, 'video');
        }
      }
    }
  }

  private async applyBitrateCap(
    sender: RTCRtpSender,
    kind: string,
  ): Promise<void> {
    if (
      kind !== 'video' ||
      typeof sender.getParameters !== 'function' ||
      typeof sender.setParameters !== 'function'
    ) {
      return;
    }
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      const maxBitrate = computeMaxVideoBitrate(
        this.peers.size + 1,
        this.bandwidthMode,
      );
      for (const enc of params.encodings) {
        enc.maxBitrate = maxBitrate;
        enc.scaleResolutionDownBy = this.bandwidthMode === 'data_saver' ? 2 : 1;
        enc.maxFramerate = this.bandwidthMode === 'data_saver' ? 15 : 30;
      }
      await sender.setParameters(params);
    } catch {
      // ignore if browser does not allow setting parameters before negotiation
    }
  }

  private flushPendingNegotiation(session: PeerSession): void {
    if (
      !this.connected ||
      !session.pendingNegotiation ||
      session.makingOffer ||
      session.pc.signalingState !== 'stable'
    ) {
      return;
    }
    session.pendingNegotiation = false;
    const iceRestart = session.pendingIceRestart;
    session.pendingIceRestart = false;
    void this.negotiate(session, iceRestart);
  }

  private async negotiate(
    session: PeerSession,
    iceRestart = false,
  ): Promise<void> {
    if (!this.connected) return;
    if (session.makingOffer || session.pc.signalingState !== 'stable') {
      // Queue follow-up negotiation so tracks added mid-handshake are not dropped
      session.pendingNegotiation = true;
      if (iceRestart) {
        session.pendingIceRestart = true;
      }
      return;
    }
    try {
      session.makingOffer = true;
      this.updateSessionState(
        session,
        session.state === 'reconnecting' ? 'reconnecting' : 'connecting',
      );

      const offer = await session.pc.createOffer(
        iceRestart ? { iceRestart: true } : undefined,
      );
      if (session.pc.signalingState !== 'stable') {
        session.pendingNegotiation = true;
        if (iceRestart) {
          session.pendingIceRestart = true;
        }
        return;
      }

      const tunedSdp = tuneOpusSdp(offer.sdp);
      const finalOffer: RTCSessionDescriptionInit = {
        type: offer.type,
        ...(tunedSdp !== undefined ? { sdp: tunedSdp } : {}),
      };

      await session.pc.setLocalDescription(finalOffer);
      if (this.signaling && session.pc.localDescription) {
        this.signaling.send({
          v: 1,
          type: 'signal.offer',
          payload: {
            to: session.peerId,
            sdp: {
              type: session.pc.localDescription.type,
              ...(session.pc.localDescription.sdp
                ? { sdp: session.pc.localDescription.sdp }
                : {}),
            },
          },
        });
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    } finally {
      session.makingOffer = false;
      this.flushPendingNegotiation(session);
    }
  }

  private async handleRemoteDescription(
    peerId: string,
    description: SdpPayload,
  ): Promise<void> {
    const session = this.ensurePeer(peerId, false);
    const polite = this.isPoliteWith(peerId);

    try {
      const offerCollision =
        description.type === 'offer' &&
        (session.makingOffer ||
          (session.pc.signalingState !== 'stable' &&
            !session.isSettingRemoteAnswerPending));

      session.ignoreOffer = !polite && offerCollision;
      if (session.ignoreOffer) {
        return;
      }

      session.isSettingRemoteAnswerPending = description.type === 'answer';
      const rtcDesc: RTCSessionDescriptionInit = {
        type: description.type,
        ...(description.sdp !== undefined ? { sdp: description.sdp } : {}),
      };
      if (offerCollision && polite) {
        await session.pc.setLocalDescription({ type: 'rollback' });
        await session.pc.setRemoteDescription(rtcDesc);
      } else {
        await session.pc.setRemoteDescription(rtcDesc);
      }
      session.isSettingRemoteAnswerPending = false;
      session.remoteDescriptionSet = true;

      // Flush any ICE candidates that arrived before remoteDescription was set
      while (session.queuedCandidates.length > 0) {
        const next = session.queuedCandidates.shift();
        if (next) {
          await session.pc.addIceCandidate(this.toRtcCandidate(next));
        }
      }

      if (description.type === 'offer') {
        const answer = await session.pc.createAnswer();
        const tunedSdp = tuneOpusSdp(answer.sdp);
        const finalAnswer: RTCSessionDescriptionInit = {
          type: answer.type,
          ...(tunedSdp !== undefined ? { sdp: tunedSdp } : {}),
        };
        await session.pc.setLocalDescription(finalAnswer);

        if (this.signaling && session.pc.localDescription) {
          this.signaling.send({
            v: 1,
            type: 'signal.answer',
            payload: {
              to: peerId,
              sdp: {
                type: session.pc.localDescription.type,
                ...(session.pc.localDescription.sdp
                  ? { sdp: session.pc.localDescription.sdp }
                  : {}),
              },
            },
          });
        }
      }
      this.flushPendingNegotiation(session);
    } catch (err) {
      session.isSettingRemoteAnswerPending = false;
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private toRtcCandidate(candidate: IceCandidatePayload): RTCIceCandidateInit {
    return {
      candidate: candidate.candidate,
      ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid } : {}),
      ...(candidate.sdpMLineIndex !== undefined
        ? { sdpMLineIndex: candidate.sdpMLineIndex }
        : {}),
      ...(candidate.usernameFragment !== undefined
        ? { usernameFragment: candidate.usernameFragment }
        : {}),
    };
  }

  private async handleRemoteCandidate(
    peerId: string,
    candidate: IceCandidatePayload,
  ): Promise<void> {
    const session = this.ensurePeer(peerId, false);
    try {
      if (!session.remoteDescriptionSet || !session.pc.remoteDescription) {
        session.queuedCandidates.push(candidate);
        return;
      }
      await session.pc.addIceCandidate(this.toRtcCandidate(candidate));
    } catch (err) {
      if (!session.ignoreOffer) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private handleConnectionStateUpdate(session: PeerSession): void {
    const iceState = session.pc.iceConnectionState;
    const connState = session.pc.connectionState;

    if (
      connState === 'connected' ||
      iceState === 'connected' ||
      iceState === 'completed'
    ) {
      this.clearRecoveryTimers(session);
      this.updateSessionState(session, 'connected');
      return;
    }

    if (iceState === 'disconnected' || connState === 'disconnected') {
      if (!session.disconnectTimer) {
        // 3s grace period before ICE restart
        session.disconnectTimer = setTimeout(() => {
          session.disconnectTimer = null;
          this.triggerIceRestart(session);
        }, this.iceRestartGraceMs);
      }
      if (!session.renegotiateTimer) {
        // 15s full renegotiation fallback
        session.renegotiateTimer = setTimeout(() => {
          session.renegotiateTimer = null;
          this.triggerFullRenegotiation(session.peerId);
        }, this.renegotiateTimeoutMs);
      }
      return;
    }

    if (iceState === 'failed' || connState === 'failed') {
      this.clearRecoveryTimers(session);
      this.updateSessionState(session, 'failed');
      this.triggerFullRenegotiation(session.peerId);
      return;
    }

    if (connState === 'closed' || iceState === 'closed') {
      this.clearRecoveryTimers(session);
      this.updateSessionState(session, 'closed');
    }
  }

  private triggerIceRestart(session: PeerSession): void {
    if (!this.connected) return;
    this.updateSessionState(session, 'reconnecting');
    if (typeof session.pc.restartIce === 'function') {
      session.pc.restartIce();
    }
    void this.negotiate(session, true);
  }

  private triggerFullRenegotiation(peerId: string): void {
    if (!this.connected) return;
    this.removePeer(peerId, false);
    const rebuilt = this.ensurePeer(peerId, false);
    this.updateSessionState(rebuilt, 'reconnecting');
    void this.negotiate(rebuilt, true);
  }

  private clearRecoveryTimers(session: PeerSession): void {
    if (session.disconnectTimer) {
      clearTimeout(session.disconnectTimer);
      session.disconnectTimer = null;
    }
    if (session.renegotiateTimer) {
      clearTimeout(session.renegotiateTimer);
      session.renegotiateTimer = null;
    }
  }

  private updateSessionState(
    session: PeerSession,
    next: ConnectionState,
  ): void {
    if (session.state === next) return;
    session.state = next;
    this.emit('connectionStateChanged', {
      peerId: session.peerId,
      state: next,
    });
  }

  private removePeer(peerId: string, emitClosed = true): void {
    const session = this.peers.get(peerId);
    if (!session) return;
    this.clearRecoveryTimers(session);
    try {
      session.pc.onnegotiationneeded = null;
      session.pc.onicecandidate = null;
      session.pc.ontrack = null;
      session.pc.oniceconnectionstatechange = null;
      session.pc.onconnectionstatechange = null;
      session.pc.close();
    } catch {
      // ignore close errors
    }
    this.peers.delete(peerId);
    this.updateAllPeersBitrateCap();
    if (emitClosed) {
      this.emit('connectionStateChanged', { peerId, state: 'closed' });
    }
  }

  getE2eeKeyManager(): E2eeKeyManager | null {
    return this.e2eeKeyManager;
  }

  async setE2eeMasterSecret(secret: string): Promise<void> {
    if (!this.e2eeKeyManager) {
      this.e2eeKeyManager = new E2eeKeyManager(secret);
      this.e2eeEnabled = true;
    } else {
      await this.e2eeKeyManager.setMasterSecret(secret);
    }
  }

  async advanceE2eeEpoch(): Promise<number> {
    if (!this.e2eeKeyManager) return 0;
    return this.e2eeKeyManager.advanceEpoch();
  }

  async getE2eeSas(): Promise<E2eeSasResult | null> {
    if (!this.e2eeKeyManager) return null;
    const fp = await this.e2eeKeyManager.getFingerprint();
    return generateSasFromFingerprint(fp, this.e2eeKeyManager.getEpoch());
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('MeshTransport must be connected before publishing');
    }
  }
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
