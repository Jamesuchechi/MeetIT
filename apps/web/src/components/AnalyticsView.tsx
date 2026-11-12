import React, { useState, useMemo } from 'react';
import {
  Clock,
  Users,
  CheckCircle2,
  Zap,
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
    <div className="analytics-view-container">
      {/* Header & Controls */}
      <div className="analytics-view-header">
        <div className="analytics-view-header-left">
          <div className="analytics-view-title-row">
            <h1 className="analytics-view-title">
              Meeting Analytics &amp; Insights
            </h1>
            <span className="analytics-view-badge">Privacy-First</span>
          </div>
          <p className="analytics-view-subtitle">
            Personal and team meeting load, collaboration balance, and
            productivity metrics.
          </p>
        </div>

        {/* Action Controls */}
        <div className="analytics-view-controls">
          {/* Time Range Selector */}
          <div className="analytics-view-time-filters">
            <button
              type="button"
              onClick={() => setTimeRange('week')}
              className={`analytics-view-time-btn ${timeRange === 'week' ? 'active' : ''}`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('month')}
              className={`analytics-view-time-btn ${timeRange === 'month' ? 'active' : ''}`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('quarter')}
              className={`analytics-view-time-btn ${timeRange === 'quarter' ? 'active' : ''}`}
            >
              Quarter
            </button>
          </div>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn secondary"
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            aria-label="Export analytics report as CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="analytics-view-kpi-grid">
        {/* KPI 1: Meeting Time */}
        <div className="analytics-view-kpi-card">
          <div className="analytics-view-kpi-top">
            <span>Total Meeting Time</span>
            <div className="analytics-view-kpi-icon indigo">
              <Clock size={16} />
            </div>
          </div>
          <div className="analytics-view-kpi-value-row">
            <span className="analytics-view-kpi-value">
              {summary.totalHours}
            </span>
            <span className="analytics-view-kpi-unit">hours</span>
          </div>
          <div className="analytics-view-kpi-sub">
            <span
              style={{
                fontWeight: 600,
                color: 'var(--accent)',
              }}
            >
              {summary.totalMeetings} meetings
            </span>{' '}
            <span>total in period</span>
          </div>
        </div>

        {/* KPI 2: Focus Time Ratio */}
        <div className="analytics-view-kpi-card">
          <div className="analytics-view-kpi-top">
            <span>Focus Time Ratio</span>
            <div className="analytics-view-kpi-icon green">
              <Zap size={16} />
            </div>
          </div>
          <div className="analytics-view-kpi-value-row">
            <span className="analytics-view-kpi-value">
              {summary.focusTimeRatioPct}%
            </span>
            <span
              className="analytics-view-badge"
              style={{
                background:
                  summary.focusTimeRatioPct >= 65
                    ? 'rgba(34, 197, 94, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                color: summary.focusTimeRatioPct >= 65 ? '#22c55e' : '#f59e0b',
                borderColor:
                  summary.focusTimeRatioPct >= 65
                    ? 'rgba(34, 197, 94, 0.25)'
                    : 'rgba(245, 158, 11, 0.25)',
              }}
            >
              {summary.focusTimeRatioPct >= 65 ? 'Healthy' : 'Heavy Load'}
            </span>
          </div>
          <div className="analytics-view-kpi-sub">
            <span>Outside of scheduled call hours</span>
          </div>
        </div>

        {/* KPI 3: Meeting Efficiency Score */}
        <div className="analytics-view-kpi-card">
          <div className="analytics-view-kpi-top">
            <span>Meeting Health Score</span>
            <div className="analytics-view-kpi-icon sky">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="analytics-view-kpi-value-row">
            <span
              className="analytics-view-kpi-value"
              style={{ color: '#0284c7' }}
            >
              {summary.efficiencyScore}
            </span>
            <span className="analytics-view-kpi-unit">/ 100</span>
          </div>
          <div className="analytics-view-kpi-sub">
            <span>Punctuality &amp; group size rating</span>
          </div>
        </div>

        {/* KPI 4: Average Duration & Size */}
        <div className="analytics-view-kpi-card">
          <div className="analytics-view-kpi-top">
            <span>Average Meeting</span>
            <div className="analytics-view-kpi-icon amber">
              <Users size={16} />
            </div>
          </div>
          <div className="analytics-view-kpi-value-row">
            <span className="analytics-view-kpi-value">
              {summary.averageMinutes}
            </span>
            <span className="analytics-view-kpi-unit">mins</span>
          </div>
          <div className="analytics-view-kpi-sub">
            <span style={{ fontWeight: 600, color: '#f59e0b' }}>
              {summary.averageParticipants} attendees
            </span>{' '}
            <span>on average</span>
          </div>
        </div>
      </div>

      {/* Main Charts Grid: Day-of-Week Load & Meeting Types */}
      <div className="analytics-view-charts-grid">
        {/* Left: Day of Week Load Chart */}
        <section className="analytics-view-card">
          <div className="analytics-view-card-header">
            <div className="analytics-view-kpi-icon indigo">
              <Calendar size={16} />
            </div>
            <div>
              <h2 className="analytics-view-card-title">
                Meeting Hours by Day of Week
              </h2>
              <p className="analytics-view-card-desc">
                Track daily meeting density to identify meeting-heavy days and
                protect focus time.
              </p>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="analytics-view-barchart">
            {summary.dayOfWeekDistribution.map((d) => {
              const heightPct = Math.round((d.minutes / maxDayMinutes) * 100);
              const hours = (d.minutes / 60).toFixed(1);
              return (
                <div key={d.day} className="analytics-view-bar-col">
                  <span className="analytics-view-bar-hours">{hours}h</span>
                  <div className="analytics-view-bar-track">
                    <div
                      className="analytics-view-bar-fill"
                      style={{ height: `${Math.max(6, heightPct)}%` }}
                    />
                  </div>
                  <span className="analytics-view-bar-day">{d.day}</span>
                </div>
              );
            })}
          </div>

          <div className="analytics-view-barchart-footer">
            <span>Mon – Sun distribution</span>
            <span>Values in scheduled hours</span>
          </div>
        </section>

        {/* Right: Meeting Type Breakdown */}
        <section className="analytics-view-card">
          <div className="analytics-view-card-header">
            <div className="analytics-view-kpi-icon green">
              <Users size={16} />
            </div>
            <div>
              <h2 className="analytics-view-card-title">
                Meeting Size Breakdown
              </h2>
              <p className="analytics-view-card-desc">
                1:1 syncs vs multi-party team meetings.
              </p>
            </div>
          </div>

          <div className="analytics-view-size-list">
            <div className="analytics-view-size-row">
              <div className="analytics-view-size-header">
                <span>1:1 Direct Syncs (2 people)</span>
                <span
                  className="analytics-view-size-count"
                  style={{ color: '#22c55e' }}
                >
                  {summary.typeBreakdown.oneOnOne}
                </span>
              </div>
              <div className="analytics-view-progress-track">
                <div
                  className="analytics-view-progress-fill green"
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

            <div className="analytics-view-size-row">
              <div className="analytics-view-size-header">
                <span>Small Group (3–5 people)</span>
                <span
                  className="analytics-view-size-count"
                  style={{ color: 'var(--accent)' }}
                >
                  {summary.typeBreakdown.smallGroup}
                </span>
              </div>
              <div className="analytics-view-progress-track">
                <div
                  className="analytics-view-progress-fill indigo"
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

            <div className="analytics-view-size-row">
              <div className="analytics-view-size-header">
                <span>Large Group (6+ attendees)</span>
                <span
                  className="analytics-view-size-count"
                  style={{ color: '#f59e0b' }}
                >
                  {summary.typeBreakdown.largeGroup}
                </span>
              </div>
              <div className="analytics-view-progress-track">
                <div
                  className="analytics-view-progress-fill amber"
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
      <div className="analytics-view-grid-2col">
        {/* Left: In-Call Collaboration Feature Adoption */}
        <section className="analytics-view-card">
          <div className="analytics-view-card-header">
            <div className="analytics-view-kpi-icon amber">
              <Zap size={16} />
            </div>
            <div>
              <h3 className="analytics-view-card-title">
                In-Call Feature Engagement
              </h3>
              <p className="analytics-view-card-desc">
                Percentage of calls utilizing interactive collaboration tools.
              </p>
            </div>
          </div>

          <div className="analytics-view-feature-list">
            <div className="analytics-view-feature-row">
              <div className="analytics-view-feature-label">
                <FileText size={15} style={{ color: 'var(--accent)' }} />
                <span>Shared Notes &amp; Action Items</span>
              </div>
              <span className="analytics-view-feature-val">
                {summary.featureEngagement.notesLinkedPct}%
              </span>
            </div>

            <div className="analytics-view-feature-row">
              <div className="analytics-view-feature-label">
                <MessageSquare size={15} style={{ color: '#22c55e' }} />
                <span>In-Call Chat &amp; Reactions</span>
              </div>
              <span className="analytics-view-feature-val">
                {summary.featureEngagement.chatUsedPct}%
              </span>
            </div>

            <div className="analytics-view-feature-row">
              <div className="analytics-view-feature-label">
                <Paintbrush size={15} style={{ color: '#0284c7' }} />
                <span>Collaborative Whiteboard</span>
              </div>
              <span className="analytics-view-feature-val">
                {summary.featureEngagement.whiteboardUsedPct}%
              </span>
            </div>

            <div className="analytics-view-feature-row">
              <div className="analytics-view-feature-label">
                <ScreenShare size={15} style={{ color: '#a855f7' }} />
                <span>Screen Sharing &amp; Demos</span>
              </div>
              <span className="analytics-view-feature-val">
                {summary.featureEngagement.screenShareUsedPct}%
              </span>
            </div>
          </div>
        </section>

        {/* Right: Smart Productivity Recommendations */}
        <section className="analytics-view-card">
          <div className="analytics-view-card-header">
            <div className="analytics-view-kpi-icon indigo">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="analytics-view-card-title">
                Productivity Recommendations
              </h3>
              <p className="analytics-view-card-desc">
                Actionable tips derived from your meeting patterns.
              </p>
            </div>
          </div>

          <div className="analytics-view-recs-list">
            {summary.recommendations.map((rec, i) => (
              <div key={i} className="analytics-view-rec-card">
                <Info
                  size={15}
                  style={{
                    color: 'var(--accent)',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                />
                <p>{rec}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Privacy Guarantee Footer Pill */}
      <div className="analytics-view-privacy-card">
        <ShieldCheck size={18} />
        <span>
          <strong>Privacy Guarantee:</strong> All meeting analytics are
          aggregated locally on-device. MeetIT never inspects audio, sells
          meeting data, or embeds third-party trackers.
        </span>
      </div>
    </div>
  );
};
