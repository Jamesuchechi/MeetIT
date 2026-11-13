import type {
  IAgoraRTC,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
  ILocalVideoTrack,
} from 'agora-rtc-sdk-ng';
import {
  computeNetworkQuality,
  type BandwidthMode,
  type ConnectOptions,
  type ConnectionState,
  type MediaTransport,
  type PeerNetworkStats,
  type TrackSource,
  type TransportEvents,
  type TransportStats,
} from './index.js';

type ListenerMap = {
  [K in keyof TransportEvents]: Set<(payload: TransportEvents[K]) => void>;
};

export interface AgoraTransportOptions {
  client?: IAgoraRTCClient | undefined;
  agoraRtc?: IAgoraRTC | undefined;
}

export class AgoraTransport implements MediaTransport {
  private client: IAgoraRTCClient | null;
  private agoraRtc: IAgoraRTC | null;
  private readonly listeners: ListenerMap = {
    trackSubscribed: new Set(),
    trackUnsubscribed: new Set(),
    connectionStateChanged: new Set(),
    activeSpeakersChanged: new Set(),
    error: new Set(),
  };

  private selfId: string | null = null;
  private bandwidthMode: BandwidthMode = 'standard';
  private readonly publishedTracks = new Map<
    TrackSource,
    ILocalAudioTrack | ILocalVideoTrack
  >();

  constructor(options: AgoraTransportOptions = {}) {
    this.agoraRtc = options.agoraRtc ?? null;
    this.client = options.client ?? null;
    if (this.client) {
      this.setupClientListeners(this.client);
    }
  }

  get rawClient(): IAgoraRTCClient | null {
    return this.client;
  }

  private async ensureClient(): Promise<{
    agoraRtc: IAgoraRTC;
    client: IAgoraRTCClient;
  }> {
    if (!this.agoraRtc) {
      const mod = await import('agora-rtc-sdk-ng');
      this.agoraRtc = mod.default ?? (mod as unknown as IAgoraRTC);
    }
    if (!this.client) {
      this.client = this.agoraRtc.createClient({
        mode: 'rtc',
        codec: 'vp8',
      });
      this.setupClientListeners(this.client);
    }
    return { agoraRtc: this.agoraRtc, client: this.client };
  }

