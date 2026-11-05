import { describe, it, expect } from 'vitest';
import { generateRoomCode, normalizeRoomCode } from './types';
import { classifyMediaError } from './lib/devices';
import { computeLayout } from './lib/layout';
import { ActiveSpeakerSelector } from './lib/activeSpeaker';

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

describe('Device Error Classification', () => {
  it('classifies NotAllowedError as permission_denied with recovery steps', () => {
    const res = classifyMediaError({ name: 'NotAllowedError' });
    expect(res.errorKind).toBe('permission_denied');
    expect(res.recoverySteps.length).toBeGreaterThan(0);
  });

  it('classifies NotFoundError as no_device', () => {
    const res = classifyMediaError({ name: 'NotFoundError' });
    expect(res.errorKind).toBe('no_device');
    expect(res.recoverySteps.length).toBeGreaterThan(0);
  });

  it('classifies NotReadableError as hardware_in_use', () => {
    const res = classifyMediaError({ name: 'NotReadableError' });
    expect(res.errorKind).toBe('hardware_in_use');
  });
});

describe('computeLayout (1 to 4 mesh participants)', () => {
  it('computes solo, pair, trio, and quad desktop layouts accurately', () => {
    const solo = computeLayout(1);
    expect(solo.mode).toBe('solo');
    expect(solo.columns).toBe(1);
    expect(solo.rows).toBe(1);
    expect(solo.isRoomFull).toBe(false);

    const pair = computeLayout(2);
    expect(pair.mode).toBe('pair');
    expect(pair.columns).toBe(2);
    expect(pair.rows).toBe(1);
    expect(pair.isRoomFull).toBe(false);

    const trio = computeLayout(3);
    expect(trio.mode).toBe('trio');
    expect(trio.columns).toBe(2);
    expect(trio.rows).toBe(2);
    expect(trio.isRoomFull).toBe(false);

    const quad = computeLayout(4);
    expect(quad.mode).toBe('quad');
    expect(quad.columns).toBe(2);
    expect(quad.rows).toBe(2);
    expect(quad.isRoomFull).toBe(true);
  });

  it('computes spotlight and mobile portrait layouts accurately', () => {
    const portraitPair = computeLayout(2, { isPortrait: true });
    expect(portraitPair.columns).toBe(1);
    expect(portraitPair.rows).toBe(2);

    const spotlight = computeLayout(3, { hasSpotlight: true });
    expect(spotlight.mode).toBe('spotlight');
    expect(spotlight.filmstripCount).toBe(3);
  });
});

describe('ActiveSpeakerSelector with hysteresis', () => {
  it('selects active speaker above threshold and holds during brief pauses', () => {
    const selector = new ActiveSpeakerSelector({
      speakingThreshold: 15,
      switchMargin: 10,
      holdMs: 800,
    });

    // t=1000: peer-a speaks
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 35 },
          { peerId: 'peer-b', level: 5 },
        ],
        1000,
      ),
    ).toBe('peer-a');

    // t=1400: peer-a briefly pauses (level 0), still within 800ms hold window
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 0 },
          { peerId: 'peer-b', level: 5 },
        ],
        1400,
      ),
    ).toBe('peer-a');

    // t=1600: peer-b speaks clearly above threshold + switchMargin -> immediate takeover
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 0 },
          { peerId: 'peer-b', level: 30 },
        ],
        1600,
      ),
    ).toBe('peer-b');

    // t=2600: silence after holdMs expires -> clears active speaker
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 0 },
          { peerId: 'peer-b', level: 0 },
        ],
        2600,
      ),
    ).toBeNull();
  });
});
