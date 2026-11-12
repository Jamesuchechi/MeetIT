/**
 * Cost per meeting minute & relay ratio optimization calculator.
 * Tracks SFU egress, TURN relay bandwidth, compute allocation, and 1:1 P2P bypass savings.
 */

export interface MeetingCostBreakdown {
  durationSeconds: number;
  participantCount: number;
  participantMinutes: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  totalBytes: number;
  relayBytes: number;
  directBytes: number;
  relayRatioPct: number;
  // Cost breakdown in USD
  sfuComputeCostUsd: number;
  sfuEgressCostUsd: number;
  turnRelayCostUsd: number;
  signalingCostUsd: number;
  transcriptionCostUsd: number;
  totalCostUsd: number;
  costPerParticipantMinuteUsd: number;
  // P2P 1:1 Direct Bypass Savings
  isP2PBypassEligible: boolean;
  p2pBypassActive: boolean;
  estimatedP2PSavingsUsd: number;
  // Carbon
  carbonGrams: number;
}

export interface CostCalculatorRates {
  sfuComputePerParticipantMinuteUsd: number; // e.g. $0.0004
  sfuEgressPerGbUsd: number; // e.g. $0.05
  turnRelayPerGbUsd: number; // e.g. $0.15
  signalingPerParticipantMinuteUsd: number; // e.g. $0.00005
  transcriptionPerMinuteUsd: number; // e.g. $0.006
}

export const DEFAULT_COST_RATES: CostCalculatorRates = {
  sfuComputePerParticipantMinuteUsd: 0.0004,
  sfuEgressPerGbUsd: 0.05,
  turnRelayPerGbUsd: 0.15,
  signalingPerParticipantMinuteUsd: 0.00005,
  transcriptionPerMinuteUsd: 0.006,
};

/**
 * Calculates meeting cost breakdown, relay ratio, and 1:1 P2P bypass savings.
 */
export function calculateMeetingCost(options: {
  durationSeconds: number;
  participantCount: number;
  bytesReceived: number;
  bytesSent: number;
  relayBytes?: number;
  transcriptionActive?: boolean;
  p2pBypassActive?: boolean;
  rates?: Partial<CostCalculatorRates>;
}): MeetingCostBreakdown {
  const {
    durationSeconds,
    participantCount,
    bytesReceived,
    bytesSent,
    transcriptionActive = false,
    p2pBypassActive = false,
  } = options;

  const rates: CostCalculatorRates = {
    ...DEFAULT_COST_RATES,
    ...(options.rates ?? {}),
  };

  const totalBytes = bytesReceived + bytesSent;
  const relayBytes = Math.min(totalBytes, Math.max(0, options.relayBytes ?? 0));
  const directBytes = Math.max(0, totalBytes - relayBytes);

  const relayRatioPct =
    totalBytes > 0 ? Math.round((relayBytes / totalBytes) * 1000) / 10 : 0;

  const participantMinutes =
    Math.round((durationSeconds / 60) * Math.max(1, participantCount) * 10) /
    10;

  // Bandwidth in Gigabytes
  const directGb = directBytes / (1024 * 1024 * 1024);
  const relayGb = relayBytes / (1024 * 1024 * 1024);

  // If 1:1 P2P bypass is active, SFU compute and direct SFU egress are 0
  const isP2PBypassEligible = participantCount === 2;
  const effectiveP2P = isP2PBypassEligible && p2pBypassActive;

  const sfuComputeCostUsd = effectiveP2P
    ? 0
    : participantMinutes * rates.sfuComputePerParticipantMinuteUsd;

  const sfuEgressCostUsd = effectiveP2P
    ? 0
    : directGb * rates.sfuEgressPerGbUsd;

  const turnRelayCostUsd = relayGb * rates.turnRelayPerGbUsd;

  const signalingCostUsd =
    participantMinutes * rates.signalingPerParticipantMinuteUsd;

  const transcriptionCostUsd = transcriptionActive
    ? (durationSeconds / 60) * rates.transcriptionPerMinuteUsd
    : 0;

  const totalCostUsd =
    sfuComputeCostUsd +
    sfuEgressCostUsd +
    turnRelayCostUsd +
    signalingCostUsd +
    transcriptionCostUsd;

  const costPerParticipantMinuteUsd =
    participantMinutes > 0 ? totalCostUsd / participantMinutes : 0;

  // Estimated savings achieved via P2P direct bypass
  const hypotheticalSfuCost =
    participantMinutes * rates.sfuComputePerParticipantMinuteUsd +
    directGb * rates.sfuEgressPerGbUsd;
  const estimatedP2PSavingsUsd = effectiveP2P ? hypotheticalSfuCost : 0;

  // Estimated carbon footprint in grams CO2
  const carbonGrams =
    Math.round(
      ((totalBytes / (1024 * 1024)) * 0.0006 + participantMinutes * 0.0002) *
        250 *
        10,
    ) / 10;

  return {
    durationSeconds,
    participantCount,
    participantMinutes,
    totalBytesSent: bytesSent,
    totalBytesReceived: bytesReceived,
    totalBytes,
    relayBytes,
    directBytes,
    relayRatioPct,
    sfuComputeCostUsd,
    sfuEgressCostUsd,
    turnRelayCostUsd,
    signalingCostUsd,
    transcriptionCostUsd,
    totalCostUsd,
    costPerParticipantMinuteUsd,
    isP2PBypassEligible,
    p2pBypassActive: effectiveP2P,
    estimatedP2PSavingsUsd,
    carbonGrams,
  };
}

/**
 * Evaluates relay ratio threshold to alert operators of sub-optimal routing.
 */
export function evaluateRelayHealth(relayRatioPct: number): {
  status: 'optimal' | 'elevated' | 'critical';
  label: string;
  recommendation: string;
} {
  if (relayRatioPct <= 15) {
    return {
      status: 'optimal',
      label: 'Optimal (<15% Relay)',
      recommendation:
        'Direct UDP/STUN candidate pairs active for majority of streams.',
    };
  }
  if (relayRatioPct <= 35) {
    return {
      status: 'elevated',
      label: 'Elevated (15-35% Relay)',
      recommendation:
        'Inspect symmetric NAT or corporate firewall UDP blocking on endpoints.',
    };
  }
  return {
    status: 'critical',
    label: 'Critical (>35% Relay)',
    recommendation:
      'Excessive TURN relay bandwidth. Check for UDP port 3478 blocking or VPN tunnels.',
  };
}
