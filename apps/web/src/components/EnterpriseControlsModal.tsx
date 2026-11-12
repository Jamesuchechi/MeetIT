import React, { useState, useEffect } from 'react';
import {
  Globe,
  Shield,
  Clock,
  Lock,
  Check,
  Copy,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import type { EnterpriseControls, DlpRule, DlpAction } from '@meetit/protocol';
import {
  loadEnterpriseControls,
  saveEnterpriseControls,
  generateDomainVerificationToken,
  verifyDomainTxtRecord,
} from '../lib/enterpriseControlsService';

interface EnterpriseControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function EnterpriseControlsModal({
  isOpen,
  onClose,
  onToast,
}: EnterpriseControlsModalProps) {
  const [activeTab, setActiveTab] = useState<
    'domains' | 'policies' | 'retention' | 'dlp'
  >('domains');
  const [controls, setControls] = useState<EnterpriseControls | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void (async () => {
        const loaded = await loadEnterpriseControls();
        setControls(loaded);
      })();
    }
  }, [isOpen]);

  if (!isOpen || !controls) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    onToast('Copied to clipboard');
  };

  const handleSave = async (updated = controls) => {
    setIsSaving(true);
    try {
      await saveEnterpriseControls(updated);
      setControls({ ...updated });
      onToast('Enterprise controls updated.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDomain = () => {
    const d = newDomain
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '');
    if (!d) return;
    if (controls.capturedDomains.includes(d)) {
      onToast('Domain already in list.');
      return;
    }
    const token = generateDomainVerificationToken(d);
    const updated: EnterpriseControls = {
      ...controls,
      capturedDomains: [...controls.capturedDomains, d],
      domainVerificationTokens: {
        ...(controls.domainVerificationTokens ?? {}),
        [d]: token,
      },
    };
    setNewDomain('');
    void handleSave(updated);
  };

  const handleRemoveDomain = (d: string) => {
    const nextTokens = { ...(controls.domainVerificationTokens ?? {}) };
    delete nextTokens[d];
    const updated: EnterpriseControls = {
      ...controls,
      capturedDomains: controls.capturedDomains.filter((x) => x !== d),
      domainVerificationTokens: nextTokens,
    };
    void handleSave(updated);
  };

  const handleVerifyDomain = async (d: string) => {
    const token = controls.domainVerificationTokens?.[d];
    if (!token) return;
    setVerifyingDomain(d);
    try {
      const res = await verifyDomainTxtRecord(d, token);
      onToast(res.message);
    } finally {
      setVerifyingDomain(null);
    }
  };

  const handleToggleDlpRule = (ruleId: string) => {
    const updatedRules = controls.dlpRules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
    );
    const updated = { ...controls, dlpRules: updatedRules };
    void handleSave(updated);
  };

  const handleChangeDlpAction = (ruleId: string, action: DlpAction) => {
    const updatedRules = controls.dlpRules.map((r) =>
      r.id === ruleId ? { ...r, action } : r,
    );
    const updated = { ...controls, dlpRules: updatedRules };
    void handleSave(updated);
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--line)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
          color: 'var(--ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'grid',
                placeItems: 'center',
                color: '#10b981',
              }}
            >
              <Globe size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>
                Enterprise Security &amp; Policy Controls
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Domain Capture, Waiting Room, Retention &amp; Data Loss
                Prevention (DLP)
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--line)',
            padding: '0 24px',
            background: 'var(--soft)',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('domains')}
            style={{
              padding: '12px 16px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'domains'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color: activeTab === 'domains' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.88rem',
              whiteSpace: 'nowrap',
            }}
          >
            Domain Capture
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('policies')}
            style={{
              padding: '12px 16px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'policies'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color:
                activeTab === 'policies' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.88rem',
              whiteSpace: 'nowrap',
            }}
          >
            Meeting Policies
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('retention')}
            style={{
              padding: '12px 16px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'retention'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color:
                activeTab === 'retention' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.88rem',
              whiteSpace: 'nowrap',
            }}
          >
            Data Retention
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dlp')}
            style={{
              padding: '12px 16px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'dlp'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color: activeTab === 'dlp' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.88rem',
              whiteSpace: 'nowrap',
            }}
          >
            DLP Content Scanner
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* 1. Domain Capture */}
          {activeTab === 'domains' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  background: 'var(--soft)',
                  padding: '14px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Corporate Domain Ownership &amp; Capture:
                </div>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--muted)',
                    fontSize: '0.82rem',
                  }}
                >
                  Verify ownership of your corporate email domains via DNS TXT
                  records. All employees who register with your captured domains
                  will automatically join your organization with security
                  policies enforced.
                </p>
              </div>

              {/* Add Domain */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="acme.com or subsidiary.org"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDomain();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                  }}
                />
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleAddDomain}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Plus size={15} /> Add Domain
                </button>
              </div>

              {/* Domains List */}
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {controls.capturedDomains.map((dom) => {
                  const token = controls.domainVerificationTokens?.[dom] ?? '';
                  return (
                    <div
                      key={dom}
                      style={{
                        padding: '14px',
                        borderRadius: 10,
                        background: 'var(--soft)',
                        border: '1px solid var(--line)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <strong style={{ fontSize: '0.95rem' }}>{dom}</strong>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            DNS Verified
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-icon-subtle"
                          onClick={() => handleRemoveDomain(dom)}
                          title="Remove Domain"
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {token && (
                        <div
                          style={{
                            background: 'var(--surface)',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--line)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.78rem',
                          }}
                        >
                          <div
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span
                              style={{ color: 'var(--muted)', marginRight: 6 }}
                            >
                              DNS TXT:
                            </span>
                            <code style={{ fontFamily: 'monospace' }}>
                              {token}
                            </code>
                          </div>
                          <div
                            style={{ display: 'flex', gap: 6, marginLeft: 8 }}
                          >
                            <button
                              type="button"
                              className="btn"
                              style={{
                                padding: '3px 8px',
                                fontSize: '0.75rem',
                              }}
                              onClick={() => handleCopy(token, `token_${dom}`)}
                            >
                              {copiedKey === `token_${dom}` ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={12} />
                              )}{' '}
                              Copy
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{
                                padding: '3px 8px',
                                fontSize: '0.75rem',
                              }}
                              disabled={verifyingDomain === dom}
                              onClick={() => void handleVerifyDomain(dom)}
                            >
                              <RefreshCw
                                size={12}
                                className={
                                  verifyingDomain === dom ? 'spin' : ''
                                }
                              />{' '}
                              Check DNS
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {controls.capturedDomains.length === 0 && (
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--muted)',
                      textAlign: 'center',
                      padding: '16px',
                    }}
                  >
                    No domains added yet. Enter your corporate domain above to
                    enforce domain capture.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. Meeting Security Policies */}
          {activeTab === 'policies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: 10,
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    Forced Waiting Room for External Guests
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Anyone joining from outside your verified organization
                    domains must be admitted by the host.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={controls.forcedWaitingRoom}
                  onChange={(e) => {
                    const updated = {
                      ...controls,
                      forcedWaitingRoom: e.target.checked,
                    };
                    void handleSave(updated);
                  }}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: 10,
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    Require Host to Start Call
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Participants cannot enter or speak in the room until an
                    organization host joins.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={controls.requireHostPresent}
                  onChange={(e) => {
                    const updated = {
                      ...controls,
                      requireHostPresent: e.target.checked,
                    };
                    void handleSave(updated);
                  }}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: 10,
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    Prevent External Guest Screen Sharing
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Restricts presentation privileges strictly to verified
                    organization team members.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={controls.preventGuestScreenshare}
                  onChange={(e) => {
                    const updated = {
                      ...controls,
                      preventGuestScreenshare: e.target.checked,
                    };
                    void handleSave(updated);
                  }}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: 10,
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    Digital Video Watermarking
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Superimpose the viewer's email and IP address subtly across
                    video tiles to deter leaks.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={controls.watermarkVideo}
                  onChange={(e) => {
                    const updated = {
                      ...controls,
                      watermarkVideo: e.target.checked,
                    };
                    void handleSave(updated);
                  }}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* 3. Data Retention Policies */}
          {activeTab === 'retention' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  background: 'var(--soft)',
                  padding: '14px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Automated Corporate Data Retention:
                </div>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--muted)',
                    fontSize: '0.82rem',
                  }}
                >
                  Set legal and compliance data lifespan limits. Data exceeding
                  these thresholds is automatically purged permanently from
                  databases, cloud object stores, and client caches.
                </p>
              </div>

              {/* Recordings Retention */}
              <div
                style={{
                  background: 'var(--soft)',
                  padding: '14px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    Cloud Recordings Retention:
                  </span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                    {controls.retentionDaysRecordings
                      ? `${controls.retentionDaysRecordings} Days`
                      : 'Keep Indefinitely'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="365"
                  step="30"
                  value={controls.retentionDaysRecordings ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setControls({
                      ...controls,
                      retentionDaysRecordings: val === 0 ? null : val,
                    });
                  }}
                  onMouseUp={() => void handleSave()}
                  onTouchEnd={() => void handleSave()}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--muted)',
                    marginTop: 4,
                  }}
                >
                  <span>Indefinite</span>
                  <span>30 Days</span>
                  <span>90 Days</span>
                  <span>180 Days</span>
                  <span>365 Days</span>
                </div>
              </div>

              {/* Chat Retention */}
              <div
                style={{
                  background: 'var(--soft)',
                  padding: '14px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    In-Meeting Chat &amp; Attachments:
                  </span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                    {controls.retentionDaysChat
                      ? `${controls.retentionDaysChat} Days`
                      : 'Keep Indefinitely'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="365"
                  step="30"
                  value={controls.retentionDaysChat ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setControls({
                      ...controls,
                      retentionDaysChat: val === 0 ? null : val,
                    });
                  }}
                  onMouseUp={() => void handleSave()}
                  onTouchEnd={() => void handleSave()}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>

              {/* Transcripts Retention */}
              <div
                style={{
                  background: 'var(--soft)',
                  padding: '14px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    AI Meeting Transcripts &amp; Summaries:
                  </span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                    {controls.retentionDaysTranscripts
                      ? `${controls.retentionDaysTranscripts} Days`
                      : 'Keep Indefinitely'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="365"
                  step="30"
                  value={controls.retentionDaysTranscripts ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setControls({
                      ...controls,
                      retentionDaysTranscripts: val === 0 ? null : val,
                    });
                  }}
                  onMouseUp={() => void handleSave()}
                  onTouchEnd={() => void handleSave()}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* 4. Data Loss Prevention (DLP) */}
          {activeTab === 'dlp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: 10,
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    Enable Real-Time DLP Content Inspection
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Scans in-meeting chat, captions, and document shares for
                    sensitive data and compliance violations.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={controls.dlpEnabled}
                  onChange={(e) => {
                    const updated = {
                      ...controls,
                      dlpEnabled: e.target.checked,
                    };
                    void handleSave(updated);
                  }}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>

              {/* DLP Rules Table */}
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {controls.dlpRules.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => handleToggleDlpRule(rule.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <div>
                        <strong
                          style={{ fontSize: '0.88rem', display: 'block' }}
                        >
                          {rule.name}
                        </strong>
                        <span
                          style={{ fontSize: '0.75rem', color: 'var(--muted)' }}
                        >
                          Category: {rule.category}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <label
                        style={{ fontSize: '0.78rem', color: 'var(--muted)' }}
                      >
                        Action:
                      </label>
                      <select
                        value={rule.action}
                        onChange={(e) =>
                          handleChangeDlpAction(
                            rule.id,
                            e.target.value as DlpAction,
                          )
                        }
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          background: 'var(--surface)',
                          border: '1px solid var(--line)',
                          color: 'var(--ink)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <option value="block">Block Send</option>
                        <option value="redact">Redact Content</option>
                        <option value="flag">Flag to Audit Log</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
