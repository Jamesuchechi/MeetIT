import React from 'react';
import { Logo } from './Logo';
import { HomeIcon, SunIcon, MoonIcon } from './Icons';

interface NotFoundViewProps {
  currentTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigateHome: () => void;
}

export function NotFoundView({
  currentTheme,
  onToggleTheme,
  onNavigateHome,
}: NotFoundViewProps) {
  return (
    <div className="status-page-shell" data-view="404">
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
          <span className="lobby-eyebrow">404 — Page not found</span>
          <h1>We couldn’t find that room or page.</h1>
          <p>
            Check that your meeting code follows the <code>xxx-xxxx-xxx</code>{' '}
            format, or start a fresh meeting from the home screen.
          </p>

          <div className="status-actions">
            <button
              type="button"
              className="btn primary"
              onClick={onNavigateHome}
              data-testid="not-found-home-btn"
            >
              <HomeIcon />
              <span>Return to MeetIT Home</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
