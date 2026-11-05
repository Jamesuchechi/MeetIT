import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_REGEX,
  clientMessageSchema,
  computeBackoffMs,
  generateRoomCode,
  normalizeRoomCode,
} from './index.js';

describe('protocol schemas and utilities', () => {
  it('accepts a join envelope with a valid room code and optional selfId', () => {
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'join',
        payload: {
          roomCode: 'abc-defg-hij',
          displayName: 'Ada',
          token: 'guest-token',
          selfId: '550e8400-e29b-41d4-a716-446655440000',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects malformed room codes and unknown message types', () => {
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'join',
        payload: { roomCode: 'bad', displayName: 'Ada', token: 'x' },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ v: 1, type: 'unknown', payload: {} })
        .success,
    ).toBe(false);
  });

  it('generates and normalizes valid room codes', () => {
    const code = generateRoomCode();
    expect(ROOM_CODE_REGEX.test(code)).toBe(true);
    expect(normalizeRoomCode('  ABCDEfghij ')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('https://meetit.app/m/kbt-mpxw-nqy')).toBe(
      'kbt-mpxw-nqy',
    );
    expect(normalizeRoomCode('123')).toBeNull();
  });

  it('computes exponential backoff with bounds and optional jitter', () => {
    expect(computeBackoffMs(0, { baseMs: 500, jitter: false })).toBe(500);
    expect(computeBackoffMs(1, { baseMs: 500, jitter: false })).toBe(1000);
    expect(computeBackoffMs(2, { baseMs: 500, jitter: false })).toBe(2000);
    expect(
      computeBackoffMs(10, { baseMs: 500, maxMs: 10000, jitter: false }),
    ).toBe(10000);

    const jittered = computeBackoffMs(2, {
      baseMs: 1000,
      jitter: true,
      randomFn: () => 0.5,
    });
    expect(jittered).toBe(4000);
  });
});
