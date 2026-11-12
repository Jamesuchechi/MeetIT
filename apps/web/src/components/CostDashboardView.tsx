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
  Sparkles,
  ArrowUpRight,
  Info,
  CheckCircle2,
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
    <div className="space-y-8 animate-in fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Cost &amp; Scale Telemetry
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live Edge
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time platform unit economics, TURN relay efficiency, 1:1 P2P
            bypass savings, and carbon impact.
          </p>
        </div>

        {/* Time Filter Pills */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 self-start sm:self-auto shadow-sm">
          <button
            type="button"
            onClick={() => setTimeRange('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              timeRange === 'today'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              timeRange === '7d'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              timeRange === '30d'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {/* Top 4 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Cost */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Estimated Media Cost</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {formatCurrency(aggregatedStats.totalCost)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span className="font-mono text-emerald-400">
              {(
                (aggregatedStats.totalCost /
                  aggregatedStats.participantMinutes) *
                100
              ).toFixed(3)}
              ¢
            </span>
            <span>/ participant-minute</span>
          </div>
        </div>

        {/* Card 2: Relay Ratio Optimization */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">TURN Relay Ratio</span>
            <div
              className={`p-2 rounded-xl border ${
                relayHealth.status === 'optimal'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {globalRelayRatio}%
            </span>
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Optimal
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span>
              {aggregatedStats.relayEgressGb} GB relayed of{' '}
              {aggregatedStats.totalEgressGb} GB
            </span>
          </div>
        </div>

        {/* Card 3: 1:1 P2P Direct Bypass Savings */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">1:1 P2P Bypass Savings</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold text-indigo-400 tracking-tight">
              {formatCurrency(aggregatedStats.p2pSavings)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-indigo-300/80">
            <span>100% SFU egress avoided on 2-peer calls</span>
          </div>
        </div>

        {/* Card 4: Environmental Carbon Impact */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">
              Carbon Emissions Avoided
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Leaf className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {aggregatedStats.carbonAvoidedKg.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400">kg CO₂e</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span>By meeting remotely vs in-person transit</span>
          </div>
        </div>
      </div>

      {/* Interactive Meeting Cost Simulator */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Interactive Meeting Cost &amp; Relay Simulator
              </h2>
              <p className="text-xs text-slate-400">
                Adjust meeting parameters to model real-time bandwidth costs and
                P2P direct savings.
              </p>
            </div>
          </div>
          {onToast && (
            <button
              type="button"
              onClick={() => onToast('Telemetry snapshot exported')}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition self-start sm:self-auto"
            >
              Export Simulator Model
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Column */}
          <div className="space-y-4 lg:col-span-2">
            {/* Control 1: Duration */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Meeting Duration</span>
                <span className="font-mono text-indigo-400">
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
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Control 2: Participant Count */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Participant Count</span>
                <span className="font-mono text-indigo-400">
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
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Control 3: Relay Percentage */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Assumed Relay Ratio</span>
                <span className="font-mono text-indigo-400">
                  {simRelayPct}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={simRelayPct}
                onChange={(e) => setSimRelayPct(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Control 4: 1:1 P2P Direct Bypass toggle */}
            {simParticipants === 2 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
                <div className="space-y-0.5">
                  <span className="font-semibold text-indigo-300 block">
                    1:1 P2P Direct Bypass
                  </span>
                  <span className="text-slate-400 block text-[11px]">
                    Bypasses SFU routing when only 2 participants are in the
                    room.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSimP2PBypass(!simP2PBypass)}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    simP2PBypass
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {simP2PBypass ? 'Active' : 'Disabled'}
                </button>
              </div>
            )}
          </div>

          {/* Results Summary Card */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs font-medium text-slate-400 block mb-1">
                Projected Meeting Cost
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-emerald-400 font-mono">
                  {formatCurrency(simResult.totalCostUsd)}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                {simResult.costPerParticipantMinuteUsd > 0
                  ? `${(simResult.costPerParticipantMinuteUsd * 100).toFixed(3)}¢ per participant-minute`
                  : 'Zero compute/egress (Direct P2P)'}
              </span>
            </div>

            <div className="space-y-2 text-xs border-t border-slate-700/60 pt-3">
              <div className="flex justify-between text-slate-300">
                <span>SFU Compute:</span>
                <span className="font-mono text-slate-100">
                  {formatCurrency(simResult.sfuComputeCostUsd)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>SFU Egress:</span>
                <span className="font-mono text-slate-100">
                  {formatCurrency(simResult.sfuEgressCostUsd)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>TURN Relay Egress:</span>
                <span className="font-mono text-slate-100">
                  {formatCurrency(simResult.turnRelayCostUsd)}
                </span>
              </div>
              {simResult.estimatedP2PSavingsUsd > 0 && (
                <div className="flex justify-between text-indigo-400 font-medium pt-1 border-t border-slate-700/40">
                  <span>P2P Direct Savings:</span>
                  <span className="font-mono">
                    +{formatCurrency(simResult.estimatedP2PSavingsUsd)}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-2.5 text-[11px] text-emerald-300 flex items-center gap-2">
              <Leaf className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                Avoids ~{(simCarbon.commuteSavedGrams / 1000).toFixed(1)} kg
                CO₂e commute emissions.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Unit Economics Rate Card & Regional Carbon Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Unit Economics Rate Card */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Platform Unit Economics
              </h3>
              <p className="text-xs text-slate-400">
                Standard infrastructure wholesale cost matrix used for billing
                and quota caps.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden text-xs">
            <div className="flex items-center justify-between p-3.5 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <Server className="w-4 h-4 text-indigo-400" />
                <span>Media SFU Compute / Slicing</span>
              </div>
              <span className="font-mono text-slate-200">
                ${DEFAULT_COST_RATES.sfuComputePerParticipantMinuteUsd} /
                part-min
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Direct SFU Internet Egress</span>
              </div>
              <span className="font-mono text-slate-200">
                ${DEFAULT_COST_RATES.sfuEgressPerGbUsd} / GB
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <Radio className="w-4 h-4 text-amber-400" />
                <span>TURN CoTURN Relay Traversal</span>
              </div>
              <span className="font-mono text-slate-200">
                ${DEFAULT_COST_RATES.turnRelayPerGbUsd} / GB
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <Activity className="w-4 h-4 text-sky-400" />
                <span>Signaling Gateway State</span>
              </div>
              <span className="font-mono text-slate-200">
                ${DEFAULT_COST_RATES.signalingPerParticipantMinuteUsd} /
                part-min
              </span>
            </div>
          </div>
        </section>

        {/* Right: Regional Grid Carbon Intensities */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Leaf className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Carbon-Aware Regional Routing
              </h3>
              <p className="text-xs text-slate-400">
                Grid carbon intensity by region. When latency penalty &le; 25ms,
                greener nodes are prioritized.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Europe North (Stockholm) — Hydro/Wind</span>
              </div>
              <span className="font-mono text-emerald-400 font-semibold">
                {REGION_CARBON_INTENSITY['eu-north']} g CO₂/kWh
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>US West (Oregon) — Pacific Hydro</span>
              </div>
              <span className="font-mono text-emerald-400 font-semibold">
                {REGION_CARBON_INTENSITY['us-west']} g CO₂/kWh
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>Europe Central (Frankfurt)</span>
              </div>
              <span className="font-mono text-slate-200">
                {REGION_CARBON_INTENSITY['eu-central']} g CO₂/kWh
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>US East (Virginia)</span>
              </div>
              <span className="font-mono text-slate-200">
                {REGION_CARBON_INTENSITY['us-east']} g CO₂/kWh
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-900/30">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>Asia Pacific (Singapore)</span>
              </div>
              <span className="font-mono text-slate-200">
                {REGION_CARBON_INTENSITY['ap-southeast']} g CO₂/kWh
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
