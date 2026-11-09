import { describe, it, expect, beforeEach } from 'vitest';
import { loadSavedAudioEffects, saveAudioEffects } from './AudioEffectsModal';

describe('AudioEffectsModal store & preferences', () => {
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

  it('loads default audio preferences when empty', () => {
    const initial = loadSavedAudioEffects();
    expect(initial.noiseSuppression).toBe('high');
    expect(initial.voiceBoost).toBe(true);
    expect(initial.feedbackGuard).toBe(true);
    expect(initial.spatialAudio).toBe(false);
    expect(initial.voiceFirstMode).toBe(false);
  });

  it('saves and restores audio preferences accurately', () => {
    saveAudioEffects({
      noiseSuppression: 'ai',
      voiceBoost: false,
      feedbackGuard: true,
      spatialAudio: true,
      voiceFirstMode: true,
    });

    const saved = loadSavedAudioEffects();
    expect(saved.noiseSuppression).toBe('ai');
    expect(saved.voiceBoost).toBe(false);
    expect(saved.feedbackGuard).toBe(true);
    expect(saved.spatialAudio).toBe(true);
    expect(saved.voiceFirstMode).toBe(true);
  });
});
