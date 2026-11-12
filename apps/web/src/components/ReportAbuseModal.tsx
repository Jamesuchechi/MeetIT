import React, { useState } from 'react';
import { Flag, X, Check, AlertTriangle } from 'lucide-react';
import type { AbuseReportCategory } from '@meetit/protocol';
import { submitAbuseReport } from '../lib/abuseReportService.js';

interface ReportAbuseModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  reportedPeer?: { id: string; displayName: string } | null | undefined;
  reporterId?: string | null | undefined;
  onSubmitted?: (() => void) | undefined;
}

const CATEGORIES: { key: AbuseReportCategory; label: string; desc: string }[] =
  [
    {
      key: 'harassment',
      label: 'Harassment & Bullying',
      desc: 'Targeted hostility, threats, or aggressive behavior toward others',
    },
    {
      key: 'hate_speech',
      label: 'Hate Speech & Discrimination',
      desc: 'Slurs, dehumanizing language, or prejudice based on protected traits',
    },
    {
      key: 'inappropriate_video',
      label: 'Inappropriate Video or Content',
      desc: 'Offensive screen sharing, nudity, violence, or disruptive media',
    },
    {
      key: 'spam_impersonation',
      label: 'Spam & Impersonation',
      desc: 'Pretending to be someone else, bot activity, or unsolicited advertisements',
    },
    {
      key: 'other',
      label: 'Other Violations',
      desc: 'General platform abuse or violation of MeetIT community guidelines',
    },
  ];

export function ReportAbuseModal({
  isOpen,
  onClose,
  roomCode,
  reportedPeer,
  reporterId,
  onSubmitted,
}: ReportAbuseModalProps) {
  const [category, setCategory] = useState<AbuseReportCategory>('harassment');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportedPeer) return;
    setIsSubmitting(true);
    setError(null);

    const res = await submitAbuseReport(
      {
        reportedPeerId: reportedPeer.id,
        roomCode,
        category,
        details: details.trim(),
        timestamp: Date.now(),
      },
      reporterId ?? undefined,
    );

    setIsSubmitting(false);
    if (res.success) {
      setSubmitted(true);
      if (onSubmitted) onSubmitted();
      setTimeout(() => {
        setSubmitted(false);
        setDetails('');
        onClose();
      }, 1800);
    } else {
      setError(res.error || 'Failed to submit report');
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card report-abuse-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: '92%' }}
      >
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--danger)',
              }}
            >
              <Flag size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                Report Participant
              </h3>
              <p
                style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}
              >
                {reportedPeer
                  ? reportedPeer.displayName
                  : 'Meeting participant'}
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

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Check size={28} />
            </div>
            <h4 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>
              Report Submitted
            </h4>
            <p
              style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}
            >
              Thank you for keeping MeetIT safe. Our trust and safety team will
              investigate this room log.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--ink)',
                }}
              >
                Reason for report:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CATEGORIES.map((cat) => (
                  <label
                    key={cat.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border:
                        category === cat.key
                          ? '1px solid var(--accent)'
                          : '1px solid var(--line)',
                      background:
                        category === cat.key ? 'var(--soft)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.83rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="abuseCategory"
                      checked={category === cat.key}
                      onChange={() => setCategory(cat.key)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {cat.label}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--muted)',
                          marginTop: 2,
                        }}
                      >
                        {cat.desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--ink)',
                }}
              >
                Additional details (optional):
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe what occurred during the meeting..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  fontSize: '0.82rem',
                  resize: 'vertical',
                }}
              />
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}
            >
              <button
                type="button"
                className="btn secondary sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn danger sm"
                disabled={isSubmitting}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Flag size={14} />
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
