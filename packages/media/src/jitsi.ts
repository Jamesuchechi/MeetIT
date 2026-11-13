import {
  computeNetworkQuality,
  type BandwidthMode,
  type ConnectOptions,
  type MediaTransport,
  type PeerNetworkStats,
  type TrackSource,
  type TransportEvents,
  type TransportStats,
} from './index.js';

type ListenerMap = {
  [K in keyof TransportEvents]: Set<(payload: TransportEvents[K]) => void>;
};

interface JitsiTrackLike {
  getType(): 'audio' | 'video';
  getParticipantId(): string;
  getTrack(): MediaStreamTrack;
  isLocal(): boolean;
  getVideoType?(): string | null;
  dispose?(): Promise<void> | void;
}

interface JitsiConferenceLike {
  on(event: string, handler: (...args: any[]) => void): void;
  join(): void;
  leave(): Promise<void>;
  addTrack(track: JitsiTrackLike): Promise<void>;
  removeTrack(track: JitsiTrackLike): Promise<void>;
  getParticipants(): Array<{ getId(): string }>;
}

interface JitsiConnectionLike {
  addEventListener(event: string, handler: (...args: any[]) => void): void;
  connect(): void;
  disconnect(): Promise<void>;
  initJitsiConference(
    roomName: string,
    options: Record<string, unknown>,
  ): JitsiConferenceLike;
}

interface JitsiMeetJSLike {
  init(options?: Record<string, unknown>): void;
  setLogLevel?(level: string): void;
  JitsiConnection: new (
    appID: string | null,
    token: string | undefined,
    options: Record<string, unknown>,
  ) => JitsiConnectionLike;
  events: {
    connection: {
      CONNECTION_ESTABLISHED: string;
      CONNECTION_FAILED: string;
      CONNECTION_DISCONNECTED: string;
    };
    conference: {
      TRACK_ADDED: string;
      TRACK_REMOVED: string;
      CONFERENCE_JOINED: string;
      CONFERENCE_FAILED: string;
      DOMINANT_SPEAKER_CHANGED: string;
    };
  };
  createLocalTrackFromMediaStreamTrack?(
    track: MediaStreamTrack,
  ): Promise<JitsiTrackLike>;
}

export interface JitsiTransportOptions {
  jitsiMeetJS?: JitsiMeetJSLike | undefined;
}

export class JitsiTransport implements MediaTransport {
  private readonly listeners: ListenerMap = {
    trackSubscribed: new Set(),
    trackUnsubscribed: new Set(),
    connectionStateChanged: new Set(),
    activeSpeakersChanged: new Set(),
    error: new Set(),
  };

  private jitsiMeetJS: JitsiMeetJSLike | null;
  private connection: JitsiConnectionLike | null = null;
  private conference: JitsiConferenceLike | null = null;
  private selfId: string | null = null;
  private bandwidthMode: BandwidthMode = 'standard';
  private readonly publishedTracks = new Map<TrackSource, JitsiTrackLike>();
  private readonly remoteTrackSources = new Map<string, TrackSource>();

  constructor(options: JitsiTransportOptions = {}) {
    this.jitsiMeetJS = options.jitsiMeetJS ?? null;
  }

  private async loadJitsiMeetJS(): Promise<JitsiMeetJSLike> {
    if (this.jitsiMeetJS) return this.jitsiMeetJS;
    const mod = (await import('lib-jitsi-meet')) as unknown as {
      default?: JitsiMeetJSLike;
    } & JitsiMeetJSLike;
    const lib = mod.default ?? mod;
    lib.setLogLevel?.('ERROR');
    lib.init({ disableAudioLevels: false });
    this.jitsiMeetJS = lib;
    return lib;
  }

  private mapTrackSource(track: JitsiTrackLike): TrackSource {
    if (track.getType() === 'video') {
      return track.getVideoType?.() === 'desktop' ? 'screen' : 'camera';
    }
    return 'microphone';
  }

