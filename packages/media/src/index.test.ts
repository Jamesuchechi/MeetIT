import { describe, expect, it, vi } from 'vitest';
import type {
  ClientMessage,
  SignalingChannel,
  SignalingEvents,
} from '@meetit/protocol';
import {
  FakeTransport,
  MeshTransport,
  computeMaxVideoBitrate,
  normalizeRtcStats,
  tuneOpusSdp,
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

describe('Media utilities (Opus SDP, bitrate caps, stats normalizer)', () => {
  it('injects useinbandfec=1 and usedtx=1 into Opus SDP', () => {
    const raw =
      'v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\n';
    const tuned = tuneOpusSdp(raw);
    expect(tuned).toContain('useinbandfec=1');
    expect(tuned).toContain('usedtx=1');
  });

  it('caps video bitrate by participant count', () => {
    expect(computeMaxVideoBitrate(2)).toBe(1_500_000);
    expect(computeMaxVideoBitrate(4)).toBe(800_000);
    expect(computeMaxVideoBitrate(6)).toBe(300_000);
  });

  it('normalizes WebRTC stats reports', () => {
    const stats = normalizeRtcStats([
      { type: 'inbound-rtp', bytesReceived: 1200, packetsLost: 3 },
      { type: 'outbound-rtp', bytesSent: 3400 },
      {
        type: 'candidate-pair',
        state: 'succeeded',
        currentRoundTripTime: 0.035,
      },
    ]);
    expect(stats).toEqual({
      bytesReceived: 1200,
      bytesSent: 3400,
      packetsLost: 3,
      roundTripTimeMs: 35,
    });
  });
});

describe('MeshTransport', () => {
  it('establishes offer/answer, queues early ICE candidates, and replaces tracks', async () => {
    MockRTCPeerConnection.instances = [];
    const peerA = '00000000-0000-4000-8000-000000000001'; // impolite (lower)
    const peerB = '00000000-0000-4000-8000-000000000002'; // polite (higher)
    const sig = new MockSignalingPair(peerA, peerB);

    const meshA = new MeshTransport({
      PeerConnectionImpl:
        MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
    });
    const meshB = new MeshTransport({
      PeerConnectionImpl:
        MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
    });

    await meshB.connect({
      roomId: 'abc-defg-hij',
      selfId: peerB,
      iceServers: [],
      signaling: sig.b,
    });

    // Send ICE candidate from A before offer so B queues it
    sig.a.send({
      v: 1,
      type: 'signal.ice',
      payload: {
        to: peerB,
        candidate: {
          candidate: 'candidate:1 1 UDP 2122252543 10.0.0.1 50000 typ host',
        },
      },
    });

    await meshA.connect({
      roomId: 'abc-defg-hij',
      selfId: peerA,
      iceServers: [],
      signaling: sig.a,
      peerIds: [peerB],
    });

    expect(meshA.isPoliteWith(peerB)).toBe(false);
    expect(meshB.isPoliteWith(peerA)).toBe(true);

    // Allow microtasks for async offer/answer exchange
    await new Promise((r) => setTimeout(r, 20));

    const pcB = MockRTCPeerConnection.instances[0];
    expect(pcB?.remoteDescription?.type).toBe('offer');
    expect(pcB?.localDescription?.type).toBe('answer');
    // Queued ICE candidate was flushed once remoteDescription was set
    expect(pcB?.addedCandidates.length).toBe(1);

    // Publish and replace track on A
    const track1 = { kind: 'video' } as MediaStreamTrack;
    const track2 = { kind: 'video' } as MediaStreamTrack;
    await meshA.publish(track1, 'camera');
    await meshA.replaceTrack('camera', track2);

    const pcA = MockRTCPeerConnection.instances[1];
    expect(pcA?.replacedTracks).toContain(track2);

    const stats = await meshA.getStats();
    expect(stats.bytesReceived).toBe(2048);
    expect(stats.bytesSent).toBe(4096);
    expect(stats.roundTripTimeMs).toBe(42);

    await meshA.disconnect();
    await meshB.disconnect();
  });

  it('triggers ICE restart after grace period when disconnected', async () => {
    vi.useFakeTimers();
    MockRTCPeerConnection.instances = [];
    const peerA = '00000000-0000-4000-8000-000000000001';
    const peerB = '00000000-0000-4000-8000-000000000002';
    const sig = new MockSignalingPair(peerA, peerB);

    const states: string[] = [];
    const meshA = new MeshTransport({
      PeerConnectionImpl:
        MockRTCPeerConnection as unknown as typeof RTCPeerConnection,
      iceRestartGraceMs: 3000,
      renegotiateTimeoutMs: 15000,
    });
    meshA.on('connectionStateChanged', ({ state }) => states.push(state));

    await meshA.connect({
      roomId: 'abc-defg-hij',
      selfId: peerA,
      iceServers: [],
      signaling: sig.a,
      peerIds: [peerB],
    });

    const pcA = MockRTCPeerConnection.instances[0]!;
    pcA.iceConnectionState = 'connected';
    pcA.oniceconnectionstatechange?.();
    expect(states).toContain('connected');

    pcA.iceConnectionState = 'disconnected';
    pcA.oniceconnectionstatechange?.();

    // Advance 3 seconds -> ICE restart
    await vi.advanceTimersByTimeAsync(3100);
    expect(pcA.restartedIceCount).toBe(1);
    expect(states).toContain('reconnecting');

    vi.useRealTimers();
    await meshA.disconnect();
  });
});
