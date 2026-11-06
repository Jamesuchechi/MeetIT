import React, { useState } from 'react';
import { SunIcon, MoonIcon, MenuIcon, CloseIcon } from './Icons';
import { Logo } from './Logo';
import type { AuthUser } from '../types';
import { BackendStatusIndicator } from './BackendStatusIndicator';

interface HeaderProps {
  user: AuthUser | null;
  currentTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigateDashboard: () => void;
  onNavigateHome: () => void;
  onNavigateSignIn: () => void;
  onSignOut?: () => void;
  onShowNotice: (msg: string) => void;
}

export function Header({
  user,
  currentTheme,
  onToggleTheme,
  onNavigateDashboard,
  onNavigateHome,
  onNavigateSignIn,
  onSignOut,
  onShowNotice,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (msg: string) => {
    setMobileMenuOpen(false);
    onShowNotice(msg);
  };

  const handleSignInClick = () => {
    setMobileMenuOpen(false);
    if (user) {
      onNavigateDashboard();
    } else {
      onNavigateSignIn();
    }
  };

  return (
    <header className="top">
      <button
        type="button"
        className="brand-btn"
        onClick={() => {
          setMobileMenuOpen(false);
          onNavigateHome();
        }}
        aria-label="MeetIT Home"
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
      >
        <Logo size="md" />
      </button>

      {/* Desktop Navigation */}
      <nav className="desktop-nav" aria-label="Main navigation">
        <a
          href="#product"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick(
              'Product overview: Low-latency audio-first WebRTC platform.',
            );
          }}
        >
          Product
        </a>
        <a
          href="#pricing"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('Free tier includes unlimited 1:1 meetings.');
          }}
        >
          Pricing
        </a>
        <a
          href="#developers"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick(
              'Developer SDK and API documentation coming in Phase 3.',
            );
          }}
        >
          Developers
        </a>

        <BackendStatusIndicator />

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn primary keep"
              onClick={handleSignInClick}
            >
              Dashboard
            </button>
            {onSignOut && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={onSignOut}
                title="Sign out of account"
              >
                Sign out
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="btn primary keep"
            onClick={handleSignInClick}
          >
            Sign in
          </button>
        )}
      </nav>

      {/* Mobile Header Actions */}
      <div className="mobile-header-actions">
        <BackendStatusIndicator compact />

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-label={
            mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
          }
        >
          {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile Navigation Drawer / Dropdown */}
      {mobileMenuOpen && (
        <>
          <div
            className="mobile-menu-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            className="mobile-menu-drawer"
            role="dialog"
            aria-label="Mobile navigation"
          >
            <div className="mobile-menu-links">
              <a
                href="#product"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(
                    'Product overview: Low-latency audio-first WebRTC platform.',
                  );
                }}
              >
                Product
              </a>
              <a
                href="#pricing"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick('Free tier includes unlimited 1:1 meetings.');
                }}
              >
                Pricing
              </a>
              <a
                href="#developers"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(
                    'Developer SDK and API documentation coming in Phase 3.',
                  );
                }}
              >
                Developers
              </a>
            </div>

            <div className="mobile-menu-footer">
              {user ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    width: '100%',
                  }}
                >
                  <button
                    type="button"
                    className="btn primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleSignInClick}
                  >
                    Go to Dashboard
                  </button>
                  {onSignOut && (
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onSignOut();
                      }}
                    >
                      Sign out ({user.displayName})
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleSignInClick}
                >
                  Sign in to Dashboard
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
