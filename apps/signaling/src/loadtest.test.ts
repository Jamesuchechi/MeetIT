import { describe, expect, it } from 'vitest';
import { runLoadTest } from './loadtest.js';

describe('LiveKit Load Test Suite', () => {
  it('benchmarks token generation, TTFF, and CPU for 100 participants (30 publishers)', async () => {
    const results = await runLoadTest({
      totalParticipants: 100,
      publishersCount: 30,
      apiKey: 'testkey',
      apiSecret: 'secret_longer_than_32_characters_123456789',
      livekitUrl: 'wss://test.meetit.livekit.cloud',
    });

    expect(results.totalParticipants).toBe(100);
    expect(results.publishersCount).toBe(30);
    expect(results.subscribersCount).toBe(70);
    expect(results.errors).toHaveLength(0);

    // Assert Phase 4 Exit Criteria
    expect(results.simulatedTtffMs.p75).toBeLessThan(5000); // TTFF < 5s
    expect(results.cpuUsagePct).toBeLessThan(70); // CPU < 70%
    expect(results.passedExitCriteria).toBe(true);
  });
});
