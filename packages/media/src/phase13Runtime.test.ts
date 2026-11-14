import { describe, expect, it } from 'vitest';
import {
  decodeUltraLowBitrateSpeech,
  encodeUltraLowBitrateSpeech,
  generateDidKeyIdentity,
  verifyDidChallenge,
} from './phase13Runtime.js';

describe('Phase 13 runtime primitives', () => {
  it('encodes and decodes <3 kbps neural speech frames', () => {
    const samples = new Float32Array(320);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / 16000);
    }
    const { packet, bitrateBps } = encodeUltraLowBitrateSpeech(samples, 20);
    expect(bitrateBps).toBeLessThan(3000);
    expect(packet.byteLength).toBe(7);

    const decoded = decodeUltraLowBitrateSpeech(packet, 16000);
    expect(decoded.frameMs).toBe(20);
    expect(decoded.samples.length).toBe(320);
    const maxAbs = decoded.samples.reduce(
      (m, v) => Math.max(m, Math.abs(v)),
      0,
    );
    expect(maxAbs).toBeGreaterThan(0.1);
  });

  it('generates did:key identity, signs challenges, and verifies signatures', async () => {
    const identity = await generateDidKeyIdentity();
    expect(identity.did.startsWith('did:key:z')).toBe(true);
    const sig = await identity.signChallenge('room-challenge-123');
    const valid = await verifyDidChallenge(
      identity.publicKeyJwk,
      'room-challenge-123',
      sig,
    );
    expect(valid).toBe(true);

    const tampered = await verifyDidChallenge(
      identity.publicKeyJwk,
      'wrong-challenge',
      sig,
    );
    expect(tampered).toBe(false);
  });
});
