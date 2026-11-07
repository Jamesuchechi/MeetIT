import React, { useState } from 'react';
import { CloseIcon, CheckIcon, LnkIcon } from './Icons';
import { copyToClipboard } from '../types';

interface EmailDigestModalProps {
  roomTitle: string;
  digest: {
    subject: string;
    bodyText: string;
    bodyHtml: string;
    mailtoUrl: string;
  };
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function EmailDigestModal({
  roomTitle,
  digest,
  onClose,
  onToast,
}: EmailDigestModalProps) {
  const [copiedType, setCopiedType] = useState<'text' | 'html' | null>(null);

  const handleCopyText = async () => {
    const success = await copyToClipboard(digest.bodyText);
    if (success) {
      setCopiedType('text');
      onToast('Copied email text to clipboard');
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

  const handleCopyHtml = async () => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        window.ClipboardItem
      ) {
        const item = new ClipboardItem({
          'text/html': new Blob([digest.bodyHtml], { type: 'text/html' }),
          'text/plain': new Blob([digest.bodyText], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
        setCopiedType('html');
        onToast('Copied rich HTML email to clipboard');
        setTimeout(() => setCopiedType(null), 2500);
      } else {
        await copyToClipboard(digest.bodyHtml);
        setCopiedType('html');
        onToast('Copied HTML markup to clipboard');
        setTimeout(() => setCopiedType(null), 2500);
      }
    } catch {
      await copyToClipboard(digest.bodyHtml);
      setCopiedType('html');
      onToast('Copied HTML markup to clipboard');
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

  return (
    <div
      className="shortcuts-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-digest-title"
      data-testid="email-digest-modal"
    >
      <div
        className="shortcuts-modal-card"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-head">
          <div>
            <span className="eyebrow" style={{ fontSize: 11 }}>
              Email Digest
            </span>
            <h3 id="email-digest-title" style={{ margin: '2px 0 0' }}>
              Meeting Recap: {roomTitle}
            </h3>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div
          style={{
            margin: '16px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
              }}
            >
              Subject Line:
            </span>
            <div
              style={{
                background: 'var(--soft)',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: '0.9rem',
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              {digest.subject}
            </div>
          </div>

          <div>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--muted)',
              }}
            >
              Body Preview:
            </span>
            <pre
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                padding: '12px 14px',
                borderRadius: 8,
                fontSize: '0.825rem',
                maxHeight: '260px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
                marginTop: 4,
                color: 'var(--ink)',
              }}
            >
              {digest.bodyText}
            </pre>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleCopyText()}
              data-testid="copy-email-text-btn"
            >
              {copiedType === 'text' ? <CheckIcon /> : <LnkIcon />}
              <span>{copiedType === 'text' ? 'Copied Text' : 'Copy Text'}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleCopyHtml()}
              data-testid="copy-email-html-btn"
            >
              {copiedType === 'html' ? <CheckIcon /> : <LnkIcon />}
              <span>
                {copiedType === 'html' ? 'Copied HTML' : 'Copy Rich HTML'}
              </span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              Close
            </button>
            <a
              href={digest.mailtoUrl}
              className="btn btn-sm primary"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-mail-client-btn"
            >
              ✉ Open in Email App
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
