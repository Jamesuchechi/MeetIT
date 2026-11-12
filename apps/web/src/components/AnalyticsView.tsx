import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Clock,
  Users,
  CheckCircle2,
  Zap,
  TrendingUp,
  Download,
  ShieldCheck,
  Calendar,
  MessageSquare,
  FileText,
  Paintbrush,
  ScreenShare,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  loadMeetingHistory,
  type MeetingHistoryItem,
} from '../lib/meetingsStore';
import {
  computeMeetingAnalytics,
  exportAnalyticsToCsv,
  type MeetingAnalyticsSummary,
} from '../lib/analyticsService';

export interface AnalyticsViewProps {
  initialHistory?: MeetingHistoryItem[];
  onToast?: (msg: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  initialHistory,
  onToast,
}) => {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>(
    'week',
  );

  const history = useMemo(() => {
    return initialHistory ?? loadMeetingHistory();
  }, [initialHistory]);

  const summary: MeetingAnalyticsSummary = useMemo(() => {
    return computeMeetingAnalytics(history, timeRange);
  }, [history, timeRange]);

  const handleExportCsv = () => {
    try {
      const csv = exportAnalyticsToCsv(summary);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `meetit_analytics_${summary.timeRange}_${Date.now()}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (onToast) onToast('Analytics CSV exported successfully');
    } catch {
      if (onToast) onToast('Failed to export CSV');
    }
  };

  // Find max minutes in day distribution for bar scaling
  const maxDayMinutes = Math.max(
    60,
    ...summary.dayOfWeekDistribution.map((d) => d.minutes),
  );

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Meeting Analytics &amp; Insights
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Privacy-First
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Personal and team meeting load, collaboration balance, and
            productivity metrics.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Time Range Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTimeRange('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                timeRange === 'week'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                timeRange === 'month'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('quarter')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                timeRange === 'quarter'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Quarter
            </button>
          </div>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700/80 transition shadow-sm"
            aria-label="Export analytics report as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Meeting Time */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Total Meeting Time</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {summary.totalHours}
            </span>
            <span className="text-sm text-slate-400 font-medium">hours</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span className="font-semibold text-indigo-400">
              {summary.totalMeetings} meetings
            </span>
            <span>total in period</span>
          </div>
        </div>

        {/* KPI 2: Focus Time Ratio */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Focus Time Ratio</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {summary.focusTimeRatioPct}%
            </span>
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {summary.focusTimeRatioPct >= 65 ? 'Healthy' : 'Heavy Load'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span>Outside of scheduled call hours</span>
          </div>
        </div>

        {/* KPI 3: Meeting Efficiency Score */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Meeting Health Score</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold text-sky-400 tracking-tight">
              {summary.efficiencyScore}
            </span>
            <span className="text-sm text-slate-400 font-medium">/ 100</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span>Punctuality &amp; group size rating</span>
          </div>
        </div>

        {/* KPI 4: Average Duration & Size */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Average Meeting</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {summary.averageMinutes}
            </span>
            <span className="text-sm text-slate-400 font-medium">mins</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span className="font-semibold text-amber-400">
              {summary.averageParticipants} attendees
            </span>
            <span>on average</span>
          </div>
        </div>
      </div>

      {/* Main Charts Grid: Day-of-Week Load & Meeting Types */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Day of Week Load Chart */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Meeting Hours by Day of Week
                </h2>
                <p className="text-xs text-slate-400">
                  Track daily meeting density to identify meeting-heavy days and
                  protect focus time.
                </p>
              </div>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-7 gap-2 sm:gap-4 h-44 items-end px-2">
              {summary.dayOfWeekDistribution.map((d) => {
                const heightPct = Math.round((d.minutes / maxDayMinutes) * 100);
                const hours = (d.minutes / 60).toFixed(1);
                return (
                  <div
                    key={d.day}
                    className="flex flex-col items-center gap-2 h-full justify-end group"
                  >
                    <span className="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition">
                      {hours}h
                    </span>
                    <div
                      className="w-full max-w-[40px] bg-indigo-600/80 hover:bg-indigo-500 rounded-t-lg transition-all duration-300 relative"
                      style={{ height: `${Math.max(6, heightPct)}%` }}
                    />
                    <span className="text-xs font-medium text-slate-400">
                      {d.day}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
              <span>Mon – Sun distribution</span>
              <span>Values in scheduled hours</span>
            </div>
          </div>
        </section>

        {/* Right 1 Col: Meeting Type Breakdown */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Meeting Size Breakdown
              </h2>
              <p className="text-xs text-slate-400">
                1:1 syncs vs multi-party team meetings.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>1:1 Direct Syncs (2 people)</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {summary.typeBreakdown.oneOnOne}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{
                    width: `${
                      summary.totalMeetings > 0
                        ? (summary.typeBreakdown.oneOnOne /
                            summary.totalMeetings) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>Small Group (3–5 people)</span>
                <span className="font-mono text-indigo-400 font-semibold">
                  {summary.typeBreakdown.smallGroup}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{
                    width: `${
                      summary.totalMeetings > 0
                        ? (summary.typeBreakdown.smallGroup /
                            summary.totalMeetings) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>Large Group (6+ attendees)</span>
                <span className="font-mono text-amber-400 font-semibold">
                  {summary.typeBreakdown.largeGroup}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{
                    width: `${
                      summary.totalMeetings > 0
                        ? (summary.typeBreakdown.largeGroup /
                            summary.totalMeetings) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Feature Engagement & Productivity Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: In-Call Collaboration Feature Adoption */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                In-Call Feature Engagement
              </h3>
              <p className="text-xs text-slate-400">
                Percentage of calls utilizing interactive collaboration tools.
              </p>
            </div>
          </div>

          <div className="space-y-3.5 pt-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Shared Notes &amp; Action Items</span>
              </div>
              <span className="font-mono text-slate-200">
                {summary.featureEngagement.notesLinkedPct}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>In-Call Chat &amp; Reactions</span>
              </div>
              <span className="font-mono text-slate-200">
                {summary.featureEngagement.chatUsedPct}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Paintbrush className="w-4 h-4 text-sky-400" />
                <span>Collaborative Whiteboard</span>
              </div>
              <span className="font-mono text-slate-200">
                {summary.featureEngagement.whiteboardUsedPct}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <ScreenShare className="w-4 h-4 text-purple-400" />
                <span>Screen Sharing &amp; Demos</span>
              </div>
              <span className="font-mono text-slate-200">
                {summary.featureEngagement.screenShareUsedPct}%
              </span>
            </div>
          </div>
        </section>

        {/* Right: Smart Productivity Recommendations */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Productivity Recommendations
              </h3>
              <p className="text-xs text-slate-400">
                Actionable tips derived from your meeting patterns.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {summary.recommendations.map((rec, i) => (
              <div
                key={i}
                className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3.5 flex items-start gap-3"
              >
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300 leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Privacy Guarantee Footer Pill */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            <strong>Privacy Guarantee:</strong> All meeting analytics are
            aggregated locally on-device. MeetIT never inspects audio, sells
            meeting data, or embeds third-party trackers.
          </span>
        </div>
      </div>
    </div>
  );
};
