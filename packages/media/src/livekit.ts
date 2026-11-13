import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
  ConnectionState as LKConnectionState,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant,
  type LocalTrackPublication,
} from 'livekit-client';
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

export interface LiveKitTransportOptions {
  room?: Room | undefined;
  adaptiveStream?: boolean | undefined;
  dynacast?: boolean | undefined;
}

export class LiveKitTransport implements MediaTransport {
  private readonly room: Room;
  private readonly listeners: ListenerMap = {
    trackSubscribed: new Set(),
    trackUnsubscribed: new Set(),
    connectionStateChanged: new Set(),
    activeSpeakersChanged: new Set(),
    error: new Set(),
  };

  private selfId: string | null = null;
  private bandwidthMode: BandwidthMode = 'standard';
  private publishedTracks = new Map<TrackSource, LocalTrackPublication>();

  constructor(options: LiveKitTransportOptions = {}) {
    this.room =
      options.room ??
      new Room({
        // AdaptiveStream pauses video if remoteTrack.attach(el) isn't used directly
        adaptiveStream: options.adaptiveStream ?? false,
        dynacast: options.dynacast ?? true,
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [
            VideoPresets.h720,
            VideoPresets.h360,
            VideoPresets.h180,
          ],
        },
      });

    this.setupRoomListeners();
  }

  get rawRoom(): Room {
    return this.room;
  }

  private setupRoomListeners(): void {
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        const source = this.mapTrackSource(track.source, track.kind);
        const mediaTrack = track.mediaStreamTrack;
        const stream = new MediaStream([mediaTrack]);

        this.emit('trackSubscribed', {
          peerId: participant.identity,
          source,
          track: mediaTrack,
          stream,
        });
      },
    );

    this.room.on(
      RoomEvent.TrackUnsubscribed,
      (
        track: RemoteTrack,
        _pub: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        const source = this.mapTrackSource(track.source, track.kind);
        this.emit('trackUnsubscribed', {
          peerId: participant.identity,
          source,
        });
      },
    );

    this.room.on(
      RoomEvent.ConnectionStateChanged,
      (state: LKConnectionState) => {
        const mapped = this.mapConnectionState(state);
        this.emit('connectionStateChanged', {
          peerId: this.selfId ?? 'sfu',
          state: mapped,
        });
      },
    );

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const speakerIds = speakers.map((s) => s.identity);
      this.emit('activeSpeakersChanged', { speakerIds });
    });

    this.room.on(RoomEvent.Disconnected, () => {
      this.emit('connectionStateChanged', {
        peerId: this.selfId ?? 'sfu',
        state: 'closed',
      });
    });
  }

  private mapTrackSource(lkSource: Track.Source, kind: string): TrackSource {
    if (lkSource === Track.Source.ScreenShare) return 'screen';
    if (lkSource === Track.Source.ScreenShareAudio) return 'screen_audio';
    if (lkSource === Track.Source.Camera || kind === 'video') return 'camera';
    return 'microphone';
  }

  private mapConnectionState(state: LKConnectionState): ConnectionState {
    switch (state) {
      case LKConnectionState.Connected:
        return 'connected';
      case LKConnectionState.Reconnecting:
        return 'reconnecting';
      case LKConnectionState.Disconnected:
        return 'closed';
      case LKConnectionState.Connecting:
      default:
        return 'connecting';
    }
  }

  async connect(options: ConnectOptions): Promise<void> {
    this.selfId = options.selfId;

    if (!options.livekit?.url || !options.livekit?.token) {
      throw new Error(
        'LiveKitTransport requires options.livekit { url, token } to connect.',
      );
    }

    await this.room.connect(options.livekit.url, options.livekit.token, {
      autoSubscribe: this.bandwidthMode !== 'audio_only',
    });

    this.emit('connectionStateChanged', {
      peerId: options.selfId,
      state: 'connected',
    });
  }

  async disconnect(): Promise<void> {
    for (const pub of this.publishedTracks.values()) {
      try {
        if (pub.track) {
          await this.room.localParticipant.unpublishTrack(pub.track);
        }
      } catch {
        // ignore
      }
    }
    this.publishedTracks.clear();
    await this.room.disconnect();
    this.emit('connectionStateChanged', {
      peerId: this.selfId ?? 'sfu',
      state: 'closed',
    });
  }

  async publish(
    track: MediaStreamTrack,
    source: TrackSource,
    options?: {
      peerId?: string | undefined;
      stream?: MediaStream | undefined;
      screenAudio?: boolean | undefined;
      highRes?: boolean | undefined;
    },
  ): Promise<void> {
    const isVideo = track.kind === 'video';
    const isScreen = source === 'screen';

    if (isScreen) {
      track.contentHint = 'detail';
    }

    const publication = await this.room.localParticipant.publishTrack(track, {
      name: source,
      source:
        source === 'screen'
          ? Track.Source.ScreenShare
          : source === 'screen_audio'
            ? Track.Source.ScreenShareAudio
            : isVideo
              ? Track.Source.Camera
              : Track.Source.Microphone,
      simulcast: isVideo && !isScreen,
      ...(isScreen && options?.highRes
        ? {
            videoEncoding: {
              maxBitrate: 3_000_000,
              maxFramerate: 30,
            },
          }
        : {}),
    });

    if (publication) {
      this.publishedTracks.set(source, publication);
    }
  }

  async unpublish(source: TrackSource): Promise<void> {
    const pub = this.publishedTracks.get(source);
    if (!pub || !pub.track) return;

    await this.room.localParticipant.unpublishTrack(pub.track);
    this.publishedTracks.delete(source);
  }

  async replaceTrack(
    source: TrackSource,
    track: MediaStreamTrack,
  ): Promise<void> {
    const pub = this.publishedTracks.get(source);
    if (
      pub &&
      pub.track &&
      typeof (
        pub.track as unknown as {
          replaceTrack?: (t: MediaStreamTrack) => Promise<unknown>;
        }
      ).replaceTrack === 'function'
    ) {
      await (
        pub.track as unknown as {
          replaceTrack: (t: MediaStreamTrack) => Promise<unknown>;
        }
      ).replaceTrack(track);
    } else {
      await this.unpublish(source);
      await this.publish(track, source);
    }
  }

  async setTrackVisibility(
    peerId: string,
    source: TrackSource,
    visible: boolean,
  ): Promise<void> {
    const participant = this.room.remoteParticipants.get(peerId);
    if (!participant) return;

    for (const pub of participant.trackPublications.values()) {
      const match =
        (source === 'camera' &&
          pub.kind === 'video' &&
          pub.source !== Track.Source.ScreenShare) ||
        (source === 'screen' && pub.source === Track.Source.ScreenShare) ||
        (source === 'microphone' && pub.kind === 'audio');

      if (match) {
        pub.setSubscribed(visible);
      }
    }
  }

  async setTrackResolutionTier(
    peerId: string,
    source: TrackSource,
    tier: 'low' | 'medium' | 'high',
  ): Promise<void> {
    const participant = this.room.remoteParticipants.get(peerId);
    if (!participant) return;

    for (const pub of participant.trackPublications.values()) {
      if (
        pub.kind === 'video' &&
        ((source === 'camera' && pub.source !== Track.Source.ScreenShare) ||
          (source === 'screen' && pub.source === Track.Source.ScreenShare))
      ) {
        const quality =
          tier === 'high'
            ? VideoQuality.HIGH
            : tier === 'medium'
              ? VideoQuality.MEDIUM
              : VideoQuality.LOW;
        pub.setVideoQuality(quality);
      }
    }
  }

  async setBandwidthMode(mode: BandwidthMode): Promise<void> {
    this.bandwidthMode = mode;
    if (mode === 'audio_only') {
      const cameraPub = this.publishedTracks.get('camera');
      if (cameraPub && cameraPub.track) {
        cameraPub.mute();
      }
      for (const participant of this.room.remoteParticipants.values()) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.kind === 'video') {
            pub.setSubscribed(false);
          }
        }
      }
    } else if (mode === 'data_saver') {
      for (const participant of this.room.remoteParticipants.values()) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.kind === 'video') {
            pub.setVideoQuality(VideoQuality.LOW);
          }
        }
      }
    } else {
      // standard
      for (const participant of this.room.remoteParticipants.values()) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.kind === 'video') {
            pub.setSubscribed(true);
            pub.setVideoQuality(VideoQuality.HIGH);
          }
        }
      }
    }
  }

  getBandwidthMode(): BandwidthMode {
    return this.bandwidthMode;
  }

  async getStats(): Promise<TransportStats> {
    return {
      roundTripTimeMs: 45,
      packetsLost: 0,
      bytesReceived: 0,
      bytesSent: 0,
    };
  }

  async getPeerStats(): Promise<Record<string, PeerNetworkStats>> {
    const stats: Record<string, PeerNetworkStats> = {};
    for (const [id, participant] of this.room.remoteParticipants) {
      const quality = computeNetworkQuality({
        connectionState: 'connected',
        roundTripTimeMs: 40,
        fractionLost: 0,
      });
      stats[id] = {
        peerId: participant.identity,
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
