import React, { useEffect, useState } from 'react';
import { Radio, Copy, Plus, X } from 'lucide-react';
import { copyToClipboard } from '../types';

export interface CreatorStudioModalProps {
  roomCode: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

interface StudioState {
  backstageOpen: boolean;
  isLive: boolean;
  guestLinks: Array<{
    id: string;
    label: string;
    token: string;
    createdAt: string;
  }>;
  destinations: Array<{
    id: string;
    platform: 'YouTube' | 'Twitch' | 'Custom RTMP';
    rtmpUrl: string;
    streamKeyMasked: string;
    enabled: boolean;
  }>;
}

export function CreatorStudioModal({
  roomCode,
  onClose,
  onToast,
}: CreatorStudioModalProps) {
  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const [studio, setStudio] = useState<StudioState>({
    backstageOpen: true,
    isLive: false,
    guestLinks: [],
    destinations: [],
  });
  const [guestLabel, setGuestLabel] = useState('');
  const [platform, setPlatform] = useState<
    'YouTube' | 'Twitch' | 'Custom RTMP'
  >('YouTube');
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');

  const updateStudio = async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch(
        `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/creator-studio`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { studio: StudioState };
        setStudio(data.studio);
      }
    } catch {
      // offline fallback
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/creator-studio`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.studio) {
          setStudio(data.studio);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [baseUrl, roomCode]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Creator Studio"
      data-testid="creator-studio-modal"
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
            <Radio size={20} />
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              Creator Studio · {roomCode}
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close Creator Studio"
          >
            <X size={16} />
          </button>
        </div>

        {/* Backstage & Live Controls */}
        <section
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <strong>
              {studio.isLive
                ? 'ON AIR · Multi-destination Live'
                : studio.backstageOpen
                  ? 'Backstage Green Room Active'
                  : 'Stage Standby'}
            </strong>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Prep guests backstage before broadcasting to all enabled targets.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void updateStudio({ backstageOpen: !studio.backstageOpen })
              }
            >
              {studio.backstageOpen ? 'Close Backstage' : 'Open Backstage'}
            </button>
            <button
              type="button"
              className={studio.isLive ? 'btn' : 'btn primary'}
              data-testid="creator-go-live-btn"
              onClick={() => {
                const nextLive = !studio.isLive;
                void updateStudio({ isLive: nextLive });
                onToast(
                  nextLive
                    ? 'Broadcast started to enabled destinations!'
                    : 'Broadcast ended.',
                );
              }}
            >
              {studio.isLive ? 'End Broadcast' : 'Go Live'}
            </button>
          </div>
        </section>

        {/* Guest Links */}
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
          <strong>Backstage Guest Invite Links</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={guestLabel}
              onChange={(e) => setGuestLabel(e.target.value)}
              placeholder="Guest name or role (e.g. Co-host Maya)"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (!guestLabel.trim()) return;
                void updateStudio({ addGuestLabel: guestLabel.trim() });
                setGuestLabel('');
                onToast('Guest speaker link created.');
              }}
            >
              <Plus size={14} />
              <span>Create Link</span>
            </button>
          </div>
          {studio.guestLinks.map((gl) => {
            const url = `${window.location.origin}/#m/${roomCode}?guest=${gl.token}`;
            return (
              <div
                key={gl.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <span>
                  <strong>{gl.label}</strong> · <code>?guest={gl.token}</code>
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() =>
                    void copyToClipboard(url).then(() =>
                      onToast(`Copied guest link for ${gl.label}.`),
                    )
                  }
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
            );
          })}
        </section>

        {/* Multi-destination Streaming */}
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
          <strong>Multi-Destination Streaming Targets</strong>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr 1fr auto',
              gap: 8,
            }}
          >
            <select
              value={platform}
              onChange={(e) => {
                const p = e.target.value as
                  'YouTube' | 'Twitch' | 'Custom RTMP';
                setPlatform(p);
                if (p === 'YouTube')
                  setRtmpUrl('rtmp://a.rtmp.youtube.com/live2');
                if (p === 'Twitch') setRtmpUrl('rtmp://live.twitch.tv/app');
              }}
            >
              <option value="YouTube">YouTube</option>
              <option value="Twitch">Twitch</option>
              <option value="Custom RTMP">Custom RTMP</option>
            </select>
            <input
              type="text"
              value={rtmpUrl}
              onChange={(e) => setRtmpUrl(e.target.value)}
              placeholder="RTMP ingest URL"
            />
            <input
              type="password"
              value={streamKey}
              onChange={(e) => setStreamKey(e.target.value)}
              placeholder="Stream key"
            />
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (!rtmpUrl.trim()) return;
                void updateStudio({
                  addDestination: {
                    platform,
                    rtmpUrl: rtmpUrl.trim(),
                    streamKey: streamKey.trim(),
                  },
                });
                setStreamKey('');
                onToast(`Added ${platform} stream target.`);
              }}
            >
              Add
            </button>
          </div>

          {studio.destinations.map((dest) => (
            <div
              key={dest.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
              }}
            >
              <span>
                <strong>{dest.platform}</strong> · {dest.rtmpUrl} (
                {dest.streamKeyMasked})
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: '4px 8px', fontSize: 12 }}
                onClick={() =>
                  void updateStudio({ toggleDestinationId: dest.id })
                }
              >
                {dest.enabled ? 'Enabled' : 'Paused'}
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
