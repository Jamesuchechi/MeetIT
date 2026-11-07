import React from 'react';

export type CaptionFontSize = 'small' | 'medium' | 'large';
export type CaptionPosition = 'bottom' | 'top';

export interface DisplayCaptionCue {
  id: string;
  from: string;
  displayName: string;
  text: string;
  ts: number;
  isFinal: boolean;
  language?: string | undefined;
}

interface CaptionsOverlayProps {
  cues: DisplayCaptionCue[];
  fontSize?: CaptionFontSize;
  position?: CaptionPosition;
  onOpenSettings?: () => void;
  onToggleCaptions?: () => void;
}

export function CaptionsOverlay({
  cues,
  fontSize = 'medium',
  position = 'bottom',
  onOpenSettings,
}: CaptionsOverlayProps) {
  if (cues.length === 0) return null;

  const fontSizes: Record<CaptionFontSize, string> = {
    small: '14px',
    medium: '18px',
    large: '24px',
  };

  const lineHeights: Record<CaptionFontSize, string> = {
    small: '1.4',
    medium: '1.45',
    large: '1.5',
  };

  // Show up to the last 3 most recent cues
  const visibleCues = cues.slice(-3);

  return (
    <div
      className={`captions-overlay-container ${position}`}
      data-testid="captions-overlay"
      role="region"
      aria-label="Live Closed Captions"
      aria-live="polite"
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        [position === 'top' ? 'top' : 'bottom']:
          position === 'top' ? '80px' : '90px',
        width: 'min(90%, 780px)',
        zIndex: 40,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <div
        className="captions-overlay-box"
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          color: '#ffffff',
          borderRadius: '10px',
          padding: '10px 16px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          fontSize: fontSizes[fontSize],
          lineHeight: lineHeights[fontSize],
          maxHeight: '180px',
          overflowY: 'hidden',
          width: '100%',
          textAlign: 'left',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '4px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#38bdf8',
            }}
          >
            CC · Live Captions
          </span>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
              title="Caption settings (Language, Font, Position)"
              aria-label="Caption settings"
            >
              ⚙ Settings
            </button>
          )}
        </div>

        {visibleCues.map((cue) => (
          <div
            key={cue.id}
            className={`caption-cue-line ${cue.isFinal ? 'final' : 'interim'}`}
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'baseline',
              opacity: cue.isFinal ? 1 : 0.85,
              transition: 'opacity 0.15s ease',
            }}
          >
            <strong
              style={{
                color: '#60a5fa',
                fontWeight: 600,
                fontSize: '0.9em',
                flexShrink: 0,
              }}
            >
              {cue.displayName}:
            </strong>
            <span
              style={{
                fontStyle: cue.isFinal ? 'normal' : 'italic',
                wordBreak: 'break-word',
              }}
            >
              {cue.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
