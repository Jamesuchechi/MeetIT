import { describe, expect, it } from 'vitest';
import {
  computeLightfieldViewOffset,
  createDidKeyDescriptor,
  decodeFaceLandmarks,
  encodeFaceLandmarks,
  packNeuralAudioFrame,
  unpackNeuralAudioFrame,
} from './tier3.js';

describe('Phase 13 Tier 3 R&D primitives', () => {
  it('encodes and decodes photoreal avatar landmarks in 12 bytes', () => {
    const encoded = encodeFaceLandmarks({
      yaw: 12.34,
      pitch: -5.67,
      roll: 1.23,
      mouthOpen: 0.75,
      blinkLeft: 0.1,
      blinkRight: 0.9,
    });
    expect(encoded.byteLength).toBe(12);

    const decoded = decodeFaceLandmarks(encoded);
    expect(decoded.yaw).toBeCloseTo(12.34, 2);
    expect(decoded.pitch).toBeCloseTo(-5.67, 2);
    expect(decoded.mouthOpen).toBeCloseTo(0.75, 2);
  });

  it('packs neural audio frames under 3 kbps', () => {
    const tokens = new Uint8Array([11, 22, 33, 44, 55]);
    const { packet, bitrateBps } = packNeuralAudioFrame(tokens, 20);
    expect(bitrateBps).toBeLessThan(3000);
    const unpacked = unpackNeuralAudioFrame(packet);
    expect(unpacked.frameMs).toBe(20);
    expect(Array.from(unpacked.tokens)).toEqual([11, 22, 33, 44, 55]);
  });

  it('computes lightfield view offsets and did:key descriptors', () => {
    const view = computeLightfieldViewOffset({ x: 0, y: 0, z: 0.5 });
    expect(view.leftEyeX).toBeLessThan(0);
    expect(view.rightEyeX).toBeGreaterThan(0);
    expect(view.parallaxScale).toBe(2);

    const did = createDidKeyDescriptor(
      'z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    );
    expect(did.did).toMatch(/^did:key:z6Mk/);
  });
});
