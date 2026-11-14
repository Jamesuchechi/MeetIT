import React, { useEffect, useState } from 'react';
import { Phone, PhoneCall, X } from 'lucide-react';

interface DialInModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  displayName: string;
  onToast: (msg: string) => void;
}

export function DialInModal({
  isOpen,
  onClose,
  roomCode,
  displayName,
  onToast,
}: DialInModalProps) {
  const [dialIn, setDialIn] = useState<{
    dialInNumber: string;
    pin: string;
    sipUri: string;
    sipConfigured: boolean;
  } | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [calling, setCalling] = useState(false);

  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  useEffect(() => {
    if (!isOpen) return;
    void fetch(`${baseUrl}/rooms/${encodeURIComponent(roomCode)}/dial-in`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setDialIn(data);
      })
      .catch(() => {});
  }, [isOpen, roomCode, baseUrl]);

  if (!isOpen) return null;

  const handleCallMe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.trim().length < 7) return;
    setCalling(true);
    try {
      const res = await fetch(
        `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/call-me-back`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: phoneNumber.trim(),
            displayName,
          }),
        },
      );
      const data = (await res.json()) as { message?: string; error?: string };
      onToast(data.message || data.error || 'Call-me-back requested.');
      if (res.ok) setPhoneNumber('');
    } catch {
      onToast('Failed to request call-me-back.');
    } finally {
      setCalling(false);
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
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          width: '95%',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
              Dial-in &amp; Call Me
            </h3>
          </div>
          <button
            type="button"
            className="ctrl-btn sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            display: 'grid',
            gap: 6,
            fontSize: '0.85rem',
          }}
        >
          <div>
            <strong>Dial-in Number:</strong>{' '}
            {dialIn?.dialInNumber ?? 'Loading…'}
          </div>
          <div>
            <strong>Meeting PIN:</strong> <code>{dialIn?.pin ?? '------'}</code>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            SIP URI: {dialIn?.sipUri ?? `sip:${roomCode}@sip.meetit.local`}
          </div>
        </div>

        <form
          onSubmit={(e) => void handleCallMe(e)}
          style={{ display: 'grid', gap: 8 }}
        >
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Data connection weak? Have MeetIT call your phone:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 555 234 5678"
              style={{
                flex: 1,
                padding: '7px 10px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
              }}
            />
            <button
              type="submit"
              className="btn primary sm"
              disabled={calling || phoneNumber.trim().length < 7}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <PhoneCall size={14} />
              <span>{calling ? 'Calling…' : 'Call Me'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
