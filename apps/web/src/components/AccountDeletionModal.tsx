import React, { useState } from 'react';
import { AlertOctagon, X, Trash2 } from 'lucide-react';
import { purgeAllUserData } from '../lib/accountPurgeService.js';

interface AccountDeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null | undefined;
  onDeleted?: (() => void) | undefined;
}

export function AccountDeletionModal({
  isOpen,
  onClose,
  userId,
  onDeleted,
}: AccountDeletionModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const canPurge = confirmText.trim() === 'DELETE';

  const handlePurge = async () => {
    if (!canPurge || isPurging) return;
    setIsPurging(true);
    setError(null);

    const result = await purgeAllUserData(userId ?? undefined);
    setIsPurging(false);

    if (result.success) {
      if (onDeleted) onDeleted();
      window.location.href = '/';
    } else {
      setError(result.error || 'Failed to erase data');
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
        className="modal-card account-purge-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, width: '92%' }}
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
              <AlertOctagon size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Erase Account & Data
              </h3>
              <p
                style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}
              >
                GDPR Art. 17 / NDPR Right to Erasure
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
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: 'var(--ink)',
              fontSize: '0.82rem',
              lineHeight: 1.45,
              marginBottom: 16,
            }}
          >
            <strong>Warning: This action is permanent and irreversible.</strong>
            <p style={{ margin: '6px 0 0' }}>
              All your hosted meeting rooms, cloud recordings, collaborative
              notes, transcripts, API keys, and account credentials will be
              permanently erased immediately.
            </p>
          </div>

          {error && (
            <div
              style={{
                color: 'var(--danger)',
                fontSize: '0.82rem',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                marginBottom: 6,
                color: 'var(--ink)',
              }}
            >
              Type <code>DELETE</code> to confirm permanent erasure:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                fontWeight: 700,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn secondary sm"
              onClick={onClose}
              disabled={isPurging}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn danger sm"
              onClick={handlePurge}
              disabled={!canPurge || isPurging}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} />
              {isPurging
                ? 'Erasing Everything...'
                : 'Permanently Delete My Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