  async connect(options: ConnectOptions): Promise<void> {
    this.selfId = options.selfId;
    if (!options.jitsi?.domain || !options.jitsi?.roomName) {
      throw new Error(
        'JitsiTransport requires options.jitsi { domain, roomName } to connect.',
      );
    }

    const JitsiMeetJS = await this.loadJitsiMeetJS();
    const { domain, roomName, jwt, mucDomain, serviceUrl } = options.jitsi;

    await new Promise<void>((resolve, reject) => {
      const conn = new JitsiMeetJS.JitsiConnection(null, jwt, {
        hosts: {
          domain,
          muc: mucDomain ?? `conference.${domain}`,
        },
        serviceUrl:
          serviceUrl ??
          `wss://${domain}/xmpp-websocket?room=${encodeURIComponent(roomName)}`,
      });
      this.connection = conn;

      conn.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        () => {
          const conf = conn.initJitsiConference(roomName, {
            openBridgeChannel: true,
          });
          this.conference = conf;

          conf.on(
            JitsiMeetJS.events.conference.TRACK_ADDED,
            (track: JitsiTrackLike) => {
              if (track.isLocal()) return;
              const peerId = track.getParticipantId();
              const source = this.mapTrackSource(track);
              const mediaTrack = track.getTrack();
              this.remoteTrackSources.set(mediaTrack.id, source);
              const stream = new MediaStream([mediaTrack]);
              this.emit('trackSubscribed', {
                peerId,
                source,
                track: mediaTrack,
                stream,
              });
            },
          );

          conf.on(
            JitsiMeetJS.events.conference.TRACK_REMOVED,
            (track: JitsiTrackLike) => {
              if (track.isLocal()) return;
              const peerId = track.getParticipantId();
              const mediaTrack = track.getTrack();
              const source =
                this.remoteTrackSources.get(mediaTrack.id) ??
                this.mapTrackSource(track);
              this.remoteTrackSources.delete(mediaTrack.id);
              this.emit('trackUnsubscribed', { peerId, source });
            },
          );

          conf.on(
            JitsiMeetJS.events.conference.DOMINANT_SPEAKER_CHANGED,
            (speakerId: string) => {
              this.emit('activeSpeakersChanged', {
                speakerIds: speakerId ? [speakerId] : [],
              });
            },
          );

          conf.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () => {
            this.emit('connectionStateChanged', {
              peerId: options.selfId,
              state: 'connected',
            });
            resolve();
          });

          conf.on(
            JitsiMeetJS.events.conference.CONFERENCE_FAILED,
            (err: unknown) => {
              const error = err instanceof Error ? err : new Error(String(err));
              this.emit('error', error);
              reject(error);
            },
          );

          conf.join();
        },
      );

      conn.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        (err: unknown) => {
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit('connectionStateChanged', {
            peerId: options.selfId,
            state: 'failed',
          });
          this.emit('error', error);
          reject(error);
        },
      );

      conn.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        () => {
          this.emit('connectionStateChanged', {
            peerId: options.selfId,
            state: 'closed',
          });
        },
      );

      conn.connect();
    });
  }

  async disconnect(): Promise<void> {
    for (const track of this.publishedTracks.values()) {
      try {
        await this.conference?.removeTrack(track);
        await track.dispose?.();
      } catch {
        // ignore cleanup errors
      }
    }
    this.publishedTracks.clear();

    try {
      await this.conference?.leave();
    } catch {
      // ignore
    }
    try {
      await this.connection?.disconnect();
    } catch {
      // ignore
    }
    this.conference = null;
    this.connection = null;
    this.emit('connectionStateChanged', {
      peerId: this.selfId ?? 'sfu',
      state: 'closed',
    });
  }

  async publish(track: MediaStreamTrack, source: TrackSource): Promise<void> {
    if (!this.conference || !this.jitsiMeetJS) return;
    await this.unpublish(source);

    if (this.jitsiMeetJS.createLocalTrackFromMediaStreamTrack) {
      const jitsiTrack =
        await this.jitsiMeetJS.createLocalTrackFromMediaStreamTrack(track);
      await this.conference.addTrack(jitsiTrack);
      this.publishedTracks.set(source, jitsiTrack);
    }
  }

  async unpublish(source: TrackSource): Promise<void> {
    const existing = this.publishedTracks.get(source);
    if (!existing) return;
    try {
      await this.conference?.removeTrack(existing);
      await existing.dispose?.();
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
  }

  getBandwidthMode(): BandwidthMode {
    return this.bandwidthMode;
  }

  async getStats(): Promise<TransportStats> {
    return {
      roundTripTimeMs: 50,
      packetsLost: 0,
      bytesReceived: 0,
      bytesSent: 0,
    };
  }

  async getPeerStats(): Promise<Record<string, PeerNetworkStats>> {
    const stats: Record<string, PeerNetworkStats> = {};
    for (const participant of this.conference?.getParticipants() ?? []) {
      const peerId = participant.getId();
      const quality = computeNetworkQuality({
        connectionState: 'connected',
        roundTripTimeMs: 50,
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
