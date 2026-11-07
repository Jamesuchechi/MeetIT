import { describe, it, expect, vi } from 'vitest';
import {
  calculateExpiryTimestamp,
  pruneExpiredRecordings,
  DEFAULT_RETENTION_POLICY,
  type RecordingMetadata,
} from './retention.js';

describe('Recording retention & hard delete suite', () => {
  it('calculates expiry timestamp correctly according to retention policy', () => {
    const startedAt = 1_700_000_000_000;
    const expires30Days = calculateExpiryTimestamp(startedAt, 30);
    expect(expires30Days).toBe(startedAt + 30 * 24 * 60 * 60 * 1000);

    const expiresIndefinite = calculateExpiryTimestamp(startedAt, 0);
    expect(expiresIndefinite).toBeNull();

    const expiresDefault = calculateExpiryTimestamp(startedAt);
    expect(expiresDefault).toBe(
      startedAt +
        DEFAULT_RETENTION_POLICY.defaultRetentionDays * 24 * 60 * 60 * 1000,
    );
  });

  it('prunes expired recordings and preserves active recordings', async () => {
    const now = Date.now();
    const onDeleteMock = vi.fn().mockResolvedValue(undefined);

    const recordings: RecordingMetadata[] = [
      {
        id: 'rec-expired-1',
        roomCode: 'abc-defg-hij',
        storagePath: 'recordings/abc-defg-hij/old.mp4',
        startedAt: now - 35 * 24 * 60 * 60 * 1000,
        expiresAt: now - 5 * 24 * 60 * 60 * 1000, // expired 5 days ago
        fileSizeBytes: 50_000_000,
        status: 'ready',
      },
      {
        id: 'rec-active-2',
        roomCode: 'abc-defg-hij',
        storagePath: 'recordings/abc-defg-hij/current.mp4',
        startedAt: now - 2 * 24 * 60 * 60 * 1000,
        expiresAt: now + 28 * 24 * 60 * 60 * 1000, // expires in 28 days
        fileSizeBytes: 20_000_000,
        status: 'ready',
      },
      {
        id: 'rec-indefinite-3',
        roomCode: 'xyz-uvwx-rst',
        storagePath: 'recordings/xyz-uvwx-rst/forever.mp4',
        startedAt: now - 60 * 24 * 60 * 60 * 1000,
        expiresAt: null, // never expires
        fileSizeBytes: 30_000_000,
        status: 'ready',
      },
    ];

    const result = await pruneExpiredRecordings(recordings, {
      now,
      onDelete: onDeleteMock,
    });

    expect(result.scannedCount).toBe(3);
    expect(result.prunedCount).toBe(1);
    expect(result.freedBytes).toBe(50_000_000);
    expect(onDeleteMock).toHaveBeenCalledWith('rec-expired-1');
    expect(onDeleteMock).not.toHaveBeenCalledWith('rec-active-2');
    expect(onDeleteMock).not.toHaveBeenCalledWith('rec-indefinite-3');

    expect(recordings[0]!.status).toBe('deleted');
    expect(recordings[1]!.status).toBe('ready');
    expect(recordings[2]!.status).toBe('ready');
  });
});
