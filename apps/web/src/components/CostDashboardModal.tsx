import React, { useMemo } from 'react';
import {
  X,
  DollarSign,
  Leaf,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Zap,
  TrendingDown,
  Server,
  Globe,
  Radio,
} from 'lucide-react';
import {
  calculateMeetingCost,
  evaluateRelayHealth,
} from '../lib/costCalculator';
import {
  estimateMeetingCarbonFootprint,
  REGION_CARBON_INTENSITY,
} from '../lib/regions';

export interface CostDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  durationSeconds: number;
  participantCount: number;
  bytesReceived: number;
  bytesSent: number;
  relayBytes?: number;
  currentRegionId?: string;
  isP2PDirectActive?: boolean;
}

export const CostDashboardModal: React.FC<CostDashboardModalProps> = ({
  isOpen,
  onClose,
  durationSeconds,
  participantCount,
  bytesReceived,
  bytesSent,
  relayBytes = 0,
  currentRegionId = 'default',
  isP2PDirectActive = false,
}) => {
  const cost = useMemo(() => {
    return calculateMeetingCost({
      durationSeconds,
      participantCount,
      bytesReceived,
      bytesSent,
      relayBytes,
      p2pBypassActive: isP2PDirectActive,
    });
  }, [
    durationSeconds,
    participantCount,
    bytesReceived,
    bytesSent,
    relayBytes,
    isP2PDirectActive,
  ]);

  const relayHealth = useMemo(() => {
    return evaluateRelayHealth(cost.relayRatioPct);
  }, [cost.relayRatioPct]);

  const carbon = useMemo(() => {
    return estimateMeetingCarbonFootprint(
      durationSeconds,
      participantCount,
      bytesReceived + bytesSent,
      currentRegionId,
    );
  }, [
    durationSeconds,
    participantCount,
    bytesReceived,
    bytesSent,
    currentRegionId,
  ]);

  if (!isOpen) return null;

  const totalMb = Math.round((cost.totalBytes / (1024 * 1024)) * 10) / 10;
  const directMb = Math.round((cost.directBytes / (1024 * 1024)) * 10) / 10;
  const relayMb = Math.round((cost.relayBytes / (1024 * 1024)) * 10) / 10;

  const formatUsd = (amt: number): string => {
    if (amt < 0.01 && amt > 0) return `$${amt.toFixed(4)}`;
    return `$${amt.toFixed(2)}`;
  };

  const gridIntensity =
    REGION_CARBON_INTENSITY[currentRegionId] ??
    REGION_CARBON_INTENSITY['default']!;

  return (
    <div
      className="cost-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-dashboard-title"
    >
      <div className="cost-modal-card">
        {/* Header */}
        <div className="cost-modal-header">
          <div className="cost-modal-title-group">
            <div className="cost-modal-icon-badge">
              <DollarSign size={18} />
            </div>
            <div>
              <h2 id="cost-dashboard-title" className="cost-modal-title">
                Cost, Scale &amp; Carbon Telemetry
              </h2>
              <p className="cost-modal-subtitle">
                Real-time meeting efficiency, relay ratio, and environmental
                impact
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cost-modal-close-btn"
            aria-label="Close cost telemetry"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="cost-modal-body">
          {/* Key Metrics Grid */}
          <div className="cost-modal-kpi-grid">
            <div className="cost-modal-kpi-card">
              <span className="cost-modal-kpi-label">Estimated Total Cost</span>
              <span className="cost-modal-kpi-val" style={{ color: '#22c55e' }}>
                {formatUsd(cost.totalCostUsd)}
              </span>
              <span className="cost-modal-kpi-sub">
                {cost.costPerParticipantMinuteUsd > 0
                  ? `${(cost.costPerParticipantMinuteUsd * 100).toFixed(3)}¢ / part-min`
                  : 'Free tier / Direct P2P'}
              </span>
            </div>

            <div className="cost-modal-kpi-card">
              <div className="cost-modal-kpi-label">
                <span>TURN Relay Ratio</span>
                {relayHealth.status === 'optimal' ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#22c55e',
                      fontSize: '10px',
                      fontWeight: 600,
                    }}
                  >
                    <ShieldCheck size={12} /> Optimal
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#f59e0b',
                      fontSize: '10px',
                      fontWeight: 600,
                    }}
                  >
                    <AlertTriangle size={12} /> Elevated
                  </span>
                )}
              </div>
              <span className="cost-modal-kpi-val">{cost.relayRatioPct}%</span>
              <span className="cost-modal-kpi-sub">
                {relayMb} MB relay / {totalMb} MB total
              </span>
            </div>

            <div className="cost-modal-kpi-card">
              <span className="cost-modal-kpi-label">Carbon Footprint</span>
              <span className="cost-modal-kpi-val" style={{ color: '#22c55e' }}>
                {carbon.totalCarbonGrams}{' '}
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--muted)',
                  }}
                >
                  g CO₂e
                </span>
              </span>
              <span className="cost-modal-kpi-sub">
                ~{carbon.carMilesEquivalent} car-miles equiv
              </span>
            </div>
          </div>

          {/* 1:1 P2P Direct Bypass Alert / Status */}
          {cost.isP2PBypassEligible ? (
            <div
              className="cost-modal-alert optimal"
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                borderColor: 'rgba(99, 102, 241, 0.25)',
              }}
            >
              <div
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--accent)',
                  flexShrink: 0,
                }}
              >
                <TrendingDown size={18} />
              </div>
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  1:1 P2P Direct Bypass Active
                </h4>
                <p
                  style={{
                    margin: '3px 0 0',
                    fontSize: '11.5px',
                    color: 'var(--muted)',
                  }}
                >
                  Because this call has exactly 2 participants, media streams
                  are routed directly peer-to-peer (bypassing the SFU),
                  eliminating 100% of cloud SFU egress costs.
                </p>
                {cost.estimatedP2PSavingsUsd > 0 && (
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--accent)',
                      background: 'var(--soft)',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                    }}
                  >
                    Estimated savings: {formatUsd(cost.estimatedP2PSavingsUsd)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                <Server size={18} style={{ color: 'var(--muted)' }} />
                <div>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    Multi-Party SFU Cascaded Mesh
                  </h4>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '11px',
                      color: 'var(--muted)',
                    }}
                  >
                    {participantCount} participants connected via regional media
                    SFU
                  </p>
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  background: 'var(--surface)',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  fontFamily: 'monospace',
                }}
              >
                {cost.participantMinutes} part-mins
              </span>
            </div>
          )}

          {/* Cost Allocation Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4
              style={{
                margin: 0,
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Expense Itemization
            </h4>
            <div className="cost-modal-table-box">
              <div className="cost-modal-table-row">
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Server size={14} style={{ color: 'var(--muted)' }} />
                  <span>
                    SFU Compute &amp; Forwarding ({cost.participantMinutes}{' '}
                    part-mins)
                  </span>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {formatUsd(cost.sfuComputeCostUsd)}
                </span>
              </div>

              <div className="cost-modal-table-row">
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Globe size={14} style={{ color: 'var(--muted)' }} />
                  <span>Direct SFU Egress ({directMb} MB @ $0.05/GB)</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {formatUsd(cost.sfuEgressCostUsd)}
                </span>
              </div>

              <div className="cost-modal-table-row">
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Radio size={14} style={{ color: 'var(--muted)' }} />
                  <span>TURN Relay Egress ({relayMb} MB @ $0.15/GB)</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {formatUsd(cost.turnRelayCostUsd)}
                </span>
              </div>

              <div className="cost-modal-table-row">
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Zap size={14} style={{ color: 'var(--muted)' }} />
                  <span>Signaling WebSocket State</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {formatUsd(cost.signalingCostUsd)}
                </span>
              </div>
            </div>
          </div>

          {/* Environmental Carbon Savings */}
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.22)',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#22c55e',
              }}
            >
              <Leaf size={16} />
              <h4
                style={{
                  margin: 0,
                  fontSize: '11.5px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Green Meeting Impact
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink)' }}>
              Active Region:{' '}
              <strong style={{ color: '#22c55e' }}>{currentRegionId}</strong> (
              {gridIntensity} g CO₂/kWh grid intensity). By meeting remotely
              instead of commuting, this group avoided an estimated:
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                paddingTop: '2px',
              }}
            >
              <div
                style={{
                  background: 'var(--surface)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--muted)',
                    display: 'block',
                  }}
                >
                  Commute Emissions Avoided
                </span>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#22c55e',
                  }}
                >
                  {(carbon.commuteSavedGrams / 1000).toFixed(2)} kg CO₂e
                </span>
              </div>
              <div
                style={{
                  background: 'var(--surface)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--muted)',
                    display: 'block',
                  }}
                >
                  Urban Trees Absorbed Equiv
                </span>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#22c55e',
                  }}
                >
                  {carbon.treesOffsetEquivalent} trees/year
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--line)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--muted)',
            }}
          >
            <Activity size={15} style={{ color: '#22c55e' }} />
            <span>Updated live from WebRTC transport telemetry</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn secondary"
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
