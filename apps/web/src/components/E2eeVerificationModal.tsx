import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  RotateCw,
  Copy,
  Check,
  X,
  Lock,
} from 'lucide-react';
import type { E2eeSasResult } from '@meetit/media';

interface E2eeVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sas: E2eeSasResult | null;
  onAdvanceRatchet?: () => Promise<void>;
  participantCount?: number;
}

export function E2eeVerificationModal({
  isOpen,
  onClose,
  sas,
  onAdvanceRatchet,
  participantCount = 1,
}: E2eeVerificationModalProps) {
  const [copied, setCopied] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!sas) return;
    const text = `MeetIT E2EE SAS: ${sas.sasWords.join(' ')} | ${sas.sasEmoji.join(' ')} | ${sas.formattedFingerprint}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRotate = async () => {
    if (!onAdvanceRatchet || isRotating) return;
    setIsRotating(true);
    try {
      await onAdvanceRatchet();
    } finally {
      setIsRotating(false);
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
        className="modal-card e2ee-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: '92%' }}
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
                End-to-End Encryption
              </h3>
              <p
                style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}
              >
                SFrame / AES-GCM Encoded Transform
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

        <div className="modal-body" style={{ marginTop: 16 }}>
          {/* Status banner */}
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--soft)',
              borderRadius: 8,
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={15} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Zero-Knowledge Protection
              </span>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                fontWeight: 600,
              }}
            >
              Active (Epoch {sas?.epoch ?? 0})
            </span>
          </div>

          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--ink)',
              lineHeight: 1.45,
              margin: '0 0 16px',
            }}
          >
            Audio and video packets are encrypted on your device and can only be
            decrypted by members of this meeting. MeetIT servers cannot inspect
            or record encrypted streams.
          </p>

          {/* Cryptographic Verification Box */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: 16,
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted)',
                fontWeight: 600,
              }}
            >
              Short Authentication String (SAS)
            </span>

            {/* Visual Emojis */}
            <div
              style={{
                fontSize: '2rem',
                letterSpacing: '0.5rem',
                margin: '12px 0 8px',
                userSelect: 'none',
              }}
            >
              {sas?.sasEmoji.join(' ') ?? '🛡️ ⚡ 🌊 🔑'}
            </div>

            {/* SAS Phonetic Words */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap',
                margin: '8px 0 12px',
              }}
            >
              {(sas?.sasWords ?? ['ALPHA', 'FALCON', 'RIVER', 'SHIELD']).map(
                (word, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '4px 10px',
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      letterSpacing: '0.05em',
                      color: 'var(--accent)',
                    }}
                  >
                    {word}
                  </span>
                ),
              )}
            </div>

            <div
              style={{
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: 'var(--muted)',
                marginBottom: 8,
              }}
            >
              {sas?.formattedFingerprint ?? 'E2EE-4F1A-B892-CD04'}
            </div>

            <p
              style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}
            >
              Read these 4 words or symbols aloud with participants (
              {participantCount} in room). If they match, your call is verified
              secure against impersonation.
            </p>
          </div>

          {/* Ratchet & Actions */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              type="button"
              className="btn secondary sm"
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.82rem',
              }}
            >
              {copied ? (
                <Check size={14} style={{ color: '#22c55e' }} />
              ) : (
                <Copy size={14} />
              )}
              {copied ? 'Copied SAS' : 'Copy Verification Code'}
            </button>

            {onAdvanceRatchet && (
              <button
                type="button"
                className="btn secondary sm"
                onClick={handleRotate}
                disabled={isRotating}
                title="Rotate encryption ratchet key forward"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.82rem',
                }}
              >
                <RotateCw size={14} className={isRotating ? 'spinning' : ''} />
                Rotate Key
              </button>
            )}

            <button
              type="button"
              className={`btn sm ${isVerified ? 'primary' : 'secondary'}`}
              onClick={() => setIsVerified(!isVerified)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.82rem',
              }}
            >
              {isVerified ? <Check size={14} /> : <KeyRound size={14} />}
              {isVerified ? 'Verified' : 'Mark Verified'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
