import React, { useEffect, useState } from 'react';
import {
  exportAnalyticsToCsv,
  fetchWebinarAnalyticsApi,
} from '../lib/webinarStore';
import {
  TrendingUp,
  Download,
  X,
  Users,
  MessageSquare,
  BarChart3,
} from 'lucide-react';

interface WebinarAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export const WebinarAnalyticsModal: React.FC<WebinarAnalyticsModalProps> = ({
  isOpen,
  onClose,
  roomCode,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<
    Array<{
      peerId: string;
      displayName: string;
      role: string;
      joinTime: number;
      leaveTime?: number;
      durationSeconds: number;
      chatCount: number;
      pollVotesCount: number;
      qaCount: number;
      engagementScore: number;
    }>
  >([]);
  const [peakViewers, setPeakViewers] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetchWebinarAnalyticsApi(roomCode)
      .then((data) => {
        setReport(data.report);
        setPeakViewers(data.peakViewers);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch attendee analytics');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, roomCode]);

  if (!isOpen) return null;

  const handleExport = () => {
    exportAnalyticsToCsv(report, roomCode);
  };

  const avgEngagement =
    report.length > 0
      ? Math.round(
          report.reduce((acc, curr) => acc + curr.engagementScore, 0) /
            report.length,
        )
      : 0;

  return (
    <div
      className="app-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analytics-modal-title"
      onClick={onClose}
    >
      <div
        className="app-modal-dialog wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal-header">
          <div className="app-modal-title-group">
            <div className="app-modal-icon">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 id="analytics-modal-title" className="app-modal-title">
                Webinar Attendee Analytics
              </h2>
              <p className="app-modal-subtitle">
                Live engagement scores, session duration, and attendee
                interactions
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleExport}
              disabled={report.length === 0}
              className="panel-btn-primary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="app-modal-close"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="app-modal-body">
          {/* Top metrics summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
            }}
          >
            <div className="panel-card" style={{ padding: '14px' }}>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--muted)',
                  display: 'block',
                }}
              >
                Peak Viewers
              </span>
              <strong style={{ fontSize: '24px', color: 'var(--ink)' }}>
                {peakViewers}
              </strong>
            </div>
            <div className="panel-card" style={{ padding: '14px' }}>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--muted)',
                  display: 'block',
                }}
              >
                Total Attendees
              </span>
              <strong style={{ fontSize: '24px', color: 'var(--ink)' }}>
                {report.length}
              </strong>
            </div>
            <div className="panel-card" style={{ padding: '14px' }}>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--muted)',
                  display: 'block',
                }}
              >
                Avg Engagement
              </span>
              <strong style={{ fontSize: '24px', color: '#22c55e' }}>
                {avgEngagement}%
              </strong>
            </div>
          </div>

          {/* Attendees List / Table */}
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: '12px',
              overflow: 'hidden',
              maxHeight: '360px',
              overflowY: 'auto',
            }}
          >
            {loading ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px',
                  color: 'var(--muted)',
                  fontSize: '13px',
                }}
              >
                Loading attendee analytics...
              </div>
            ) : error ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px',
                  color: 'var(--danger)',
                  fontSize: '13px',
                }}
              >
                {error}
              </div>
            ) : report.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px',
                  color: 'var(--muted)',
                  fontSize: '13px',
                }}
              >
                No attendee sessions recorded yet.
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12.5px',
                  textAlign: 'left',
                }}
              >
                <thead
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--muted)',
                    borderBottom: '1px solid var(--line)',
                    textTransform: 'uppercase',
                    fontSize: '11px',
                    letterSpacing: '0.04em',
                  }}
                >
                  <tr>
                    <th style={{ padding: '10px 12px' }}>Attendee</th>
                    <th style={{ padding: '10px 12px' }}>Role</th>
                    <th style={{ padding: '10px 12px' }}>Duration</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                      Polls
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                      Q&amp;A
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                      Chat
                    </th>
                    <th style={{ padding: '10px 12px' }}>Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((att) => {
                    const mins = Math.floor(att.durationSeconds / 60);
                    const secs = att.durationSeconds % 60;
                    return (
                      <tr
                        key={att.peerId}
                        style={{ borderBottom: '1px solid var(--line)' }}
                      >
                        <td
                          style={{
                            padding: '10px 12px',
                            fontWeight: 600,
                            color: 'var(--ink)',
                          }}
                        >
                          {att.displayName}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            color: 'var(--muted)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {att.role}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            fontFamily: 'monospace',
                            color: 'var(--ink)',
                          }}
                        >
                          {mins}m {secs}s
                        </td>
                        <td
                          style={{ padding: '10px 12px', textAlign: 'center' }}
                        >
                          {att.pollVotesCount}
                        </td>
                        <td
                          style={{ padding: '10px 12px', textAlign: 'center' }}
                        >
                          {att.qaCount}
                        </td>
                        <td
                          style={{ padding: '10px 12px', textAlign: 'center' }}
                        >
                          {att.chatCount}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                height: '6px',
                                borderRadius: '3px',
                                background: 'var(--line)',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  borderRadius: '3px',
                                  background: 'var(--accent)',
                                  width: `${att.engagementScore}%`,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                width: '32px',
                              }}
                            >
                              {att.engagementScore}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
