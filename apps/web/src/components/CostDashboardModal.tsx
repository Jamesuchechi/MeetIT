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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-dashboard-title"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="cost-dashboard-title"
                className="text-lg font-semibold text-white"
              >
                Cost, Scale & Carbon Telemetry
              </h2>
              <p className="text-xs text-slate-400">
                Real-time meeting efficiency, relay ratio, and environmental
                impact
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close cost telemetry"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
              <span className="text-xs font-medium text-slate-400 block mb-1">
                Estimated Total Cost
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-emerald-400">
                  {formatUsd(cost.totalCostUsd)}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                {cost.costPerParticipantMinuteUsd > 0
                  ? `${(cost.costPerParticipantMinuteUsd * 100).toFixed(3)}¢ / part-min`
                  : 'Free tier / Direct P2P'}
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-400">
                  TURN Relay Ratio
                </span>
                {relayHealth.status === 'optimal' ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                    <ShieldCheck className="w-3 h-3" /> Optimal
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                    <AlertTriangle className="w-3 h-3" /> Elevated
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white">
                  {cost.relayRatioPct}%
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                {relayMb} MB relay / {totalMb} MB total
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
              <span className="text-xs font-medium text-slate-400 block mb-1">
                Carbon Footprint
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-emerald-400">
                  {carbon.totalCarbonGrams}
                </span>
                <span className="text-xs text-slate-400">g CO₂e</span>
              </div>
              <span className="text-[11px] text-slate-500 block mt-1">
                ~{carbon.carMilesEquivalent} car-miles equiv
              </span>
            </div>
          </div>

          {/* 1:1 P2P Direct Bypass Alert / Status */}
          {cost.isP2PBypassEligible ? (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-indigo-300">
                  1:1 P2P Direct Bypass Active
                </h4>
                <p className="text-xs text-indigo-200/80 mt-1">
                  Because this call has exactly 2 participants, media streams
                  are routed directly peer-to-peer (bypassing the SFU),
                  eliminating 100% of cloud SFU egress costs.
                </p>
                {cost.estimatedP2PSavingsUsd > 0 && (
                  <span className="inline-block mt-2 text-xs font-medium text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full">
                    Estimated savings: {formatUsd(cost.estimatedP2PSavingsUsd)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-slate-400" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-300">
                    Multi-Party SFU Cascaded Mesh
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {participantCount} participants connected via regional media
                    SFU
                  </p>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 bg-slate-700/50 rounded-md text-slate-300 font-mono">
                {cost.participantMinutes} part-mins
              </span>
            </div>
          )}

          {/* Cost Allocation Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Expense Itemization
            </h4>
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl divide-y divide-slate-800 text-xs">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 text-slate-300">
                  <Server className="w-4 h-4 text-slate-500" />
                  <span>
                    SFU Compute & Forwarding ({cost.participantMinutes}{' '}
                    part-mins)
                  </span>
                </div>
                <span className="font-mono text-slate-200">
                  {formatUsd(cost.sfuComputeCostUsd)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 text-slate-300">
                  <Globe className="w-4 h-4 text-slate-500" />
                  <span>Direct SFU Egress ({directMb} MB @ $0.05/GB)</span>
                </div>
                <span className="font-mono text-slate-200">
                  {formatUsd(cost.sfuEgressCostUsd)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 text-slate-300">
                  <Radio className="w-4 h-4 text-slate-500" />
                  <span>TURN Relay Egress ({relayMb} MB @ $0.15/GB)</span>
                </div>
                <span className="font-mono text-slate-200">
                  {formatUsd(cost.turnRelayCostUsd)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 text-slate-300">
                  <Zap className="w-4 h-4 text-slate-500" />
                  <span>Signaling WebSocket State</span>
                </div>
                <span className="font-mono text-slate-200">
                  {formatUsd(cost.signalingCostUsd)}
                </span>
              </div>
            </div>
          </div>

          {/* Environmental Carbon Savings */}
          <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <Leaf className="w-4 h-4" />
              <h4 className="text-xs font-semibold uppercase tracking-wider">
                Green Meeting Impact
              </h4>
            </div>
            <p className="text-xs text-slate-300">
              Active Region:{' '}
              <span className="font-semibold text-emerald-300">
                {currentRegionId}
              </span>{' '}
              ({gridIntensity} g CO₂/kWh grid intensity). By meeting remotely
              instead of commuting, this group avoided an estimated:
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">
                  Commute Emissions Avoided
                </span>
                <span className="text-base font-bold text-emerald-400">
                  {(carbon.commuteSavedGrams / 1000).toFixed(2)} kg CO₂e
                </span>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 block">
                  Urban Trees Absorbed Equiv
                </span>
                <span className="text-base font-bold text-emerald-400">
                  {carbon.treesOffsetEquivalent} trees/year
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Updated live from WebRTC transport telemetry</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
