import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLocalRecordings,
  saveLocalRecordings,
  deleteRecording,
  formatFileSize,
  formatRecordingDuration,
  formatRecordingDate,
  formatExpiryCountdown,
  type RecordingItem,
} from './recordingsStore';

describe('recordingsStore unit tests', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    };

    globalThis.window = {
      localStorage: mockStorage as Storage,
    } as unknown as Window & typeof globalThis;
  });

  it('formats file sizes accurately', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024 * 48)).toBe('48.0 MB');
    expect(formatFileSize(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB');
  });

  it('formats recording duration cleanly in MM:SS and HH:MM:SS', () => {
    expect(formatRecordingDuration(0)).toBe('00:00');
    expect(formatRecordingDuration(65)).toBe('01:05');
    expect(formatRecordingDuration(3665)).toBe('01:01:05');
  });

  it('formats recording dates safely', () => {
    const formatted = formatRecordingDate('2026-11-06T10:00:00.000Z');
    expect(formatted).toContain('2026');
  });

  it('formats expiry countdown appropriately', () => {
    expect(formatExpiryCountdown(undefined)).toBeNull();
    const past = new Date(Date.now() - 10000).toISOString();
    expect(formatExpiryCountdown(past)).toBe('Expired');

    const futureDays = new Date(Date.now() + 5 * 86400 * 1000).toISOString();
    expect(formatExpiryCountdown(futureDays)).toBe('Expires in 5d');

    const futureHours = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    expect(formatExpiryCountdown(futureHours)).toBe('Expires in 4h');
  });

  it('returns empty array if localStorage is empty and purges legacy demo recordings', () => {
    const items = loadLocalRecordings();
    expect(items).toEqual([]);

    // Test purging of any previously cached demo recordings
    saveLocalRecordings([
      {
        id: 'rec-demo-legacy',
        roomCode: 'demo-room',
        roomTitle: 'Demo Review',
        startedAt: new Date().toISOString(),
        durationSeconds: 100,
        fileSizeBytes: 500,
        status: 'ready',
        layout: 'grid',
        storagePath: 'dummy',
      },
    ]);
    expect(loadLocalRecordings()).toEqual([]);
  });

  it('saves and deletes recordings in local storage', async () => {
    const testItem: RecordingItem = {
      id: 'rec-test-unique-123',
      roomCode: 'abc-defg-hij',
      roomTitle: 'Test Sprint Review',
      startedAt: new Date().toISOString(),
      durationSeconds: 300,
      fileSizeBytes: 10_000_000,
      status: 'ready',
      layout: 'grid',
      storagePath: 'recordings/abc-defg-hij/test.mp4',
    };

    saveLocalRecordings([testItem]);
    const loaded = loadLocalRecordings();
    expect(loaded.some((r) => r.id === 'rec-test-unique-123')).toBe(true);

    const deleted = await deleteRecording('rec-test-unique-123');
    expect(deleted).toBe(true);

    const afterDelete = loadLocalRecordings();
    expect(afterDelete.some((r) => r.id === 'rec-test-unique-123')).toBe(false);
  });
});
