import React, { useState } from 'react';
import {
  ShieldCheck,
  Globe,
  FileCheck,
  FileText,
  Download,
  Trash2,
  X,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import type { DataResidencyRegion } from '@meetit/protocol';
import {
  SOC2_CONTROLS_CHECKLIST,
  SUBPROCESSORS_REGISTRY,
  getDataResidencyRegion,
  setDataResidencyRegion,
  generateStandardDpaText,
} from '../lib/complianceService.js';
import {
  generateUserDataExport,
  downloadJsonFile,
} from '../lib/dataExportService.js';

interface ComplianceCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null | undefined;
  onRequestDeleteAccount?: (() => void) | undefined;
}

type TabType = 'soc2' | 'residency' | 'subprocessors' | 'rights';

export function ComplianceCenterModal({
  isOpen,
  onClose,
  userId,
  onRequestDeleteAccount,
}: ComplianceCenterModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('soc2');
  const [region, setRegion] = useState<DataResidencyRegion>(
    getDataResidencyRegion(),
  );
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleRegionChange = (newRegion: DataResidencyRegion) => {
    setRegion(newRegion);
    setDataResidencyRegion(newRegion, userId ?? undefined);
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const bundle = await generateUserDataExport(userId ?? undefined);
      const filename = `meetit-user-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJsonFile(filename, JSON.stringify(bundle, null, 2));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadDpa = () => {
    const dpa = generateStandardDpaText();
    const blob = new Blob([dpa], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meetit-standard-dpa-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const implementedCount = SOC2_CONTROLS_CHECKLIST.filter(
    (c) => c.status === 'implemented',
  ).length;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card compliance-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 780,
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
                background: 'rgba(34, 197, 94, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22c55e',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Compliance & Trust Center
              </h3>
              <p
                style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}
              >
                SOC 2 Type II Readiness, GDPR / NDPR / CCPA, and Multi-Region
                Data Residency
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

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--line)',
            paddingBottom: 10,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            className={`btn sm ${activeTab === 'soc2' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('soc2')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <FileCheck size={14} />
            SOC 2 Readiness ({implementedCount}/{SOC2_CONTROLS_CHECKLIST.length}
            )
          </button>
          <button
            type="button"
            className={`btn sm ${activeTab === 'residency' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('residency')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <Globe size={14} />
            Data Residency
          </button>
          <button
            type="button"
            className={`btn sm ${activeTab === 'subprocessors' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('subprocessors')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <ShieldCheck size={14} />
            Subprocessors
          </button>
          <button
            type="button"
            className={`btn sm ${activeTab === 'rights' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('rights')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <FileText size={14} />
            DPA & User Rights
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {activeTab === 'soc2' && (
            <div>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      color: 'var(--ink)',
                    }}
                  >
                    SOC 2 Type II Trust Services Criteria
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--muted)',
                      marginTop: 2,
                    }}
                  >
                    Continuous verification across Security, Availability,
                    Confidentiality, and Privacy controls.
                  </div>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 16,
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#22c55e',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                >
                  100% Implemented
                </span>
              </div>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {SOC2_CONTROLS_CHECKLIST.map((ctrl) => (
                  <div
                    key={ctrl.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                          {ctrl.id}: {ctrl.title}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--soft)',
                          color: 'var(--muted)',
                          fontWeight: 600,
                        }}
                      >
                        {ctrl.category}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: '4px 0 6px',
                        fontSize: '0.8rem',
                        color: 'var(--ink)',
                        lineHeight: 1.4,
                      }}
                    >
                      {ctrl.description}
                    </p>
                    {ctrl.evidence && (
                      <div
                        style={{
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          color: 'var(--muted)',
                          background: 'var(--soft)',
                          padding: '4px 8px',
                          borderRadius: 4,
                        }}
                      >
                        Evidence: {ctrl.evidence}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'residency' && (
            <div>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--ink)',
                  lineHeight: 1.5,
                  marginBottom: 16,
                }}
              >
                MeetIT supports localized data residency and edge routing.
                Selecting a primary residency region ensures your meeting
                metadata, user recordings, and signaling channels are pinned to
                that jurisdiction.
              </p>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {[
                  {
                    id: 'eu-central-1' as const,
                    name: 'Frankfurt, Germany (EU Central)',
                    flag: '🇪🇺',
                    framework: 'GDPR Article 44+ Certified',
                    desc: 'Strict European data boundary isolation. Zero data transfer outside EU boundaries.',
                  },
                  {
                    id: 'af-south-1' as const,
                    name: 'Cape Town / Johannesburg (Africa South)',
                    flag: '🇿🇦',
                    framework: 'NDPR / POPIA Compliant',
                    desc: 'Sub-40ms lowest latency across Nigeria, Ghana, Kenya, and South Africa with local failover.',
                  },
                  {
                    id: 'us-east-1' as const,
                    name: 'N. Virginia, USA (US East)',
                    flag: '🇺🇸',
                    framework: 'SOC 2 / CCPA Compliant',
                    desc: 'High-capacity North American cluster with direct backbone peering to major enterprise providers.',
                  },
                ].map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 16,
                      borderRadius: 8,
                      border:
                        region === item.id
                          ? '2px solid var(--accent)'
                          : '1px solid var(--line)',
                      background:
                        region === item.id ? 'var(--soft)' : 'var(--surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="dataResidency"
                      checked={region === item.id}
                      onChange={() => handleRegionChange(item.id)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontWeight: 700,
                          fontSize: '0.9rem',
                        }}
                      >
                        <span>{item.flag}</span>
                        <span>{item.name}</span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: '#22c55e',
                          }}
                        >
                          {item.framework}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '0.8rem',
                          color: 'var(--muted)',
                          lineHeight: 1.4,
                        }}
                      >
                        {item.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'subprocessors' && (
            <div>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--ink)',
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}
              >
                MeetIT engages trusted third-party subprocessors to provide
                infrastructure and communications services under signed Data
                Processing Agreements.
              </p>

              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
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
                      }}
                    >
                      <th style={{ padding: '8px 12px' }}>Subprocessor</th>
                      <th style={{ padding: '8px 12px' }}>Purpose</th>
                      <th style={{ padding: '8px 12px' }}>Data Location</th>
                      <th style={{ padding: '8px 12px' }}>DPA Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUBPROCESSORS_REGISTRY.map((sub) => (
                      <tr
                        key={sub.name}
                        style={{ borderBottom: '1px solid var(--line)' }}
                      >
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                          <a
                            href={sub.privacyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              color: 'var(--accent)',
                              textDecoration: 'none',
                            }}
                          >
                            {sub.name}
                            <ExternalLink size={12} />
                          </a>
                        </td>
                        <td
                          style={{ padding: '8px 12px', color: 'var(--ink)' }}
                        >
                          {sub.purpose}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            color: 'var(--muted)',
                            fontSize: '0.75rem',
                          }}
                        >
                          {sub.dataLocation}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(34, 197, 94, 0.15)',
                              color: '#22c55e',
                              fontWeight: 600,
                            }}
                          >
                            DPA Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'rights' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>
                  Data Processing Agreement (DPA)
                </h4>
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                  }}
                >
                  Execute our standard Article 28 GDPR / NDPR DPA with standard
                  contractual clauses (SCCs) for your organization.
                </p>
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={handleDownloadDpa}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.82rem',
                  }}
                >
                  <Download size={14} />
                  Download Standard DPA (.txt)
                </button>
              </div>

              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--line)',
                  margin: '16px 0',
                }}
              />

              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>
                  Data Portability (GDPR Art. 20)
                </h4>
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                  }}
                >
                  Download a machine-readable JSON archive containing all your
                  hosted rooms, meeting notes, transcripts, recordings metadata,
                  and audit events.
                </p>
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={handleExportData}
                  disabled={isExporting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.82rem',
                  }}
                >
                  <Download size={14} />
                  {isExporting
                    ? 'Generating JSON Archive...'
                    : 'Export Complete User Data (JSON)'}
                </button>
              </div>

              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--line)',
                  margin: '16px 0',
                }}
              />

              <div>
                <h4
                  style={{
                    margin: '0 0 6px',
                    fontSize: '0.95rem',
                    color: 'var(--danger)',
                  }}
                >
                  Right to Erasure (GDPR Art. 17 / NDPR)
                </h4>
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                  }}
                >
                  Permanently delete your profile, meeting rooms, notes,
                  recorded sessions, and audit entries.
                </p>
                {onRequestDeleteAccount && (
                  <button
                    type="button"
                    className="btn danger sm"
                    onClick={onRequestDeleteAccount}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.82rem',
                    }}
                  >
                    <Trash2 size={14} />
                    Request Permanent Erasure
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}
        >
          <button type="button" className="btn secondary sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
