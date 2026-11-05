import React from 'react';
import { Logo } from './Logo';
import { HomeIcon, VidIcon, SunIcon, MoonIcon } from './Icons';

interface EndedViewProps {
  lastRoomCode: string | null;
  isAuthenticated: boolean;
  currentTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRejoin: (code: string) => void;
  onNavigateHome: () => void;
  onNavigateDashboard: () => void;
}

export function EndedView({
  lastRoomCode,
  isAuthenticated,
  currentTheme,
  onToggleTheme,
  onRejoin,
  onNavigateHome,
  onNavigateDashboard,
}: EndedViewProps) {
  return (
    <div className="status-page-shell" data-view="ended">
      <header className="lobby-header wrap">
        <button
          type="button"
          onClick={onNavigateHome}
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="Back to MeetIT Home"
        >
          <Logo size="md" />
        </button>

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Toggle color theme"
        >
          {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className="status-card-wrap wrap">
        <div className="status-card">
          <span className="lobby-eyebrow">Call ended</span>
          <h1>You left the meeting.</h1>
          <p>
            Thanks for using MeetIT. Your audio and video streams have been
            closed cleanly.
          </p>

          <div className="status-actions">
            {lastRoomCode && (
              <button
                type="button"
                className="btn"
                onClick={() => onRejoin(lastRoomCode)}
                data-testid="rejoin-btn"
              >
                <VidIcon />
                <span>Rejoin {lastRoomCode}</span>
              </button>
            )}

            <button
              type="button"
              className="btn primary"
              onClick={isAuthenticated ? onNavigateDashboard : onNavigateHome}
              data-testid="ended-home-btn"
            >
              <HomeIcon />
              <span>
                {isAuthenticated ? 'Back to dashboard' : 'Back to home'}
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
