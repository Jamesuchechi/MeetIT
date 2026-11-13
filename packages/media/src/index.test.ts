import { describe, expect, it, vi } from 'vitest';
import type {
  ClientMessage,
  SignalingChannel,
  SignalingEvents,
} from '@meetit/protocol';
import {
  FakeTransport,
  computeMaxVideoBitrate,
  normalizeRtcStats,
  tuneOpusSdp,
  prioritizeIceCandidates,
  configureSenderScalabilityMode,
} from './index.js';

class MockSignalingPair {
  readonly a: SignalingChannel;
  readonly b: SignalingChannel;

  private readonly handlersA = new Map<string, Set<(p: unknown) => void>>();
  private readonly handlersB = new Map<string, Set<(p: unknown) => void>>();

  constructor(
    private readonly idA: string,
    private readonly idB: string,
  ) {
    this.a = this.createChannel(idA, idB, this.handlersA, this.handlersB);
    this.b = this.createChannel(idB, idA, this.handlersB, this.handlersA);
  }

  private createChannel(
    selfId: string,
    otherId: string,
    ownHandlers: Map<string, Set<(p: unknown) => void>>,
    remoteHandlers: Map<string, Set<(p: unknown) => void>>,
  ): SignalingChannel {
    return {
      send: (msg: ClientMessage) => {
        if (msg.type === 'signal.offer' || msg.type === 'signal.answer') {
          this.dispatch(remoteHandlers, msg.type, {
            from: selfId,
            to: otherId,
            sdp: msg.payload.sdp,
          });
        } else if (msg.type === 'signal.ice') {
          this.dispatch(remoteHandlers, 'signal.ice', {
            from: selfId,
            to: otherId,
            candidate: msg.payload.candidate,
          });
        }
      },
      on: <K extends keyof SignalingEvents>(
        type: K,
        handler: (payload: SignalingEvents[K]) => void,
      ) => {
        const set = ownHandlers.get(type) ?? new Set();
        set.add(handler as (p: unknown) => void);
        ownHandlers.set(type, set);
        return () => set.delete(handler as (p: unknown) => void);
      },
    };
  }

  private dispatch(
    handlers: Map<string, Set<(p: unknown) => void>>,
    type: string,
    payload: unknown,
  ): void {
    const set = handlers.get(type);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];

