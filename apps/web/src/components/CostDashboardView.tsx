import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Leaf,
  Activity,
  ShieldCheck,
  AlertTriangle,
  TrendingDown,
  Server,
  Globe,
  Radio,
  Zap,
  Sliders,
} from 'lucide-react';
import {
  calculateMeetingCost,
  evaluateRelayHealth,
  DEFAULT_COST_RATES,
} from '../lib/costCalculator';
import {
  REGION_CARBON_INTENSITY,
  estimateMeetingCarbonFootprint,
} from '../lib/regions';

export interface CostDashboardViewProps {
  onToast?: (msg: string) => void;
}

export const CostDashboardView: React.FC<CostDashboardViewProps> = ({
  onToast,
}) => {
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('7d');

  // Interactive Simulator State
  const [simDurationMins, setSimDurationMins] = useState(45);
  const [simParticipants, setSimParticipants] = useState(4);
  const [simRelayPct, setSimRelayPct] = useState(12);
  const [simP2PBypass, setSimP2PBypass] = useState(true);

  // Time-aggregated platform metrics
  const aggregatedStats = useMemo(() => {
    switch (timeRange) {
      case 'today':
        return {
          totalCost: 3.42,
          participantMinutes: 4850,
          totalEgressGb: 68.4,
          relayEgressGb: 8.2,
          p2pSavings: 12.8,
          carbonAvoidedKg: 14.6,
          activeRoomsCount: 42,
        };
      case '30d':
        return {
          totalCost: 112.5,
          participantMinutes: 168400,
          totalEgressGb: 2340.0,
          relayEgressGb: 260.0,
          p2pSavings: 420.0,
          carbonAvoidedKg: 512.0,
          activeRoomsCount: 1420,
        };
      case '7d':
      default:
        return {
          totalCost: 28.65,
          participantMinutes: 39200,
          totalEgressGb: 546.0,
          relayEgressGb: 62.0,
          p2pSavings: 98.4,
          carbonAvoidedKg: 118.5,
          activeRoomsCount: 310,
        };
    }
  }, [timeRange]);

  const globalRelayRatio = Math.round(
    (aggregatedStats.relayEgressGb / aggregatedStats.totalEgressGb) * 100,
  );
  const relayHealth = evaluateRelayHealth(globalRelayRatio);

  // Simulated Meeting Calculation
  const simBytesPerMin = 18 * 1024 * 1024; // ~18MB / minute across audio + 720p video
  const simTotalBytes = simDurationMins * simParticipants * simBytesPerMin;
  const simRelayBytes = Math.round(simTotalBytes * (simRelayPct / 100));

  const simResult = useMemo(() => {
    return calculateMeetingCost({
      durationSeconds: simDurationMins * 60,
      participantCount: simParticipants,
      bytesReceived: Math.round(simTotalBytes / 2),
      bytesSent: Math.round(simTotalBytes / 2),
      relayBytes: simRelayBytes,
      p2pBypassActive: simParticipants === 2 && simP2PBypass,
    });
  }, [
    simDurationMins,
    simParticipants,
    simTotalBytes,
    simRelayBytes,
    simP2PBypass,
  ]);

  const simCarbon = useMemo(() => {
    return estimateMeetingCarbonFootprint(
      simDurationMins * 60,
      simParticipants,
      simTotalBytes,
      'us-west',
    );
  }, [simDurationMins, simParticipants, simTotalBytes]);

  const formatCurrency = (amt: number): string => {
    if (amt < 0.01 && amt > 0) return `$${amt.toFixed(4)}`;
    return `$${amt.toFixed(2)}`;
  };

  return (
    <div className="cost-view-container">
      {/* Page Header */}
      <div className="cost-view-header">
        <div className="cost-view-header-left">
          <div className="cost-view-title-row">
            <h1 className="cost-view-title">Cost &amp; Scale Telemetry</h1>
            <span className="cost-view-badge">Live Edge</span>
          </div>
          <p className="cost-view-subtitle">
            Real-time platform unit economics, TURN relay efficiency, 1:1 P2P
            bypass savings, and carbon impact.
          </p>
        </div>

        {/* Time Filter Pills */}
        <div className="cost-view-time-filters">
          <button
            type="button"
            onClick={() => setTimeRange('today')}
            className={`cost-view-time-btn ${timeRange === 'today' ? 'active' : ''}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('7d')}
            className={`cost-view-time-btn ${timeRange === '7d' ? 'active' : ''}`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('30d')}
            className={`cost-view-time-btn ${timeRange === '30d' ? 'active' : ''}`}
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {/* Top 4 Key Metric Cards */}
      <div className="cost-view-kpi-grid">
        {/* Card 1: Total Cost */}
        <div className="cost-view-kpi-card">
          <div className="cost-view-kpi-top">
            <span>Estimated Media Cost</span>
            <div className="cost-view-kpi-icon green">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="cost-view-kpi-value-row">
            <span className="cost-view-kpi-value">
              {formatCurrency(aggregatedStats.totalCost)}
            </span>
          </div>
          <div className="cost-view-kpi-sub">
            <span
              style={{
                fontFamily: 'monospace',
                color: '#22c55e',
                fontWeight: 600,
              }}
            >
              {(
                (aggregatedStats.totalCost /
                  aggregatedStats.participantMinutes) *
                100
              ).toFixed(3)}
              ¢
            </span>{' '}
            <span>/ participant-minute</span>
          </div>
        </div>

        {/* Card 2: Relay Ratio Optimization */}
        <div className="cost-view-kpi-card">
          <div className="cost-view-kpi-top">
            <span>TURN Relay Ratio</span>
            <div
              className={`cost-view-kpi-icon ${
                relayHealth.status === 'optimal' ? 'green' : 'amber'
              }`}
            >
              <Radio size={16} />
            </div>
          </div>
          <div className="cost-view-kpi-value-row">
            <span className="cost-view-kpi-value">{globalRelayRatio}%</span>
            <span
              className="cost-view-badge"
              style={{
                background:
                  relayHealth.status === 'optimal'
                    ? 'rgba(34, 197, 94, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                color: relayHealth.status === 'optimal' ? '#22c55e' : '#f59e0b',
                borderColor:
                  relayHealth.status === 'optimal'
                    ? 'rgba(34, 197, 94, 0.25)'
                    : 'rgba(245, 158, 11, 0.25)',
              }}
            >
              {relayHealth.status === 'optimal' ? 'Optimal' : 'Elevated'}
            </span>
          </div>
          <div className="cost-view-kpi-sub">
            <span>
              {aggregatedStats.relayEgressGb} GB relayed of{' '}
              {aggregatedStats.totalEgressGb} GB
            </span>
          </div>
        </div>

        {/* Card 3: 1:1 P2P Direct Bypass Savings */}
        <div className="cost-view-kpi-card">
          <div className="cost-view-kpi-top">
            <span>1:1 P2P Bypass Savings</span>
            <div className="cost-view-kpi-icon blue">
              <TrendingDown size={16} />
            </div>
          </div>
          <div className="cost-view-kpi-value-row">
            <span
              className="cost-view-kpi-value"
              style={{ color: 'var(--accent)' }}
            >
              {formatCurrency(aggregatedStats.p2pSavings)}
            </span>
          </div>
          <div className="cost-view-kpi-sub">
            <span>100% SFU egress avoided on 2-peer calls</span>
          </div>
        </div>

        {/* Card 4: Environmental Carbon Impact */}
        <div className="cost-view-kpi-card">
          <div className="cost-view-kpi-top">
            <span>Carbon Emissions Avoided</span>
            <div className="cost-view-kpi-icon green">
              <Leaf size={16} />
            </div>
          </div>
          <div className="cost-view-kpi-value-row">
            <span className="cost-view-kpi-value">
              {aggregatedStats.carbonAvoidedKg.toFixed(1)}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              kg CO₂e
            </span>
          </div>
          <div className="cost-view-kpi-sub">
            <span>By meeting remotely vs in-person transit</span>
          </div>
        </div>
      </div>

      {/* Interactive Meeting Cost Simulator */}
      <section className="cost-view-card">
        <div className="cost-view-card-header">
          <div className="cost-view-card-header-left">
            <div className="cost-view-kpi-icon blue">
              <Sliders size={16} />
            </div>
            <div>
              <h2 className="cost-view-card-title">
                Interactive Meeting Cost &amp; Relay Simulator
              </h2>
              <p className="cost-view-card-desc">
                Adjust meeting parameters to model real-time bandwidth costs and
                P2P direct savings.
              </p>
            </div>
          </div>
          {onToast && (
            <button
              type="button"
              onClick={() => onToast('Telemetry snapshot exported')}
              className="btn secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              Export Simulator Model
            </button>
          )}
        </div>

        <div className="cost-view-sim-grid">
          {/* Controls Column */}
          <div className="cost-view-sim-controls">
            {/* Control 1: Duration */}
            <div className="cost-view-slider-group">
              <div className="cost-view-slider-header">
                <span>Meeting Duration</span>
                <span className="cost-view-slider-val">
                  {simDurationMins} minutes
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="180"
                step="5"
                value={simDurationMins}
                onChange={(e) => setSimDurationMins(Number(e.target.value))}
                className="cost-view-range"
              />
            </div>

            {/* Control 2: Participant Count */}
            <div className="cost-view-slider-group">
              <div className="cost-view-slider-header">
                <span>Participant Count</span>
                <span className="cost-view-slider-val">
                  {simParticipants} people
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={simParticipants}
                onChange={(e) => setSimParticipants(Number(e.target.value))}
                className="cost-view-range"
              />
            </div>

            {/* Control 3: Relay Percentage */}
            <div className="cost-view-slider-group">
              <div className="cost-view-slider-header">
                <span>Assumed Relay Ratio</span>
                <span className="cost-view-slider-val">{simRelayPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={simRelayPct}
                onChange={(e) => setSimRelayPct(Number(e.target.value))}
                className="cost-view-range"
              />
            </div>

            {/* Control 4: 1:1 P2P Direct Bypass toggle */}
            {simParticipants === 2 && (
              <div className="cost-view-p2p-toggle-box">
                <div>
                  <span className="cost-view-p2p-title">
                    1:1 P2P Direct Bypass
                  </span>
                  <span className="cost-view-p2p-desc">
                    Bypasses SFU routing when only 2 participants are in the
                    room.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSimP2PBypass(!simP2PBypass)}
                  className={`btn ${simP2PBypass ? 'primary' : 'secondary'}`}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  {simP2PBypass ? 'Active' : 'Disabled'}
                </button>
              </div>
            )}
          </div>

          {/* Results Summary Card */}
          <div className="cost-view-sim-summary">
            <div>
              <span
                style={{
                  fontSize: '11.5px',
                  color: 'var(--muted)',
                  display: 'block',
                  marginBottom: '4px',
                  fontWeight: 500,
                }}
              >
                Projected Meeting Cost
              </span>
              <div className="cost-view-summary-price">
                {formatCurrency(simResult.totalCostUsd)}
              </div>
              <span
                style={{
                  fontSize: '11.5px',
                  color: 'var(--muted)',
                  display: 'block',
                  marginTop: '4px',
                }}
              >
                {simResult.costPerParticipantMinuteUsd > 0
                  ? `${(simResult.costPerParticipantMinuteUsd * 100).toFixed(3)}¢ per participant-minute`
                  : 'Zero compute/egress (Direct P2P)'}
              </span>
            </div>

            <div className="cost-view-breakdown-list">
              <div className="cost-view-breakdown-row">
                <span>SFU Compute:</span>
                <span className="cost-view-breakdown-val">
                  {formatCurrency(simResult.sfuComputeCostUsd)}
                </span>
              </div>
              <div className="cost-view-breakdown-row">
                <span>SFU Egress:</span>
                <span className="cost-view-breakdown-val">
                  {formatCurrency(simResult.sfuEgressCostUsd)}
                </span>
              </div>
              <div className="cost-view-breakdown-row">
                <span>TURN Relay Egress:</span>
                <span className="cost-view-breakdown-val">
                  {formatCurrency(simResult.turnRelayCostUsd)}
                </span>
              </div>
              {simResult.estimatedP2PSavingsUsd > 0 && (
                <div
                  className="cost-view-breakdown-row"
                  style={{
                    color: 'var(--accent)',
                    fontWeight: 600,
                    borderTop: '1px solid var(--line)',
                    paddingTop: '6px',
                  }}
                >
                  <span>P2P Direct Savings:</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    +{formatCurrency(simResult.estimatedP2PSavingsUsd)}
                  </span>
                </div>
              )}
            </div>

            <div className="cost-view-commute-banner">
              <Leaf size={15} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span>
                Avoids ~{(simCarbon.commuteSavedGrams / 1000).toFixed(1)} kg
                CO₂e commute emissions.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Unit Economics Rate Card & Regional Carbon Table */}
      <div className="cost-view-grid-2col">
        {/* Left: Unit Economics Rate Card */}
        <section className="cost-view-card">
          <div className="cost-view-card-header-left">
            <div className="cost-view-kpi-icon amber">
              <Zap size={16} />
            </div>
            <div>
              <h3 className="cost-view-card-title">Platform Unit Economics</h3>
              <p className="cost-view-card-desc">
                Standard infrastructure wholesale cost matrix used for billing
                and quota caps.
              </p>
            </div>
          </div>

          <div className="cost-view-table">
            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <Server size={15} style={{ color: 'var(--accent)' }} />
                <span>Media SFU Compute / Slicing</span>
              </div>
              <span className="cost-view-table-val">
                ${DEFAULT_COST_RATES.sfuComputePerParticipantMinuteUsd} /
                part-min
              </span>
            </div>

            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <Globe size={15} style={{ color: '#22c55e' }} />
                <span>Direct SFU Internet Egress</span>
              </div>
              <span className="cost-view-table-val">
                ${DEFAULT_COST_RATES.sfuEgressPerGbUsd} / GB
              </span>
            </div>

            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <Radio size={15} style={{ color: '#f59e0b' }} />
                <span>TURN CoTURN Relay Traversal</span>
              </div>
              <span className="cost-view-table-val">
                ${DEFAULT_COST_RATES.turnRelayPerGbUsd} / GB
              </span>
            </div>

            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <Activity size={15} style={{ color: '#0284c7' }} />
                <span>Signaling Gateway State</span>
              </div>
              <span className="cost-view-table-val">
                ${DEFAULT_COST_RATES.signalingPerParticipantMinuteUsd} /
                part-min
              </span>
            </div>
          </div>
        </section>

        {/* Right: Regional Grid Carbon Intensities */}
        <section className="cost-view-card">
          <div className="cost-view-card-header-left">
            <div className="cost-view-kpi-icon green">
              <Leaf size={16} />
            </div>
            <div>
              <h3 className="cost-view-card-title">
                Carbon-Aware Regional Routing
              </h3>
              <p className="cost-view-card-desc">
                Grid carbon intensity by region. When latency penalty &le; 25ms,
                greener nodes are prioritized.
              </p>
            </div>
          </div>

          <div className="cost-view-table">
            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <span className="cost-view-carbon-dot green" />
                <span>Europe North (Stockholm) — Hydro/Wind</span>
              </div>
              <span
                className="cost-view-table-val"
                style={{ color: '#22c55e', fontWeight: 600 }}
              >
                {REGION_CARBON_INTENSITY['eu-north']} g CO₂/kWh
              </span>
            </div>

            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <span className="cost-view-carbon-dot green" />
                <span>US West (Oregon) — Pacific Hydro</span>
              </div>
              <span
                className="cost-view-table-val"
                style={{ color: '#22c55e', fontWeight: 600 }}
              >
                {REGION_CARBON_INTENSITY['us-west']} g CO₂/kWh
              </span>
            </div>

            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <span className="cost-view-carbon-dot sky" />
                <span>Europe Central (Frankfurt)</span>
              </div>
              <span className="cost-view-table-val">
                {REGION_CARBON_INTENSITY['eu-central']} g CO₂/kWh
              </span>
            </div>

            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <span className="cost-view-carbon-dot amber" />
                <span>US East (Virginia)</span>
              </div>
              <span className="cost-view-table-val">
                {REGION_CARBON_INTENSITY['us-east']} g CO₂/kWh
              </span>
            </div>

            <div className="cost-view-table-row">
              <div className="cost-view-table-left">
                <span className="cost-view-carbon-dot rose" />
                <span>Asia Pacific (Singapore)</span>
              </div>
              <span className="cost-view-table-val">
                {REGION_CARBON_INTENSITY['ap-southeast']} g CO₂/kWh
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
