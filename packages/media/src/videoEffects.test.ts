import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VideoEffectProcessor,
  DEFAULT_VIRTUAL_BACKGROUNDS,
  type VideoEffectsConfig,
} from './videoEffects.js';

describe('VideoEffectProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default config and presets', () => {
    const processor = new VideoEffectProcessor();
    const config = processor.getConfig();

    expect(config.effect).toBe('none');
    expect(config.lowLightEnhancement).toBe(false);
    expect(config.touchUp).toBe(false);
    expect(config.autoFraming).toBe(false);
    expect(config.gestureReactions).toBe(false);
    expect(config.eyeContactCorrection).toBe(false);

    expect(DEFAULT_VIRTUAL_BACKGROUNDS.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_VIRTUAL_BACKGROUNDS[0]?.id).toBe('office');
  });

  it('updates configuration dynamically', () => {
    const processor = new VideoEffectProcessor({ effect: 'blur-slight' });
    expect(processor.getConfig().effect).toBe('blur-slight');

    const testBgUrl = DEFAULT_VIRTUAL_BACKGROUNDS[1]?.dataUrl ?? '';
    processor.updateConfig({
      effect: 'virtual-image',
      virtualBackgroundUrl: testBgUrl,
      lowLightEnhancement: true,
      autoFraming: true,
      eyeContactCorrection: true,
    });

    const updated = processor.getConfig();
    expect(updated.effect).toBe('virtual-image');
    expect(updated.virtualBackgroundUrl).toBe(testBgUrl);
    expect(updated.lowLightEnhancement).toBe(true);
    expect(updated.autoFraming).toBe(true);
    expect(updated.eyeContactCorrection).toBe(true);
  });

  it('attaches and detaches gesture listener', () => {
    const processor = new VideoEffectProcessor({ gestureReactions: true });
    const listener = vi.fn();

    const unsubscribe = processor.onGesture(listener);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('cleans up resources on stop', () => {
    const processor = new VideoEffectProcessor();
    expect(() => processor.stop()).not.toThrow();
  });
});
