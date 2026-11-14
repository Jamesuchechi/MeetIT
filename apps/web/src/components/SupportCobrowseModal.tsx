import React, { useEffect, useState } from 'react';
import { LifeBuoy, Copy, Trash2, X } from 'lucide-react';
import { copyToClipboard } from '../types';

export interface SupportCobrowseModalProps {
  roomCode: string;
  selfDisplayName: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

interface SupportAnnotation {
  id: string;
  author: string;
  kind: 'pin' | 'rect';
  xPct: number;
  yPct: number;
  label?: string;
  color: string;
  createdAt: string;
}

export function SupportCobrowseModal({
  roomCode,
  selfDisplayName,
  onClose,
  onToast,
}: SupportCobrowseModalProps) {
  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const [annotations, setAnnotations] = useState<SupportAnnotation[]>([]);
  const [pinLabel, setPinLabel] = useState('Click here');

  const embedSnippet = `<script type="module">
  import { MeetIt } from '@meetit/sdk';
  MeetIt.supportWidget({ roomCode: '${roomCode}', buttonText: 'Live Support' });
</script>`;

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/support-annotations`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.annotations)) {
          setAnnotations(data.annotations);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [baseUrl, roomCode]);

  const handleDropPin = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const yPct = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    try {
      const res = await fetch(
        `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/support-annotations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: selfDisplayName,
            kind: 'pin',
            xPct,
            yPct,
            label: pinLabel.trim() || 'Pointer',
            color: '#6366f1',
          }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { annotations: SupportAnnotation[] };
        setAnnotations(data.annotations);
      }
    } catch {
      // ignore offline
    }
  };

  const handleClear = async () => {
    try {
      await fetch(
        `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/support-annotations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clear: true }),
        },
      );
      setAnnotations([]);
    } catch {
      setAnnotations([]);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Support Co-Browse"
      data-testid="support-cobrowse-modal"
    >
      <div
        className="modal-card"
        style={{
          width: 'min(760px, 95vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
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
            <LifeBuoy size={20} />
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              Support &amp; Co-Browsing · {roomCode}
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close Support Co-Browse"
          >
            <X size={16} />
          </button>
        </div>

        {/* Click-to-call SDK Widget Snippet */}
        <section
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <strong>Embeddable Click-to-Call Widget (@meetit/sdk)</strong>
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() =>
                void copyToClipboard(embedSnippet).then(() =>
                  onToast('Support widget snippet copied.'),
                )
              }
            >
              <Copy size={12} /> Copy Snippet
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: 10,
              borderRadius: 8,
              background: 'rgba(0,0,0,0.2)',
              fontSize: 12,
              overflowX: 'auto',
            }}
          >
            {embedSnippet}
          </pre>
        </section>

        {/* Live Co-Browse Annotation Canvas */}
        <section
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <strong>Co-Browsing Annotations (click canvas to drop pin)</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={pinLabel}
                onChange={(e) => setPinLabel(e.target.value)}
                placeholder="Annotation label"
                style={{ width: 160 }}
              />
              <button
                type="button"
                className="btn"
                onClick={() => void handleClear()}
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>
          </div>

          <div
            data-testid="cobrowse-annotation-canvas"
            onClick={(e) => void handleDropPin(e)}
            style={{
              position: 'relative',
              height: 220,
              borderRadius: 10,
              border: '1px dashed var(--border)',
              background: 'rgba(99, 102, 241, 0.05)',
              cursor: 'crosshair',
              overflow: 'hidden',
            }}
          >
            {annotations.map((a) => (
              <div
                key={a.id}
                style={{
                  position: 'absolute',
                  left: `${a.xPct}%`,
                  top: `${a.yPct}%`,
                  transform: 'translate(-50%, -50%)',
                  background: a.color,
                  color: '#fff',
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.author}: {a.label || 'Pin'}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
