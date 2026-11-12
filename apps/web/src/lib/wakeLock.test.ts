import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestScreenWakeLock,
  releaseScreenWakeLock,
  isScreenWakeLockActive,
} from './wakeLock';

describe('wakeLock service', () => {
  let releaseMock: ReturnType<typeof vi.fn>;
  let requestMock: ReturnType<typeof vi.fn>;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    releaseMock = vi.fn().mockResolvedValue(undefined);
    requestMock = vi.fn().mockResolvedValue({
      released: false,
      release: releaseMock,
      addEventListener: vi.fn(),
    });

    (globalThis as any).window = {};
    (globalThis as any).document = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      value: {
        request: requestMock,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(async () => {
    await releaseScreenWakeLock();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    vi.restoreAllMocks();
  });

  it('requests screen wake lock successfully when supported', async () => {
    const success = await requestScreenWakeLock();
    expect(success).toBe(true);
    expect(requestMock).toHaveBeenCalledWith('screen');
    expect(isScreenWakeLockActive()).toBe(true);
  });

  it('handles release cleanly', async () => {
    await requestScreenWakeLock();
    expect(isScreenWakeLockActive()).toBe(true);

    await releaseScreenWakeLock();
    expect(releaseMock).toHaveBeenCalled();
    expect(isScreenWakeLockActive()).toBe(false);
  });

  it('returns false gracefully when wakeLock API is unsupported', async () => {
    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const success = await requestScreenWakeLock();
    expect(success).toBe(false);
    expect(isScreenWakeLockActive()).toBe(false);
  });
});
