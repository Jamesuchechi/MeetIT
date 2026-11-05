import React, { useState } from 'react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import { SunIcon, MoonIcon } from './Icons';

interface AuthViewProps {
  initialMode?: 'signin' | 'signup';
  currentTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigateHome: () => void;
  onNavigateDashboard: () => void;
  onToast: (msg: string) => void;
}

export function AuthView({
  initialMode = 'signin',
  currentTheme,
  onToggleTheme,
  onNavigateHome,
  onNavigateDashboard,
  onToast,
}: AuthViewProps) {
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
    signInWithGoogle,
    signInDemo,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [method, setMethod] = useState<'password' | 'magic-link'>('password');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const res = await signUpWithEmail(email, password, fullName);
        if (res.error) {
          setError(res.error);
        } else if (res.confirmationSent) {
          setMagicLinkSent(true);
          onToast('Check your inbox to verify your account.');
        } else {
          onToast(`Welcome to MeetIT, ${fullName || 'Host'}!`);
          onNavigateDashboard();
        }
      } else {
        // Sign in mode
        if (method === 'magic-link') {
          const res = await signInWithMagicLink(email);
          if (res.error) {
            setError(res.error);
          } else {
            setMagicLinkSent(true);
            onToast('Magic link sent to your email.');
          }
        } else {
          const res = await signInWithEmail(email, password);
          if (res.error) {
            setError(res.error);
          } else {
            onToast('Signed in successfully.');
            onNavigateDashboard();
          }
        }
      }
    } catch (err) {
      setError((err as Error).message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = () => {
    setLoading(true);
    signInDemo();
    onToast('Signed in as Ada Okafor (Demo Pro Host).');
    setTimeout(() => {
      onNavigateDashboard();
    }, 200);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const res = await signInWithGoogle();
    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else {
      onToast('Signed in with Google.');
      onNavigateDashboard();
    }
  };

  return (
    <div className="auth-container">
      {/* Top Utility Nav */}
      <header className="auth-top-bar">
        <button
          type="button"
          className="brand-btn"
          onClick={onNavigateHome}
          aria-label="Back to MeetIT Home"
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <Logo size="sm" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            className="btn ghost sm"
            onClick={onNavigateHome}
          >
            ← Back to Home
          </button>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-split-layout">
          {/* 1. Left Readonly Showcase Column (Desktop) */}
          <aside
            className="auth-showcase"
            aria-label="MeetIT Features and Highlights"
          >
            <div className="auth-showcase-badge">
              <span className="dot-live" /> Low-Latency WebRTC Platform
            </div>

            <h2 className="auth-showcase-title">
              Video meetings that keep going when networks get rough.
            </h2>

            <p className="auth-showcase-desc">
              Engineered from the packet layer up for independent consultants,
              educators, and distributed teams.
            </p>

            <div className="auth-showcase-features">
              <div className="auth-feature-row">
                <div className="auth-feature-icon">🛡️</div>
                <div>
                  <h4>Audio-First Resilience</h4>
                  <p>
                    Automatic degradation prioritizes voice over video so calls
                    survive packet loss and weak Wi-Fi.
                  </p>
                </div>
              </div>

              <div className="auth-feature-row">
                <div className="auth-feature-icon">📝</div>
                <div>
                  <h4>Meeting Notes & Action Items</h4>
                  <p>
                    In-call scratchpad, automated AI summaries, and timestamped
                    decisions archived in your dashboard.
                  </p>
                </div>
              </div>

              <div className="auth-feature-row">
                <div className="auth-feature-icon">⚡</div>
                <div>
                  <h4>Zero-Friction Guest Access</h4>
                  <p>
                    Instant 3-4-3 room codes (e.g. <code>kbt-mpxw-nqy</code>)
                    that open in any browser without app installs.
                  </p>
                </div>
              </div>
            </div>

            <div className="auth-showcase-quote">
              <p>
                &ldquo;Finally, client calls that stay rock-solid even on
                unpredictable mobile hotspots and hotel Wi-Fi.&rdquo;
              </p>
              <div className="auth-quote-author">
                <div
                  className="av"
                  style={{ width: '32px', height: '32px', fontSize: '13px' }}
                >
                  A
                </div>
                <div>
                  <b>Ada Okafor</b>
                  <small>Independent Consultant · Brightline</small>
                </div>
              </div>
            </div>
          </aside>

          {/* 2. Right Form Column */}
          <div className="auth-card">
            <div className="auth-header">
              <h1 className="auth-title">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="auth-subtitle">
                {mode === 'signin'
                  ? 'Sign in to access your meetings, recordings, and notes.'
                  : 'Join MeetIT for reliable video calls on any network.'}
              </p>
            </div>

            {/* Quick Demo Login Option */}
            <div className="auth-demo-banner">
              <div className="auth-demo-content">
                <b>Fast Demo Access</b>
                <span>Test the dashboard immediately as a Pro host</span>
              </div>
              <button
                type="button"
                className="btn primary sm"
                onClick={handleDemoSignIn}
                disabled={loading}
              >
                Sign in as Ada Okafor
              </button>
            </div>

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>

            {/* Feedback & Error Alerts */}
            {error && (
              <div className="auth-alert error" role="alert">
                <span>{error}</span>
              </div>
            )}

            {magicLinkSent ? (
              <div className="auth-magic-confirmation">
                <div className="auth-magic-icon">✉️</div>
                <h3>Check your inbox</h3>
                <p>
                  We sent a secure login link to <b>{email}</b>. Click the link
                  to sign in immediately.
                </p>
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => setMagicLinkSent(false)}
                  style={{ marginTop: '12px' }}
                >
                  Use another method
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                {mode === 'signup' && (
                  <div className="auth-field">
                    <label htmlFor="auth-name">Full name</label>
                    <input
                      id="auth-name"
                      type="text"
                      required
                      placeholder="Ada Okafor"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                )}

                <div className="auth-field">
                  <label htmlFor="auth-email">Work email</label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                {mode === 'signin' && method === 'magic-link' ? (
                  <div className="auth-method-hint">
                    <small>
                      We will send a passwordless login link to your email.
                    </small>
                  </div>
                ) : (
                  <div className="auth-field">
                    <div className="auth-field-header">
                      <label htmlFor="auth-pass">Password</label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          className="auth-text-btn"
                          onClick={() => {
                            setMethod('magic-link');
                            setError(null);
                          }}
                        >
                          Email magic link instead?
                        </button>
                      )}
                    </div>
                    <div className="auth-password-wrap">
                      <input
                        id="auth-pass"
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder={
                          mode === 'signup'
                            ? 'At least 6 characters'
                            : 'Your password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="auth-pw-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={
                          showPassword ? 'Hide password' : 'Show password'
                        }
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}

                {mode === 'signin' && method === 'magic-link' && (
                  <button
                    type="button"
                    className="auth-text-btn"
                    onClick={() => {
                      setMethod('password');
                      setError(null);
                    }}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    ← Use password instead
                  </button>
                )}

                <button
                  type="submit"
                  className="btn primary"
                  disabled={loading}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    marginTop: '6px',
                  }}
                >
                  {loading
                    ? 'Connecting…'
                    : mode === 'signup'
                      ? 'Create account'
                      : method === 'magic-link'
                        ? 'Send magic link'
                        : 'Sign in'}
                </button>
              </form>
            )}

            {/* Social OAuth */}
            <div className="auth-social-wrap">
              <button
                type="button"
                className="auth-oauth-btn"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            {/* Mode Switcher Footer */}
            <div className="auth-footer">
              {mode === 'signin' ? (
                <p>
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                      setMagicLinkSent(false);
                    }}
                  >
                    Create one
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                      setMagicLinkSent(false);
                    }}
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
