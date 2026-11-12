import { describe, expect, it } from 'vitest';
import {
  calculateMeetingCost,
  evaluateRelayHealth,
  DEFAULT_COST_RATES,
} from './costCalculator';

describe('Phase 12 Scale, Reliability & Cost: Cost Calculator', () => {
  it('calculates meeting cost breakdown and cost per participant minute', () => {
    // 30 minute call with 4 participants = 120 participant-minutes
    // 1 GB total traffic, 0.1 GB relayed (10% relay ratio)
    const cost = calculateMeetingCost({
      durationSeconds: 1800,
      participantCount: 4,
      bytesReceived: 500 * 1024 * 1024,
      bytesSent: 500 * 1024 * 1024,
      relayBytes: 100 * 1024 * 1024,
    });

    expect(cost.participantMinutes).toBe(120);
    expect(cost.relayRatioPct).toBe(10);
    expect(cost.sfuComputeCostUsd).toBeCloseTo(
      120 * DEFAULT_COST_RATES.sfuComputePerParticipantMinuteUsd,
      4,
    );
    expect(cost.turnRelayCostUsd).toBeGreaterThan(0);
    expect(cost.totalCostUsd).toBeGreaterThan(0);
    expect(cost.costPerParticipantMinuteUsd).toBeGreaterThan(0);
    expect(cost.isP2PBypassEligible).toBe(false);
  });

  it('detects 1:1 P2P direct bypass eligibility and computes savings', () => {
    // 2-person meeting with active P2P bypass
    const p2pCost = calculateMeetingCost({
      durationSeconds: 3600,
      participantCount: 2,
      bytesReceived: 500 * 1024 * 1024,
      bytesSent: 500 * 1024 * 1024,
      p2pBypassActive: true,
    });

    expect(p2pCost.isP2PBypassEligible).toBe(true);
    expect(p2pCost.p2pBypassActive).toBe(true);
    // SFU compute & direct egress should be 0 because media goes direct P2P
    expect(p2pCost.sfuComputeCostUsd).toBe(0);
    expect(p2pCost.sfuEgressCostUsd).toBe(0);
    expect(p2pCost.estimatedP2PSavingsUsd).toBeGreaterThan(0);
  });

  it('evaluates relay health states accurately', () => {
    const optimal = evaluateRelayHealth(8.5);
    expect(optimal.status).toBe('optimal');
    expect(optimal.label).toContain('Optimal');

    const elevated = evaluateRelayHealth(22.0);
    expect(elevated.status).toBe('elevated');

    const critical = evaluateRelayHealth(45.0);
    expect(critical.status).toBe('critical');
    expect(critical.recommendation).toContain('TURN relay');
  });
});
