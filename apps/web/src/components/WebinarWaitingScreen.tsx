import React, { useEffect, useState } from 'react';
import type { WebinarBranding, WebinarState } from '@meetit/protocol';
import { Clock, Radio, Users } from 'lucide-react';

interface WebinarWaitingScreenProps {
  webinar: WebinarState;
  roomTitle?: string;
  onRefresh?: () => void;
}

export const WebinarWaitingScreen: React.FC<WebinarWaitingScreenProps> = ({
  webinar,
  roomTitle,
}) => {
  const branding: WebinarBranding = webinar.branding ?? {
    headline: 'Welcome to our Live Webinar',
    description:
      'The webinar will begin shortly. Please sit tight while our speakers prepare in the green room.',
    speakerBios: [],
  };

  const [timeUntilStart, setTimeUntilStart] = useState<string>('');

  useEffect(() => {
    const targetMs = webinar.startedAt;
    if (!targetMs) return;

    const interval = setInterval(() => {
      const diff = targetMs - Date.now();
      if (diff <= 0) {
        setTimeUntilStart('Starting any moment...');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeUntilStart(`${mins}m ${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [webinar.startedAt]);

  const primaryColor = branding.primaryColor || 'var(--accent)';
  const bgColor = branding.backgroundColor || 'var(--surface)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        padding: '36px 20px',
        color: 'var(--ink)',
        background: bgColor,
        borderRadius: '20px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--line)',
        margin: '16px auto',
        maxWidth: '860px',
        width: '100%',
        textAlign: 'center',
      }}
    >
      {/* Banner backdrop if available */}
      {branding.bannerUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.12,
            pointerEvents: 'none',
            backgroundImage: `url(${branding.bannerUrl})`,
          }}
        />
      )}

      {/* Brand logo or fallback badge */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '640px',
        }}
      >
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt="Webinar Logo"
            style={{
              height: '64px',
              marginBottom: '24px',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            className="app-modal-icon"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              marginBottom: '20px',
              fontSize: '22px',
              fontWeight: 800,
            }}
          >
            <Radio size={28} />
          </div>
        )}

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'var(--soft)',
            border: '1px solid var(--line)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--accent)',
            marginBottom: '16px',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#eab308',
            }}
          />
          <span>Green Room Practice Session Active</span>
        </div>

        <h1
          style={{
            fontSize: '28px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
            color: 'var(--ink)',
          }}
        >
          {branding.headline || roomTitle || 'Webinar Starting Soon'}
        </h1>

        <p
          style={{
            fontSize: '15px',
            color: 'var(--muted)',
            margin: '0 0 24px',
            lineHeight: 1.6,
          }}
        >
          {branding.description ||
            'The host and panelists are finalizing preparations in the practice session. Your broadcast will automatically start as soon as the host goes live.'}
        </p>

        {timeUntilStart && (
          <div
            className="panel-card"
            style={{
              marginBottom: '24px',
              padding: '12px 24px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted)',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              Estimated Countdown
            </span>
            <strong
              style={{
                fontSize: '24px',
                fontFamily: 'monospace',
                color: 'var(--accent)',
              }}
            >
              {timeUntilStart}
            </strong>
          </div>
        )}

        {/* Speaker Bios Section */}
        {branding.speakerBios && branding.speakerBios.length > 0 && (
          <div style={{ width: '100%', marginTop: '16px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted)',
                display: 'block',
                marginBottom: '12px',
              }}
            >
              Featured Speakers &amp; Panelists
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '12px',
                textAlign: 'left',
              }}
            >
              {branding.speakerBios.map((speaker, idx) => (
                <div
                  key={idx}
                  className="panel-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                  }}
                >
                  {speaker.avatarUrl ? (
                    <img
                      src={speaker.avatarUrl}
                      alt={speaker.name}
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      className="app-modal-icon"
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        fontSize: '16px',
                        fontWeight: 700,
                      }}
                    >
                      {speaker.name[0]}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong
                      style={{
                        fontSize: '13.5px',
                        color: 'var(--ink)',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {speaker.name}
                    </strong>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--accent)',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {speaker.role}{' '}
                      {speaker.company ? `· ${speaker.company}` : ''}
                    </span>
                    {speaker.bio && (
                      <span
                        style={{
                          fontSize: '11.5px',
                          color: 'var(--muted)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          marginTop: '2px',
                        }}
                      >
                        {speaker.bio}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: 'var(--muted)',
          }}
        >
          <Clock size={16} style={{ color: 'var(--accent)' }} />
          <span>Waiting for host to broadcast live stage...</span>
        </div>
      </div>
    </div>
  );
};