  private setupClientListeners(client: IAgoraRTCClient): void {
    client.on(
      'user-published',
      async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        try {
          await client.subscribe(user, mediaType);
          const peerId = String(user.uid);
          if (mediaType === 'video' && user.videoTrack) {
            const mediaTrack = user.videoTrack.getMediaStreamTrack();
            const stream = new MediaStream([mediaTrack]);
            this.emit('trackSubscribed', {
              peerId,
              source: 'camera',
              track: mediaTrack,
              stream,
            });
          } else if (mediaType === 'audio' && user.audioTrack) {
            const mediaTrack = user.audioTrack.getMediaStreamTrack();
            const stream = new MediaStream([mediaTrack]);
            this.emit('trackSubscribed', {
              peerId,
              source: 'microphone',
              track: mediaTrack,
              stream,
            });
          }
        } catch (err) {
          this.emit(
            'error',
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      },
    );

    client.on(
      'user-unpublished',
      (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        const peerId = String(user.uid);
        this.emit('trackUnsubscribed', {
          peerId,
          source: mediaType === 'video' ? 'camera' : 'microphone',
        });
      },
    );

    client.on('user-left', (user: IAgoraRTCRemoteUser) => {
      const peerId = String(user.uid);
      this.emit('trackUnsubscribed', { peerId, source: 'camera' });
      this.emit('trackUnsubscribed', { peerId, source: 'microphone' });
    });

    client.on('connection-state-change', (curState: string) => {
      this.emit('connectionStateChanged', {
        peerId: this.selfId ?? 'sfu',
        state: this.mapConnectionState(curState),
      });
    });

    client.enableAudioVolumeIndicator?.();
    client.on(
      'volume-indicator',
      (volumes: Array<{ uid: string | number; level: number }>) => {
        const speakerIds = volumes
          .filter((v) => v.level > 5)
          .map((v) => String(v.uid));
        this.emit('activeSpeakersChanged', { speakerIds });
      },
    );
  }

  private mapConnectionState(state: string): ConnectionState {
    switch (state) {
      case 'CONNECTED':
        return 'connected';
      case 'RECONNECTING':
        return 'reconnecting';
      case 'CONNECTING':
        return 'connecting';
      case 'DISCONNECTED':
      default:
        return 'closed';
    }
  }

  async connect(options: ConnectOptions): Promise<void> {
    this.selfId = options.selfId;
    if (
      !options.agora?.appId ||
      !options.agora?.channel ||
      !options.agora?.token
    ) {
      throw new Error(
        'AgoraTransport requires options.agora { appId, channel, token, uid } to connect.',
      );
    }

    const { client } = await this.ensureClient();
    await client.join(
      options.agora.appId,
      options.agora.channel,
      options.agora.token,
      options.agora.uid || options.selfId,
    );

    this.emit('connectionStateChanged', {
      peerId: options.selfId,
      state: 'connected',
    });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    for (const track of this.publishedTracks.values()) {
      try {
        await this.client.unpublish(track);
        track.close();
      } catch {
        // ignore cleanup errors
      }
    }
    this.publishedTracks.clear();
    await this.client.leave();
    this.emit('connectionStateChanged', {
      peerId: this.selfId ?? 'sfu',
      state: 'closed',
    });
  }

  async publish(track: MediaStreamTrack, source: TrackSource): Promise<void> {
    const { agoraRtc, client } = await this.ensureClient();
    await this.unpublish(source);

    const localTrack =
      track.kind === 'video'
        ? agoraRtc.createCustomVideoTrack({ mediaStreamTrack: track })
        : agoraRtc.createCustomAudioTrack({ mediaStreamTrack: track });

    await client.publish(localTrack);
    this.publishedTracks.set(source, localTrack);
  }

  async unpublish(source: TrackSource): Promise<void> {
    const existing = this.publishedTracks.get(source);
    if (!existing) return;
    try {
      await this.client?.unpublish(existing);
      existing.close();
    } finally {
      this.publishedTracks.delete(source);
    }
  }

  async replaceTrack(
    source: TrackSource,
    track: MediaStreamTrack,
  ): Promise<void> {
    await this.unpublish(source);
    await this.publish(track, source);
  }

  async setBandwidthMode(mode: BandwidthMode): Promise<void> {
    this.bandwidthMode = mode;
    if (!this.client) return;
    for (const user of this.client.remoteUsers) {
      if (mode === 'audio_only') {
        if (user.hasVideo) {
          await this.client.unsubscribe(user, 'video');
        }
      } else if (mode === 'data_saver') {
        await this.client.setRemoteVideoStreamType(user.uid, 1);
      } else {
        if (user.hasVideo && !user.videoTrack) {
          await this.client.subscribe(user, 'video');
        }
        await this.client.setRemoteVideoStreamType(user.uid, 0);
      }
    }
  }

  getBandwidthMode(): BandwidthMode {
    return this.bandwidthMode;
  }

  async getStats(): Promise<TransportStats> {
    if (!this.client) {
      return {
        roundTripTimeMs: 0,
        packetsLost: 0,
        bytesReceived: 0,
        bytesSent: 0,
      };
    }
    const rtcStats = this.client.getRTCStats();
    return {
      roundTripTimeMs: rtcStats.RTT ?? 45,
      packetsLost: 0,
      bytesReceived: rtcStats.RecvBitrate ?? 0,
      bytesSent: rtcStats.SendBitrate ?? 0,
    };
  }

  async getPeerStats(): Promise<Record<string, PeerNetworkStats>> {
    const stats: Record<string, PeerNetworkStats> = {};
    for (const user of this.client?.remoteUsers ?? []) {
      const peerId = String(user.uid);
      const quality = computeNetworkQuality({
        connectionState: 'connected',
        roundTripTimeMs: 45,
        fractionLost: 0,
      });
      stats[peerId] = {
        peerId,
        packetsLost: 0,
        packetsReceived: 0,
        fractionLost: 0,
        bytesReceived: 0,
        bytesSent: 0,
        quality: quality.quality,
        bars: quality.bars,
      };
    }
    return stats;
  }

  on<E extends keyof TransportEvents>(
    event: E,
    callback: (payload: TransportEvents[E]) => void,
  ): () => void {
    const set = this.listeners[event] as Set<
      (payload: TransportEvents[E]) => void
    >;
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  }

  private emit<E extends keyof TransportEvents>(
    event: E,
    payload: TransportEvents[E],
  ): void {
    const set = this.listeners[event] as Set<
      (payload: TransportEvents[E]) => void
    >;
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
        // ignore subscriber errors
      }
    }
  }
}
