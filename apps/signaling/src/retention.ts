import fs from 'node:fs/promises';
import path from 'node:path';
import type { EgressStorageConfig } from './egress.js';

export interface RetentionPolicy {
  defaultRetentionDays: number; // e.g. 30 days
  enforceHardDelete: boolean;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  defaultRetentionDays: 30,
  enforceHardDelete: true,
};

export function calculateExpiryTimestamp(
  startedAt: number,
  retentionDays?: number,
): number | null {
  const days = retentionDays ?? DEFAULT_RETENTION_POLICY.defaultRetentionDays;
  if (days <= 0) return null; // 0 or negative represents indefinite / keep forever
  return startedAt + days * 24 * 60 * 60 * 1000;
}

export interface RecordingMetadata {
  id: string;
  roomCode: string;
  storagePath: string;
  startedAt: number;
  expiresAt: number | null;
  fileSizeBytes?: number | undefined;
  status: 'recording' | 'processing' | 'ready' | 'deleted' | 'failed';
}

export interface PruneResult {
  scannedCount: number;
  prunedCount: number;
  freedBytes: number;
  errors: Array<{ id: string; error: string }>;
}

export async function pruneExpiredRecordings(
  recordings: RecordingMetadata[],
  options?: {
    storage?: EgressStorageConfig | undefined;
    now?: number | undefined;
    onDelete?: ((id: string) => Promise<void>) | undefined;
  },
): Promise<PruneResult> {
  const currentTime = options?.now ?? Date.now();
  let prunedCount = 0;
  let freedBytes = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const rec of recordings) {
    if (rec.status === 'deleted') continue;
    if (rec.expiresAt !== null && rec.expiresAt <= currentTime) {
      try {
        // If local storage, delete file
        if (
          (!options?.storage || options.storage.type === 'local') &&
          rec.storagePath.startsWith('/')
        ) {
          try {
            await fs.unlink(path.resolve(rec.storagePath));
          } catch {
            // Ignore if file was already unlinked
          }
        }

        if (options?.onDelete) {
          await options.onDelete(rec.id);
        }

        rec.status = 'deleted';
        prunedCount += 1;
        freedBytes += rec.fileSizeBytes ?? 0;
      } catch (err) {
        errors.push({
          id: rec.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    scannedCount: recordings.length,
    prunedCount,
    freedBytes,
    errors,
  };
}
