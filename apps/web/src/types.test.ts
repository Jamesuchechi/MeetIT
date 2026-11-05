import { describe, it, expect } from 'vitest';
import { generateRoomCode, normalizeRoomCode } from './types';

describe('Room Code Utilities', () => {
  it('generates a 3-4-3 room code with hyphen separators', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });

  it('normalizes formatted room codes and links correctly', () => {
    expect(normalizeRoomCode('abc-defg-hij')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('ABC-DEFG-HIJ')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('abcdefghij')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('https://meetit.app/m/kpt-wnrb-hxe')).toBe(
      'kpt-wnrb-hxe',
    );
  });

  it('rejects invalid room codes', () => {
    expect(normalizeRoomCode('short')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('1234-5678-901')).toBeNull();
  });
});
