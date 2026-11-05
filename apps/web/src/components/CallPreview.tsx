import React, { useState, useEffect } from 'react';
import { MicIcon, VidIcon, ScrIcon, EndIcon } from './Icons';
import { LogoMark } from './Logo';

interface CallPreviewProps {
  onAction?: (msg: string) => void;
}

interface Participant {
  name: string;
  initial: string;
  tileClass: string;
  badge?: string;
  muted?: boolean;
}

const PARTICIPANTS: Participant[] = [
  { name: 'Ada', initial: 'A', tileClass: 't1' },
  { name: 'Tunde', initial: 'T', tileClass: 't2', badge: 'Audio only' },
  { name: 'Mei', initial: 'M', tileClass: 't3' },
  { name: 'Daniel', initial: 'D', tileClass: 't4' },
];

export function CallPreview({ onAction }: CallPreviewProps) {
  const [activeSpeakerIndex, setActiveSpeakerIndex] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    const interval = setInterval(() => {
      setActiveSpeakerIndex((prev) => (prev + 1) % PARTICIPANTS.length);
    }, 2400);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="stage" aria-label="Preview of a MeetIT call">
      <div className="bar">
        <div className="dots" aria-hidden="true">
          <b />
          <b />
          <b />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LogoMark size={16} />
          <span>meetit.app/m/kpt-wnrb-hxe</span>
        </div>
      </div>

      <div className="grid">
        {PARTICIPANTS.map((participant, index) => {
          const isLive = index === activeSpeakerIndex;
          return (
            <div
              key={participant.name}
              className={`tile ${participant.tileClass} ${isLive ? 'live' : ''}`}
              title={`${participant.name}${isLive ? ' (speaking)' : ''}`}
            >
              <div className="av">{participant.initial}</div>
              {participant.badge && (
                <span className="weak">{participant.badge}</span>
              )}
              <div className="tag">
                <MicIcon />
                <span>{participant.name}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="dock"
        role="toolbar"
        aria-label="Meeting preview controls"
      >
        <span
          role="button"
          tabIndex={0}
          aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          style={
            isMicMuted ? { background: 'var(--line)', opacity: 0.8 } : undefined
          }
          onClick={() => {
            const next = !isMicMuted;
            setIsMicMuted(next);
            onAction?.(next ? 'Microphone muted.' : 'Microphone unmuted.');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsMicMuted(!isMicMuted);
            }
          }}
        >
          <MicIcon />
        </span>

        <span
          role="button"
          tabIndex={0}
          aria-label={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
          style={
            isVideoOff ? { background: 'var(--line)', opacity: 0.8 } : undefined
          }
          onClick={() => {
            const next = !isVideoOff;
            setIsVideoOff(next);
            onAction?.(next ? 'Camera stopped.' : 'Camera started.');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsVideoOff(!isVideoOff);
            }
          }}
        >
          <VidIcon />
        </span>

        <span
          role="button"
          tabIndex={0}
          aria-label={isSharing ? 'Stop sharing screen' : 'Share screen'}
          style={
            isSharing
              ? { background: 'var(--accent)', color: '#fff' }
              : undefined
          }
          onClick={() => {
            const next = !isSharing;
            setIsSharing(next);
            onAction?.(
              next
                ? 'Screen sharing preview started.'
                : 'Screen sharing stopped.',
            );
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsSharing(!isSharing);
            }
          }}
        >
          <ScrIcon />
        </span>

        <span
          className="end"
          role="button"
          tabIndex={0}
          aria-label="Leave preview call"
          onClick={() => {
            onAction?.(
              'Preview call ended. Click "New meeting" to start a real session.',
            );
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAction?.('Preview call ended.');
            }
          }}
        >
          <EndIcon />
        </span>
      </div>
    </div>
  );
}
