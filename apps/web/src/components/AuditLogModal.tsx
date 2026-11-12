import React, { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  Filter,
  RefreshCw,
  X,
  Shield,
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

const ACTION_FILTERS: { label: string; value: AuditAction | 'all' }[] = [
  { label: 'All Actions', value: 'all' },
  { label: 'Room Actions', value: 'room.lock' },
  { label: 'Recordings', value: 'recording.start' },
  { label: 'Participant Moderation', value: 'participant.kick' },
  { label: 'API Keys', value: 'apikey.create' },
  { label: 'Compliance & Rights', value: 'compliance.export' },
  { label: 'Security & 2FA', value: 'security.2fa_enable' },
];

export function AuditLogModal({ isOpen, onClose, userId }: AuditLogModalProps) {
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
    if (isOpen) {
      void loadLogs();
    }
  }, [isOpen, selectedFilter]);

  if (!isOpen) return null;

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

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.targetType.toLowerCase().includes(q) ||
      (log.targetId && log.targetId.toLowerCase().includes(q)) ||
      JSON.stringify(log.metadata).toLowerCase().includes(q)
    );
  });

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
              <p
                style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}
              >
                Immutable log of room actions, recording events, API keys, and
                administrative operations
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ctrl-btn sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Controls Bar */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            margin: '14px 0 10px',
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
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value as any)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontSize: '0.82rem',
              }}
            >
              {ACTION_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn secondary sm"
              onClick={loadLogs}
              title="Refresh logs"
            >
              <RefreshCw size={13} className={loading ? 'spinning' : ''} />
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
                padding: '36px 16px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '0.85rem',
              }}
            >
              {loading ? 'Loading audit trail...' : 'No audit events found.'}
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
                  <th style={{ padding: '8px 12px' }}>Timestamp</th>
                  <th style={{ padding: '8px 12px' }}>Action</th>
                  <th style={{ padding: '8px 12px' }}>Target</th>
                  <th style={{ padding: '8px 12px' }}>Details</th>
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
                        padding: '8px 12px',
                        whiteSpace: 'nowrap',
                        color: 'var(--muted)',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                      }}
                    >
                      {new Date(log.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
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
                    <td style={{ padding: '8px 12px', color: 'var(--ink)' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 6px',
                          background: 'var(--soft)',
                          borderRadius: 4,
                        }}
                      >
                        {log.targetType}
                        {log.targetId ? `: ${log.targetId}` : ''}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        color: 'var(--muted)',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {Object.keys(log.metadata).length > 0
                        ? JSON.stringify(log.metadata)
                        : '—'}
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
            fontSize: '0.78rem',
            color: 'var(--muted)',
          }}
        >
          <span>
            Showing {filteredLogs.length} events (retained up to 90 days for
            compliance)
          </span>
          <button type="button" className="btn secondary sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
