import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateHandoffToken,
  getDeviceDescriptor,
  createHandoffState,
  generateHandoffUrl,
  generateQrSvg,
  extractHandoffToken,
  savePendingHandoff,
  getPendingHandoff,
  clearPendingHandoff,
  isHandoffExpired,
} from './deviceHandoffService';

describe('deviceHandoffService', () => {
  beforeEach(() => {
    // Setup in-memory sessionStorage mock for Node test environment
    const storage: Record<string, string> = {};
    (globalThis as any).window = {
      location: { origin: 'https://test.meetit.app' },
      sessionStorage: {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => {
          storage[k] = v;
        },
        removeItem: (k: string) => {
          delete storage[k];
        },
      },
    };
  });

  it('generates valid handoff tokens starting with mkt_handoff_', () => {
    const token = generateHandoffToken();
    expect(token).toMatch(/^mkt_handoff_/);
    expect(token.length).toBeGreaterThan(20);
  });

  it('detects a sensible device descriptor', () => {
    const desc = getDeviceDescriptor();
    expect(typeof desc).toBe('string');
    expect(desc.length).toBeGreaterThan(0);
  });

  it('creates and saves a pending handoff state', () => {
    const state = createHandoffState({
      roomCode: 'abc-defg-hij',
      userId: 'user-123',
      displayName: 'Alice Engineer',
      role: 'host',
      mediaState: {
        audio: true,
        video: false,
        screen: false,
        handRaised: false,
      },
    });

    expect(state.roomCode).toBe('abc-defg-hij');
    expect(state.displayName).toBe('Alice Engineer');
    expect(state.status).toBe('pending');
    expect(state.expiresAt).toBeGreaterThan(Date.now());

    const retrieved = getPendingHandoff();
    expect(retrieved?.handoffToken).toBe(state.handoffToken);
  });

  it('formats full handoff transfer URLs', () => {
    const url = generateHandoffUrl(
      'abc-defg-hij',
      'token-123',
      'https://meetit.app',
    );
    expect(url).toBe('https://meetit.app/m/abc-defg-hij?handoff=token-123');
  });

  it('generates an SVG QR code string', async () => {
    const svg = await generateQrSvg(
      'https://meetit.app/m/abc-defg-hij?handoff=test',
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('extracts handoff token from string URL and URLSearchParams', () => {
    const token1 = extractHandoffToken(
      'https://meetit.app/m/abc?handoff=token-abc-999',
    );
    expect(token1).toBe('token-abc-999');

    const params = new URLSearchParams('handoff=param-token-42&foo=bar');
    const token2 = extractHandoffToken(params);
    expect(token2).toBe('param-token-42');

    const token3 = extractHandoffToken('https://meetit.app/m/abc');
    expect(token3).toBeNull();
  });

  it('correctly reports expired handoffs and cleans up', () => {
    const now = Date.now();
    const state = createHandoffState({
      roomCode: 'xyz-uvw-rst',
      userId: 'u1',
      displayName: 'Bob',
      ttlMs: -1000, // already expired
    });

    expect(isHandoffExpired(state)).toBe(true);
    // getPendingHandoff should clear expired entries
    const retrieved = getPendingHandoff();
    expect(retrieved).toBeNull();

    clearPendingHandoff();
    expect(getPendingHandoff()).toBeNull();
  });
});
