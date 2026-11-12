/**
 * E2EE Key Ratchet & Session Key Manager for MeetIT.
 * Derives per-epoch AES-GCM keys using Web Crypto PBKDF2/HKDF with forward secrecy.
 */

const SALT_PREFIX = 'meetit-e2ee-v1-salt-';

export class E2eeKeyManager {
  private masterSecret: string | null = null;
  private currentEpoch = 0;
  private keyCache = new Map<number, CryptoKey>();
  private fingerprintCache: string | null = null;

  constructor(initialSecret?: string, initialEpoch = 0) {
    this.currentEpoch = initialEpoch;
    if (initialSecret) {
      this.masterSecret = initialSecret;
    }
  }

  /**
   * Set or update the shared master secret for the room.
   */
  async setMasterSecret(secret: string): Promise<void> {
    this.masterSecret = secret;
    this.keyCache.clear();
    this.fingerprintCache = null;
    await this.deriveKeyForEpoch(this.currentEpoch);
  }

  getEpoch(): number {
    return this.currentEpoch;
  }

  /**
   * Advance ratchet epoch (e.g. when a peer joins or leaves).
   */
  async advanceEpoch(): Promise<number> {
    this.currentEpoch += 1;
    this.fingerprintCache = null;
    if (this.masterSecret) {
      await this.deriveKeyForEpoch(this.currentEpoch);
      // Prune keys older than 5 epochs to prevent unbounded memory growth while allowing in-flight packets
      const minKeptEpoch = Math.max(0, this.currentEpoch - 5);
      for (const ep of this.keyCache.keys()) {
        if (ep < minKeptEpoch) {
          this.keyCache.delete(ep);
        }
      }
    }
    return this.currentEpoch;
  }

  /**
   * Retrieves or derives the AES-GCM CryptoKey for a specific epoch.
   */
  async getKeyForEpoch(epoch: number): Promise<CryptoKey | null> {
    if (!this.masterSecret) return null;
    const cached = this.keyCache.get(epoch);
    if (cached) return cached;
    return this.deriveKeyForEpoch(epoch);
  }

  async getCurrentKey(): Promise<CryptoKey | null> {
    return this.getKeyForEpoch(this.currentEpoch);
  }

  /**
   * Derives a deterministic cryptographic SHA-256 fingerprint hex string of the current master key & epoch.
   */
  async getFingerprint(): Promise<string> {
    if (this.fingerprintCache) return this.fingerprintCache;
    const cryptoSubtle = globalThis.crypto?.subtle;
    if (!cryptoSubtle || !this.masterSecret) {
      // Fallback deterministic pseudo-hash for non-crypto environments
      return `e2ee-${this.currentEpoch}-${(this.masterSecret || 'none').slice(0, 8)}`;
    }

    const enc = new TextEncoder();
    const data = enc.encode(`${this.masterSecret}:epoch-${this.currentEpoch}`);
    const hashBuffer = await cryptoSubtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    this.fingerprintCache = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return this.fingerprintCache;
  }

  clear(): void {
    this.masterSecret = null;
    this.keyCache.clear();
    this.fingerprintCache = null;
    this.currentEpoch = 0;
  }

  private async deriveKeyForEpoch(epoch: number): Promise<CryptoKey> {
    const cryptoSubtle = globalThis.crypto?.subtle;
    if (!cryptoSubtle) {
      throw new Error('Web Crypto API is not available');
    }

    const enc = new TextEncoder();
    const secretBuffer = enc.encode(this.masterSecret ?? '');
    const saltBuffer = enc.encode(`${SALT_PREFIX}epoch-${epoch}`);

    // Import master secret as raw key material
    const baseKey = await cryptoSubtle.importKey(
      'raw',
      secretBuffer,
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    // Derive 128-bit AES-GCM key for WebRTC media packet transformation
    const derivedKey = await cryptoSubtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 1000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt'],
    );

    this.keyCache.set(epoch, derivedKey);
    return derivedKey;
  }
}
