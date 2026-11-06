import { Redis } from 'ioredis';
import type { Room, RoomManager } from './room.js';

export interface RedisAdapterOptions {
  redisUrl?: string | undefined;
  keyPrefix?: string;
  enablePubSub?: boolean;
}

export interface BroadcastPayload {
  nodeId: string;
  roomCode: string;
  senderPeerId?: string;
  excludePeerId?: string;
  message: unknown;
}

/**
 * Redis Adapter supporting Upstash Redis (rediss://), standard Redis (redis://),
 * and clean fallback when no REDIS_URL is provided.
 */
export class RedisAdapter {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private readonly nodeId: string;
  private readonly keyPrefix: string;
  private readonly enabled: boolean;

  constructor(options: RedisAdapterOptions = {}) {
    const rawUrl = options.redisUrl ?? process.env.REDIS_URL;
    this.keyPrefix = options.keyPrefix ?? 'meetit:';
    this.nodeId = Math.random().toString(36).slice(2, 10);
    this.enabled = Boolean(rawUrl && rawUrl.trim().length > 0);

    if (this.enabled && rawUrl) {
      const redisOptions = {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 10) return null;
          return Math.min(times * 100, 3000);
        },
        enableReadyCheck: true,
        // Support Upstash TLS SNI automatically for rediss:// URLs
        tls: rawUrl.startsWith('rediss://') ? {} : undefined,
      };

      try {
        this.publisher = new Redis(rawUrl, redisOptions);
        this.subscriber = new Redis(rawUrl, redisOptions);

        this.publisher.on('error', (err) => {
          console.warn('[RedisAdapter Publisher Error]', err.message);
        });
        this.subscriber.on('error', (err) => {
          console.warn('[RedisAdapter Subscriber Error]', err.message);
        });
      } catch (err) {
        console.warn('[RedisAdapter Init Warning]', err);
        this.publisher = null;
        this.subscriber = null;
      }
    }
  }

  get isConfigured(): boolean {
    return this.enabled && this.publisher !== null;
  }

  /**
   * Subscribes to cluster-wide room broadcast channel
   */
  async subscribeToCluster(
    onBroadcast: (payload: BroadcastPayload) => void,
  ): Promise<void> {
    if (!this.subscriber) return;

    const channelName = `${this.keyPrefix}broadcast`;
    try {
      await this.subscriber.subscribe(channelName);
      this.subscriber.on('message', (channel, message) => {
        if (channel !== channelName) return;
        try {
          const parsed = JSON.parse(message) as BroadcastPayload;
          // Ignore messages originating from this exact local instance
          if (parsed.nodeId === this.nodeId) return;
          onBroadcast(parsed);
        } catch {
          // ignore corrupted payload
        }
      });
    } catch (err) {
      console.warn('[RedisAdapter Subscribe Warning]', err);
    }
  }

  /**
   * Publishes a message to all instances across the cluster
   */
  async publishToCluster(
    payload: Omit<BroadcastPayload, 'nodeId'>,
  ): Promise<void> {
    if (!this.publisher) return;
    try {
      const channelName = `${this.keyPrefix}broadcast`;
      const fullPayload: BroadcastPayload = {
        ...payload,
        nodeId: this.nodeId,
      };
      await this.publisher.publish(channelName, JSON.stringify(fullPayload));
    } catch {
      // non-fatal
    }
  }

  /**
   * Saves room presence metadata with TTL (e.g. 6 hours)
   */
  async setRoomPresence(room: Room): Promise<void> {
    if (!this.publisher) return;
    try {
      const key = `${this.keyPrefix}room:${room.code}`;
      const data = {
        code: room.code,
        title: room.title ?? '',
        locked: room.locked,
        peerCount: room.participantCount,
        updatedAt: Date.now(),
      };
      await this.publisher.set(key, JSON.stringify(data), 'EX', 6 * 3600);
    } catch {
      // non-fatal
    }
  }

  /**
   * Cleans up room presence when all participants leave
   */
  async removeRoomPresence(roomCode: string): Promise<void> {
    if (!this.publisher) return;
    try {
      const key = `${this.keyPrefix}room:${roomCode}`;
      await this.publisher.del(key);
    } catch {
      // non-fatal
    }
  }

  /**
   * Gracefully closes Redis connections
   */
  async close(): Promise<void> {
    if (this.publisher) {
      try {
        await this.publisher.quit();
      } catch {
        this.publisher.disconnect();
      }
      this.publisher = null;
    }
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch {
        this.subscriber.disconnect();
      }
      this.subscriber = null;
    }
  }
}
