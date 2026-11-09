import React, { useState } from 'react';
import type { WebinarStreamOut } from '@meetit/protocol';
import { Radio, X, Copy, Check, Play, Square } from 'lucide-react';

interface WebinarStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamOut?: WebinarStreamOut | undefined;
  roomCode: string;
  onStartStream: (params: {
    rtmpUrl?: string;
    streamKey?: string;
    hlsUrl?: string;
  }) => void;
  onStopStream: () => void;
}

export const WebinarStreamModal: React.FC<WebinarStreamModalProps> = ({
  isOpen,
  onClose,
  streamOut,
  roomCode,
  onStartStream,
  onStopStream,
}) => {
  const [platform, setPlatform] = useState<
    'youtube' | 'facebook' | 'linkedin' | 'twitch' | 'custom'
  >('youtube');
  const [rtmpUrl, setRtmpUrl] = useState(
    streamOut?.rtmpUrl || 'rtmp://a.rtmp.youtube.com/live2',
  );
  const [streamKey, setStreamKey] = useState(streamOut?.streamKey || '');
  const [customHls, setCustomHls] = useState(
    streamOut?.hlsUrl || `https://live.meetit.live/hls/${roomCode}/index.m3u8`,
  );
  const [copiedHls, setCopiedHls] = useState(false);

  if (!isOpen) return null;

  const isLive = streamOut?.status === 'live';

  const handlePlatformChange = (p: typeof platform) => {
    setPlatform(p);
    if (p === 'youtube') setRtmpUrl('rtmp://a.rtmp.youtube.com/live2');
    else if (p === 'facebook')
      setRtmpUrl('rtmps://live-api-s.facebook.com:443/rtmp/');
    else if (p === 'linkedin') setRtmpUrl('rtmp://live.linkedin.com/app/');
    else if (p === 'twitch') setRtmpUrl('rtmp://live.twitch.tv/app/');
  };

  const handleCopyHls = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(customHls);
      setCopiedHls(true);
      setTimeout(() => setCopiedHls(false), 2000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLive) {
      onStopStream();
    } else {
      onStartStream({
        rtmpUrl,
        streamKey,
        hlsUrl: customHls,
      });
    }
  };

  return (
    <div
      className="app-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stream-modal-title"
      onClick={onClose}
    >
      <div className="app-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="app-modal-header">
          <div className="app-modal-title-group">
            <div className="app-modal-icon">
              <Radio size={20} />
            </div>
            <div>
              <h2 id="stream-modal-title" className="app-modal-title">
                Live Stream Broadcast Out
              </h2>
              <p className="app-modal-subtitle">
                Simulcast to YouTube, Facebook, custom RTMP and HLS for 1,000+
                viewers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-modal-close"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="app-modal-body">
          {/* Live Status indicator */}
          <div
            className="panel-card"
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: isLive ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg)',
              borderColor: isLive ? 'rgba(239, 68, 68, 0.3)' : 'var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`panel-badge ${isLive ? 'live' : 'muted'}`}>
                {isLive ? 'Live' : 'Idle'}
              </span>
              <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>
                {isLive
                  ? 'Broadcasting Live to External Platforms'
                  : 'Stream Out Idle'}
              </strong>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* Platform selection pills */}
            <div className="panel-form-group">
              <label>Select Destination Platform</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '6px',
                }}
              >
                {(
                  [
                    'youtube',
                    'facebook',
                    'linkedin',
                    'twitch',
                    'custom',
                  ] as const
                ).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={isLive}
                    onClick={() => handlePlatformChange(p)}
                    style={{
                      padding: '6px 4px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      textTransform: 'capitalize',
                      border: `1px solid ${platform === p ? 'var(--accent)' : 'var(--line)'}`,
                      background:
                        platform === p ? 'var(--soft)' : 'var(--surface)',
                      color: platform === p ? 'var(--accent)' : 'var(--ink)',
                      cursor: isLive ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-form-group">
              <label htmlFor="rtmp-url-input">RTMP Destination URL</label>
              <input
                id="rtmp-url-input"
                type="text"
                disabled={isLive}
                value={rtmpUrl}
                onChange={(e) => setRtmpUrl(e.target.value)}
                className="panel-input"
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            </div>

            <div className="panel-form-group">
              <label htmlFor="stream-key-input">Stream Key</label>
              <input
                id="stream-key-input"
                type="password"
                disabled={isLive}
                placeholder="Paste stream key here..."
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                className="panel-input"
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            </div>

            {/* HLS Stream link */}
            <div className="panel-form-group">
              <label htmlFor="hls-url-input">
                HLS Player URL (Unlimited Viewers CDN)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="hls-url-input"
                  type="text"
                  readOnly
                  value={customHls}
                  onChange={(e) => setCustomHls(e.target.value)}
                  className="panel-input"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                />
                <button
                  type="button"
                  onClick={handleCopyHls}
                  className="panel-btn-secondary"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {copiedHls ? (
                    <>
                      <Check size={14} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
              <button
                type="submit"
                className={isLive ? 'panel-btn-danger' : 'panel-btn-primary'}
                style={{ flex: 1, padding: '10px 16px', fontSize: '13.5px' }}
              >
                {isLive ? (
                  <>
                    <Square size={16} /> Stop Live Stream Out
                  </>
                ) : (
                  <>
                    <Play size={16} /> Start Live Broadcast Out
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="panel-btn-secondary"
              >
                Done
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
