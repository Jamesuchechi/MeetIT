import React, { useState } from 'react';
import {
  ShieldAlert,
  Award,
  FileText,
  Check,
  ExternalLink,
  X,
  Lock,
  Send,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  BOUNTY_TIERS,
  submitVulnerabilityReport,
} from '../lib/bugBountyService';

interface BugBountyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function BugBountyModal({
  isOpen,
  onClose,
  onToast,
}: BugBountyModalProps) {
  const [activeTab, setActiveTab] = useState<'policy' | 'tiers' | 'submit'>(
    'policy',
  );
  const [reporterEmail, setReporterEmail] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [pgpKeyFingerprint, setPgpKeyFingerprint] = useState('');
  const [targetComponent, setTargetComponent] = useState<
    'signaling' | 'e2ee' | 'media' | 'auth' | 'api' | 'web' | 'other'
  >('e2ee');
  const [severity, setSeverity] = useState<
    'critical' | 'high' | 'medium' | 'low'
  >('high');
  const [title, setTitle] = useState('');
  const [vulnerabilityDescription, setVulnerabilityDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [impactAssessment, setImpactAssessment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(
    null,
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !reporterEmail.trim() ||
      !title.trim() ||
      !vulnerabilityDescription.trim() ||
      !stepsToReproduce.trim()
    ) {
      onToast('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitVulnerabilityReport({
        reporterEmail: reporterEmail.trim(),
        reporterName: reporterName.trim() || undefined,
        pgpKeyFingerprint: pgpKeyFingerprint.trim() || undefined,
        targetComponent,
        severity,
        title: title.trim(),
        vulnerabilityDescription: vulnerabilityDescription.trim(),
        stepsToReproduce: stepsToReproduce.trim(),
        impactAssessment: impactAssessment.trim() || undefined,
      });

      if (res.success) {
        setSubmittedReportId(res.reportId);
        onToast('Vulnerability report submitted securely.');
      }
    } finally {
      setIsSubmitting(false);
    }
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
          maxWidth: '700px',
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
                background: 'rgba(234, 179, 8, 0.12)',
                display: 'grid',
                placeItems: 'center',
                color: '#eab308',
              }}
            >
              <Award size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>
                MeetIT Bug Bounty &amp; Vulnerability Disclosure
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Coordinated Vulnerability Disclosure (CVD) · Safe Harbor · RFC
                9116
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
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('policy')}
            style={{
              padding: '12px 18px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'policy'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color: activeTab === 'policy' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Scope &amp; Safe Harbor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tiers')}
            style={{
              padding: '12px 18px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'tiers'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color: activeTab === 'tiers' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Reward Tiers ($100 – $5,000+)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('submit')}
            style={{
              padding: '12px 18px',
              border: 0,
              background: 'transparent',
              borderBottom:
                activeTab === 'submit'
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
              color: activeTab === 'submit' ? 'var(--accent)' : 'var(--muted)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Submit Vulnerability
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Policy & Safe Harbor */}
          {activeTab === 'policy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  padding: '14px',
                  borderRadius: 10,
                  border: '1px solid var(--accent)',
                  fontSize: '0.85rem',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--accent)',
                    marginBottom: 4,
                  }}
                >
                  Legal Safe Harbor Commitment:
                </div>
                <p style={{ margin: 0, color: 'var(--ink)' }}>
                  MeetIT considers security research conducted in accordance
                  with this policy to be authorized. We will not pursue civil or
                  criminal action against researchers acting in good faith who
                  avoid privacy violations, data destruction, and service
                  degradation.
                </p>
              </div>

              <div>
                <h4
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    margin: '0 0 8px',
                  }}
                >
                  Targets in Scope:
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <strong>WebRTC Media &amp; E2EE Transforms</strong>
                    <div style={{ color: 'var(--muted)' }}>
                      Encoded Transform, SFrame, AES-GCM ratchet key manager
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <strong>Signaling Server &amp; Mesh Protocol</strong>
                    <div style={{ color: 'var(--muted)' }}>
                      Websocket envelopes, room state synchronization, access
                      tokens
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <strong>Auth &amp; Database RLS</strong>
                    <div style={{ color: 'var(--muted)' }}>
                      WebAuthn passkeys, 2FA, tenant isolation, Supabase RLS
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <strong>Developer Platform &amp; SDK</strong>
                    <div style={{ color: 'var(--muted)' }}>
                      MeetIt.embed postMessage origin validation, API key
                      scoping
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    margin: '0 0 8px',
                  }}
                >
                  Out of Scope:
                </h4>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 20,
                    fontSize: '0.82rem',
                    color: 'var(--muted)',
                    lineHeight: 1.6,
                  }}
                >
                  <li>
                    Denial of Service (DoS / DDoS) targeting signaling or TURN
                    relay servers.
                  </li>
                  <li>
                    Social engineering, phishing, or physical attacks on MeetIT
                    personnel.
                  </li>
                  <li>
                    Automated high-volume scanner spam without proof-of-concept
                    impact.
                  </li>
                </ul>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                  fontSize: '0.82rem',
                }}
              >
                <span>Official RFC 9116 Specification:</span>
                <a
                  href="/.well-known/security.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    textDecoration: 'none',
                  }}
                >
                  /.well-known/security.txt <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

          {/* Reward Tiers */}
          {activeTab === 'tiers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {BOUNTY_TIERS.map((tier) => (
                <div
                  key={tier.severity}
                  style={{
                    padding: '14px',
                    borderRadius: 10,
                    background: 'var(--soft)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                          background:
                            tier.severity === 'critical'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : tier.severity === 'high'
                                ? 'rgba(249, 115, 22, 0.15)'
                                : 'rgba(59, 130, 246, 0.15)',
                          color:
                            tier.severity === 'critical'
                              ? '#ef4444'
                              : tier.severity === 'high'
                                ? '#f97316'
                                : 'var(--accent)',
                        }}
                      >
                        {tier.severity}
                      </span>
                      <strong style={{ fontSize: '0.95rem' }}>
                        {tier.name}
                      </strong>
                    </div>
                    <span
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: '#10b981',
                      }}
                    >
                      {tier.rangeUsd}
                    </span>
                  </div>
                  <ul
                    style={{
                      margin: '6px 0 0',
                      paddingLeft: 20,
                      fontSize: '0.8rem',
                      color: 'var(--muted)',
                    }}
                  >
                    {tier.examples.map((ex, i) => (
                      <li key={i}>{ex}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Submit Vulnerability Form */}
          {activeTab === 'submit' && (
            <div>
              {submittedReportId ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '28px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Check size={28} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                    Report Submitted Successfully
                  </h3>
                  <p
                    style={{
                      color: 'var(--muted)',
                      fontSize: '0.88rem',
                      maxWidth: 440,
                      margin: 0,
                    }}
                  >
                    Thank you for helping secure the MeetIT communications
                    network. Your report has been assigned tracking ID:
                  </p>
                  <code
                    style={{
                      background: 'var(--soft)',
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: '1px solid var(--line)',
                    }}
                  >
                    {submittedReportId}
                  </code>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setSubmittedReportId(null);
                      setTitle('');
                      setVulnerabilityDescription('');
                      setStepsToReproduce('');
                      setImpactAssessment('');
                    }}
                    style={{ marginTop: 10 }}
                  >
                    Submit Another Finding
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Your Email *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="researcher@example.com"
                        value={reporterEmail}
                        onChange={(e) => setReporterEmail(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Name / Pseudonym (for Hall of Fame)
                      </label>
                      <input
                        type="text"
                        placeholder="Alex Security"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Target Component *
                      </label>
                      <select
                        value={targetComponent}
                        onChange={(e) =>
                          setTargetComponent(e.target.value as any)
                        }
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                        }}
                      >
                        <option value="e2ee">
                          End-to-End Encryption (E2EE / Media)
                        </option>
                        <option value="signaling">
                          Signaling Server / Mesh Protocol
                        </option>
                        <option value="auth">
                          Authentication, 2FA &amp; Passkeys
                        </option>
                        <option value="api">
                          REST APIs &amp; Developer Platform
                        </option>
                        <option value="web">
                          Web Client / Whiteboard / Chat
                        </option>
                        <option value="other">Other System Boundary</option>
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Estimated Severity *
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                        }}
                      >
                        <option value="critical">Critical Impact</option>
                        <option value="high">High Impact</option>
                        <option value="medium">Medium Impact</option>
                        <option value="low">Low Impact</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Vulnerability Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Cryptographic nonce reuse in frame transform decryptor"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Description &amp; Root Cause Analysis *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Describe the vulnerability, affected components, and why it occurs."
                      value={vulnerabilityDescription}
                      onChange={(e) =>
                        setVulnerabilityDescription(e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Steps to Reproduce (PoC) *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Step-by-step instructions or minimal test code to reproduce the issue."
                      value={stepsToReproduce}
                      onChange={(e) => setStepsToReproduce(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={isSubmitting}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Send size={15} />{' '}
                      {isSubmitting
                        ? 'Encrypting & Submitting…'
                        : 'Submit Report Under Safe Harbor'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
