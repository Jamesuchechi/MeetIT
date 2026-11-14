import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Download,
  RefreshCw,
  X,
  Shield,
  ShieldCheck,
  Video,
  Key,
  Users,
  Settings,
} from 'lucide-react';
import type { AuditAction, AuditLogEntry } from '@meetit/protocol';
import {
  getAuditLogs,
  exportAuditLogsAsCsv,
  exportAuditLogsAsJson,
  type AuditQueryFilters,
} from '../lib/auditService.js';
import { downloadJsonFile } from '../lib/dataExportService.js';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null | undefined;
}

interface AuditLogPanelProps {
  isActive: boolean;
  onClose?: () => void;
  userId?: string | null | undefined;
}

const ACTION_FILTERS: { label: string; value: AuditAction | 'all' }[] = [
  { label: 'All Actions', value: 'all' },
  { label: 'Room Actions', value: 'room.lock' },
  { label: 'Recordings', value: 'recording.start' },
  { label: 'Participant Moderation', value: 'participant.kick' },
  { label: 'API Keys', value: 'apikey.create' },
  { label: 'Compliance & Rights', value: 'compliance.export' },
  { label: 'Security & 2FA', value: 'security.2fa_enable' },
];

export function AuditLogView({
  userId,
}: {
  userId?: string | null | undefined;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AuditLogPanel isActive={true} userId={userId} />
      </div>
    </div>
  );
}

export function AuditLogModal({ isOpen, onClose, userId }: AuditLogModalProps) {
  if (!isOpen) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card audit-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 760,
          width: '95%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AuditLogPanel isActive={isOpen} onClose={onClose} userId={userId} />
      </div>
    </div>
  );
}