  signalingState: RTCSignalingState = 'stable';
  iceConnectionState: RTCIceConnectionState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;

  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((e: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((e: RTCTrackEvent) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  addedCandidates: unknown[] = [];
  restartedIceCount = 0;
  closed = false;
  replacedTracks: MediaStreamTrack[] = [];

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }

  addTrack(): RTCRtpSender {
    return {
      replaceTrack: async (next: MediaStreamTrack | null) => {
        if (next) this.replacedTracks.push(next);
      },
      getParameters: () => ({ encodings: [{}] }),
      setParameters: async () => {},
    } as unknown as RTCRtpSender;
  }

  removeTrack(): void {}

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'offer',
      sdp: 'v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\n',
    };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'answer',
      sdp: 'v=0\r\na=rtpmap:111 opus/48000/2\r\n',
    };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    if (desc.type === 'rollback') {
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    this.localDescription = desc;
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
    this.signalingState =
      desc.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  async addIceCandidate(candidate: unknown): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  restartIce(): void {
    this.restartedIceCount += 1;
  }

  async getStats(): Promise<Map<string, Record<string, unknown>>> {
    return new Map([
      ['in-1', { type: 'inbound-rtp', bytesReceived: 2048, packetsLost: 2 }],
      ['out-1', { type: 'outbound-rtp', bytesSent: 4096 }],
      [
        'pair-1',
        {
          type: 'candidate-pair',
          state: 'succeeded',
          currentRoundTripTime: 0.042,
        },
      ],
    ]);
  }

  close(): void {
    this.closed = true;
    this.connectionState = 'closed';
  }
}

describe('FakeTransport', () => {
  it('connects and publishes a track cleanly', async () => {
    const transport = new FakeTransport();
    await transport.connect();
    const fakeTrack = { kind: 'audio' } as MediaStreamTrack;
    await expect(
      transport.publish(fakeTrack, 'microphone'),
    ).resolves.toBeUndefined();
    await transport.disconnect();
  });
});

describe('Media utilities (Opus SDP, FEC/RED, bitrate caps, candidate prioritization)', () => {
  it('injects useinbandfec=1 and usedtx=1 into Opus SDP', () => {
    const raw =
      'v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\n';
    const tuned = tuneOpusSdp(raw);
    expect(tuned).toContain('useinbandfec=1');
    expect(tuned).toContain('usedtx=1');
  });

  it('injects RFC 2198 RED format and stereo when enabled', () => {
    const raw =
      'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\n';
    const tuned = tuneOpusSdp(raw, {
      enableRed: true,
      stereo: true,
      maxAverageBitrate: 96000,
    });
    expect(tuned).toContain('red/48000/2');
    expect(tuned).toContain('maxaveragebitrate=96000');
    expect(tuned).toContain('stereo=1');
  });

  it('caps video bitrate by participant count', () => {
    expect(computeMaxVideoBitrate(2)).toBe(1_500_000);
    expect(computeMaxVideoBitrate(4)).toBe(800_000);
    expect(computeMaxVideoBitrate(6)).toBe(300_000);
  });

  it('prioritizes direct UDP host and srflx candidates before relay paths', () => {
    const candidates = [
      {
        candidate:
          'candidate:1 1 UDP 100 198.51.100.1 3478 typ relay raddr 0.0.0.0 rport 0',
      },
      {
        candidate:
          'candidate:2 1 TCP 90 198.51.100.1 443 typ relay tcptype passive',
      },
      {
        candidate: 'candidate:3 1 UDP 200 203.0.113.5 50000 typ srflx',
      },
      {
        candidate: 'candidate:4 1 UDP 2130706431 192.168.1.10 50000 typ host',
      },
    ];

    const sorted = prioritizeIceCandidates(candidates);
    expect(sorted[0]?.candidate).toContain('typ host');
    expect(sorted[1]?.candidate).toContain('typ srflx');
    expect(sorted[2]?.candidate).toContain('typ relay');
    expect(sorted[2]?.candidate).toContain('UDP');
    expect(sorted[3]?.candidate).toContain('typ relay');
    expect(sorted[3]?.candidate).toContain('TCP');
  });

  it('configures sender scalability mode for AV1/VP9 SVC', async () => {
    const encodings = [{ rid: 'f' }];
    const sender = {
      getParameters: () => ({ encodings }),
      setParameters: vi.fn().mockResolvedValue(undefined),
    } as unknown as RTCRtpSender;

    const result = await configureSenderScalabilityMode(sender, 'L3T3_KEY');
    expect(result).toBe(true);
    expect(encodings[0]).toHaveProperty('scalabilityMode', 'L3T3_KEY');
  });

  it('normalizes WebRTC stats reports with relay ratio calculation', () => {
    const stats = normalizeRtcStats([
      {
        type: 'local-candidate',
        id: 'lc-1',
        candidateType: 'host',
        protocol: 'udp',
      },
      {
        type: 'remote-candidate',
        id: 'rc-1',
        candidateType: 'host',
        protocol: 'udp',
      },
      { type: 'inbound-rtp', bytesReceived: 1200, packetsLost: 3 },
      { type: 'outbound-rtp', bytesSent: 3400 },
      {
        type: 'candidate-pair',
        state: 'succeeded',
        localCandidateId: 'lc-1',
        remoteCandidateId: 'rc-1',
        currentRoundTripTime: 0.035,
      },
    ]);
    expect(stats.bytesReceived).toBe(1200);
    expect(stats.bytesSent).toBe(3400);
    expect(stats.packetsLost).toBe(3);
    expect(stats.roundTripTimeMs).toBe(35);
    expect(stats.activeCandidatePairType).toBe('host');
    expect(stats.relayRatio).toBe(0);

    // Relayed connection test
    const relayStats = normalizeRtcStats([
      {
        type: 'local-candidate',
        id: 'lc-2',
        candidateType: 'relay',
        protocol: 'udp',
      },
      {
        type: 'remote-candidate',
        id: 'rc-2',
        candidateType: 'host',
        protocol: 'udp',
      },
      { type: 'inbound-rtp', bytesReceived: 5000 },
      { type: 'outbound-rtp', bytesSent: 5000 },
      {
        type: 'candidate-pair',
        state: 'succeeded',
        localCandidateId: 'lc-2',
        remoteCandidateId: 'rc-2',
      },
    ]);
    expect(relayStats.activeCandidatePairType).toBe('relay');
    expect(relayStats.relayRatio).toBe(1);
    expect(relayStats.relayBytesReceived).toBe(5000);
  });
});
