export interface TokenBucketOptions {
  capacity?: number;
  refillPerSecond?: number;
  nowFn?: () => number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillMs: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly nowFn: () => number;

  constructor(options: TokenBucketOptions = {}) {
    this.capacity = options.capacity ?? 60;
    this.refillPerSecond = options.refillPerSecond ?? 30;
    this.nowFn = options.nowFn ?? Date.now;
    this.tokens = this.capacity;
    this.lastRefillMs = this.nowFn();
  }

  tryConsume(cost = 1): boolean {
    const now = this.nowFn();
    const elapsedSeconds = Math.max(0, (now - this.lastRefillMs) / 1000);
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsedSeconds * this.refillPerSecond,
      );
      this.lastRefillMs = now;
    }

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}