function AuditLogPanel({
  isActive,
  onClose,
  userId: _userId,
}: AuditLogPanelProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<AuditAction | 'all'>(
    'all',
  );
  const [searchQuery, setSearchQuery] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const filters: AuditQueryFilters = { limit: 100 };
      if (selectedFilter !== 'all') {
        filters.action = selectedFilter;
      }
      const fetched = await getAuditLogs(filters);
      setLogs(fetched);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      void loadLogs();
    }
  }, [isActive, selectedFilter]);

  const handleDownloadCsv = () => {
    const csv = exportAuditLogsAsCsv(logs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meetit-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const json = exportAuditLogsAsJson(logs);
    downloadJsonFile(
      `meetit-audit-logs-${new Date().toISOString().slice(0, 10)}.json`,
      json,
    );
  };

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          log.action.toLowerCase().includes(q) ||
          log.targetType.toLowerCase().includes(q) ||
          (log.targetId && log.targetId.toLowerCase().includes(q)) ||
          JSON.stringify(log.metadata).toLowerCase().includes(q)
        );
      }),
    [logs, searchQuery],
  );

  const stats = useMemo(() => {
    let roomAndMod = 0;
    let recordings = 0;
    let securityAndKeys = 0;
    for (const log of filteredLogs) {
      if (
        log.action.startsWith('room.') ||
        log.action.startsWith('participant.')
      ) {
        roomAndMod++;
      } else if (log.action.startsWith('recording.')) {
        recordings++;
      } else if (
        log.action.startsWith('security.') ||
        log.action.startsWith('apikey.') ||
        log.action.startsWith('compliance.')
      ) {
        securityAndKeys++;
      }
    }
    return {
      total: filteredLogs.length,
      roomAndMod,
      recordings,
      securityAndKeys,
    };
  }, [filteredLogs]);

  const formatMetadata = (metadata: Record<string, unknown>) => {
    const entries = Object.entries(metadata).filter(
      ([, val]) => val !== undefined && val !== null && val !== '',
    );
    if (entries.length === 0) return null;
    return entries.slice(0, 3).map(([k, v]) => (
      <span
        key={k}
        style={{
          display: 'inline-block',
          fontSize: '0.72rem',
          padding: '2px 7px',
          borderRadius: 6,
          background: 'var(--soft)',
          border: '1px solid var(--line)',
          color: 'var(--ink)',
          marginRight: 4,
        }}
      >
        <strong style={{ color: 'var(--muted)', fontWeight: 500 }}>{k}:</strong>{' '}
        {typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
          ? String(v)
          : JSON.stringify(v)}
      </span>
    ));
  };

  const getActionIcon = (action: string) => {
    if (action.startsWith('room.'))
      return <Shield size={14} style={{ color: 'var(--accent)' }} />;
    if (action.startsWith('recording.'))
      return <Video size={14} style={{ color: '#ef4444' }} />;
    if (action.startsWith('participant.'))
      return <Users size={14} style={{ color: '#f59e0b' }} />;
    if (action.startsWith('apikey.'))
      return <Key size={14} style={{ color: '#8b5cf6' }} />;
    return <Settings size={14} style={{ color: 'var(--muted)' }} />;
  };

  return (
    <>
      <div
        className="modal-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <FileText size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
              Security Audit Log
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Immutable log of room actions, recording events, API keys, and
              administrative operations
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="ctrl-btn sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Summary KPI Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          margin: '12px 0 4px',
        }}
      >
        {[
          { label: 'Total Events', value: stats.total },
          { label: 'Room & Moderation', value: stats.roomAndMod },
          { label: 'Recording Events', value: stats.recordings },
          { label: 'Security & API Keys', value: stats.securityAndKeys },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--ink)',
                marginTop: 2,
              }}
            >
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Category Filter Pills */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginTop: 10,
        }}
      >
        {ACTION_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`btn sm ${selectedFilter === f.value ? 'primary' : 'secondary'}`}
            onClick={() => setSelectedFilter(f.value)}
            style={{ fontSize: '0.74rem', padding: '4px 10px' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Controls Bar */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '12px 0 12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flex: 1,
            minWidth: 220,
          }}
        >
          <input
            type="text"
            placeholder="Search by action, target, or metadata…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              fontSize: '0.84rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn secondary sm"
            onClick={loadLogs}
            title="Refresh logs"
          >
            <RefreshCw size={13} className={loading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="btn secondary sm"
            onClick={handleDownloadCsv}
            title="Export as CSV"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.8rem',
            }}
          >
            <Download size={13} />
            CSV
          </button>

          <button
            type="button"
            className="btn secondary sm"
            onClick={handleDownloadJson}
            title="Export as JSON"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.8rem',
            }}
          >
            <Download size={13} />
            JSON
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid var(--line)',
          borderRadius: 8,
          background: 'var(--bg)',
        }}
      >
        {filteredLogs.length === 0 ? (
          <div
            style={{
              padding: '44px 16px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '0.85rem',
            }}
          >
            <ShieldCheck
              size={22}
              style={{ color: 'var(--accent)', marginBottom: 8 }}
            />
            <div
              style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}
            >
              {loading
                ? 'Loading audit trail…'
                : 'No audit events match your filter'}
            </div>
            <div style={{ fontSize: '0.78rem' }}>
              Room locks, recordings, participant moderation, and API key events
              appear here automatically.
            </div>
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8rem',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--soft)',
                  borderBottom: '1px solid var(--line)',
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  fontSize: '0.72rem',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '10px 12px' }}>Date &amp; Time</th>
                <th style={{ padding: '10px 12px' }}>Action</th>
                <th style={{ padding: '10px 12px' }}>Target</th>
                <th style={{ padding: '10px 12px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  <td
                    style={{
                      padding: '10px 12px',
                      whiteSpace: 'nowrap',
                      color: 'var(--muted)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                    }}
                  >
                    {new Date(log.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    {new Date(log.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                      }}
                    >
                      {getActionIcon(log.action)}
                      <span>{log.action}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 7px',
                        background: 'var(--soft)',
                        borderRadius: 6,
                      }}
                    >
                      {log.targetType}
                      {log.targetId ? `: ${log.targetId}` : ''}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>
                    {formatMetadata(log.metadata) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: '0.78rem',
          color: 'var(--muted)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={14} style={{ color: 'var(--accent)' }} />
          Showing {filteredLogs.length} events · 90-day immutable compliance
          retention
        </span>
        {onClose && (
          <button type="button" className="btn secondary sm" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </>
  );
}
