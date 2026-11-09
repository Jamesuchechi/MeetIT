import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AudioEffectProcessor,
  SpatialAudioEngine,
  type AudioEffectsConfig,
} from './audioEffects.js';

describe('AudioEffectProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default audio processing parameters', () => {
    const processor = new AudioEffectProcessor();
    const config = processor.getConfig();

    expect(config.noiseSuppression).toBe('high');
    expect(config.voiceBoost).toBe(true);
    expect(config.feedbackGuard).toBe(true);
    expect(config.spatialAudio).toBe(false);
    expect(config.voiceFirstMode).toBe(false);
  });

  it('updates configuration dynamically', () => {
    const processor = new AudioEffectProcessor({ noiseSuppression: 'off' });
    expect(processor.getConfig().noiseSuppression).toBe('off');

    processor.updateConfig({
      noiseSuppression: 'ai',
      voiceBoost: false,
      feedbackGuard: false,
      spatialAudio: true,
      voiceFirstMode: true,
    });

    const updated = processor.getConfig();
    expect(updated.noiseSuppression).toBe('ai');
    expect(updated.voiceBoost).toBe(false);
    expect(updated.feedbackGuard).toBe(false);
    expect(updated.spatialAudio).toBe(true);
    expect(updated.voiceFirstMode).toBe(true);
  });

  it('attaches and detaches feedback listener', () => {
    const processor = new AudioEffectProcessor({ feedbackGuard: true });
    const listener = vi.fn();

    const unsubscribe = processor.onFeedbackDetected(listener);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('safely handles audio levels and stop when idle', () => {
    const processor = new AudioEffectProcessor();
    expect(processor.getAudioLevel()).toBe(0);
    expect(() => processor.stop()).not.toThrow();
  });
});

describe('SpatialAudioEngine', () => {
  it('manages enabled state', () => {
    const engine = new SpatialAudioEngine(true);
    expect(engine.isEnabled()).toBe(true);

    engine.setEnabled(false);
    expect(engine.isEnabled()).toBe(false);
  });

  it('handles peer detachment and destroy gracefully', () => {
    const engine = new SpatialAudioEngine();
    expect(() => engine.detachPeerStream('peer_123')).not.toThrow();
    expect(() => engine.updatePeerPan('peer_123', 0.8)).not.toThrow();
    expect(() => engine.destroy()).not.toThrow();
  });
});
