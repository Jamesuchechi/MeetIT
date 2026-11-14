import { describe, expect, it } from 'vitest';
import {
  computeOnDeviceEngagement,
  computeProximityAudioGain,
  translateCaptionText,
} from './tier2.js';

describe('Phase 13 Tier 2 media primitives', () => {
  it('computes proximity audio gain, stereo pan, and video visibility', () => {
    const close = computeProximityAudioGain(
      { x: 100, y: 100 },
      { x: 120, y: 100 },
    );
    expect(close.gain).toBeGreaterThan(0.95);
    expect(close.videoVisible).toBe(true);
    expect(close.pan).toBeGreaterThan(0);

    const far = computeProximityAudioGain({ x: 0, y: 0 }, { x: 600, y: 0 });
    expect(far.gain).toBe(0);
    expect(far.videoVisible).toBe(false);
  });

  it('computes on-device engagement score', () => {
    const high = computeOnDeviceEngagement({
      speakingMs: 25_000,
      windowMs: 60_000,
      captionTurns: 5,
      cameraActive: true,
    });
    expect(high.label).toBe('high');
    expect(high.score).toBeGreaterThanOrEqual(65);
  });

  it('provides fallback translation tagging when no endpoint is configured', async () => {
    const out = await translateCaptionText('Hello team', 'es');
    expect(out).toBe('[ES] Hello team');
  });
});
