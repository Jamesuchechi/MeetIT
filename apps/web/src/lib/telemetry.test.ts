import { beforeEach, describe, expect, it } from 'vitest';
import {
  getJoinTelemetryStats,
  recordCallJoinAttempt,
  recordCallJoinSuccess,
  recordCallJoinFailure,
  resetJoinTelemetryStats,
  captureException,
  captureMessage,
  initTelemetry,
} from './telemetry';

describe('telemetry & error tracking', () => {
  beforeEach(() => {
    resetJoinTelemetryStats();
  });

  it('initializes join telemetry with default 100% success rate', () => {
    const stats = getJoinTelemetryStats();
    expect(stats.attempts).toBe(0);
    expect(stats.successes).toBe(0);
    expect(stats.failures).toBe(0);
    expect(stats.successRatePct).toBe(100);
  });

  it('records join attempts, successes, and computes success rate accurately', () => {
    recordCallJoinAttempt('abc-defg-hij');
    recordCallJoinAttempt('klm-nopq-rst');
    recordCallJoinSuccess('abc-defg-hij');

    let stats = getJoinTelemetryStats();
    expect(stats.attempts).toBe(2);
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(0);
    expect(stats.successRatePct).toBe(50);

    recordCallJoinSuccess('klm-nopq-rst');
    stats = getJoinTelemetryStats();
    expect(stats.attempts).toBe(2);
    expect(stats.successes).toBe(2);
    expect(stats.successRatePct).toBe(100);
  });

  it('records failures and reflects degraded success rate', () => {
    recordCallJoinAttempt('abc-defg-hij');
    recordCallJoinFailure('abc-defg-hij', 'ROOM_FULL');

    const stats = getJoinTelemetryStats();
    expect(stats.attempts).toBe(1);
    expect(stats.successes).toBe(0);
    expect(stats.failures).toBe(1);
    expect(stats.successRatePct).toBe(0);
  });

  it('safely calls captureException and captureMessage without throwing', () => {
    expect(() => {
      initTelemetry();
      captureException(new Error('Test telemetry error'), { sample: true });
      captureMessage('Test info message', 'info', { user: 'guest' });
    }).not.toThrow();
  });
});
