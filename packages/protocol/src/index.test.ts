import { describe, expect, it } from 'vitest';
import { clientMessageSchema } from './index.js';

describe('clientMessageSchema', () => {
  it('accepts a join envelope with a valid room code', () => {
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'join',
        payload: {
          roomCode: 'abc-defg-hij',
          displayName: 'Ada',
          token: 'guest-token',
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
});
