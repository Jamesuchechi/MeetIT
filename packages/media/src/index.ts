export type TrackSource = 'camera' | 'microphone' | 'screen' | 'screen_audio';
export type ConnectionState =
  'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export interface ConnectOptions {
  roomId: string;
  selfId: string;
  iceServers: RTCIceServer[];
}

export interface TransportStats {
  roundTripTimeMs?: number;
  packetsLost?: number;
  bytesReceived: number;
  bytesSent: number;
}

export interface TransportEvents {
  connectionStateChanged: { peerId: string; state: ConnectionState };
  error: Error;
}

export interface MediaTransport {
  connect(options: ConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  publish(
    track: MediaStreamTrack,
    source: TrackSource,
    options?: { peerId?: string },
  ): Promise<void>;
  unpublish(source: TrackSource): Promise<void>;
  replaceTrack(source: TrackSource, track: MediaStreamTrack): Promise<void>;
  getStats(): Promise<TransportStats>;
  on<E extends keyof TransportEvents>(
    event: E,
    callback: (payload: TransportEvents[E]) => void,
  ): () => void;
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
