import { describe, it, expect, beforeEach } from 'vitest';
import { loadSavedVideoEffects, saveVideoEffects } from './VideoEffectsModal';

describe('VideoEffectsModal store & preferences', () => {
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

  it('loads default video effects preferences when empty', () => {
    const initial = loadSavedVideoEffects();
    expect(initial.effect).toBe('none');
    expect(initial.lowLightEnhancement).toBe(false);
    expect(initial.touchUp).toBe(false);
    expect(initial.autoFraming).toBe(false);
    expect(initial.gestureReactions).toBe(false);
    expect(initial.eyeContactCorrection).toBe(false);
  });

  it('saves and restores video effects preferences', () => {
    saveVideoEffects({
      effect: 'blur-slight',
      lowLightEnhancement: true,
      touchUp: true,
      autoFraming: true,
      gestureReactions: true,
      eyeContactCorrection: true,
      virtualBackgroundUrl: 'data:image/svg+xml;test',
    });

    const saved = loadSavedVideoEffects();
    expect(saved.effect).toBe('blur-slight');
    expect(saved.lowLightEnhancement).toBe(true);
    expect(saved.touchUp).toBe(true);
    expect(saved.autoFraming).toBe(true);
    expect(saved.gestureReactions).toBe(true);
    expect(saved.eyeContactCorrection).toBe(true);
    expect(saved.virtualBackgroundUrl).toBe('data:image/svg+xml;test');
  });
});
