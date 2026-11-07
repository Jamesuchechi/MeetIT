import React, { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const APP_ENV = import.meta.env.MODE || 'production';

export interface JoinTelemetryStats {
  attempts: number;
  successes: number;
  failures: number;
  successRatePct: number;
  lastUpdated: string | null;
}

const STORAGE_KEY = 'meetit_join_telemetry';
let memoryStats: JoinTelemetryStats | null = null;

export function getJoinTelemetryStats(): JoinTelemetryStats {
  if (memoryStats) {
    return { ...memoryStats };
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  ) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<JoinTelemetryStats>;
        const attempts = Number(parsed.attempts) || 0;
        const successes = Number(parsed.successes) || 0;
        const failures = Number(parsed.failures) || 0;
        const successRatePct =
          attempts > 0
            ? Number(((successes / attempts) * 100).toFixed(1))
            : 100;
        memoryStats = {
          attempts,
          successes,
          failures,
          successRatePct,
          lastUpdated: parsed.lastUpdated ?? null,
        };
        return { ...memoryStats };
      }
    } catch {
      // Ignore storage parse error
    }
  }

  return {
    attempts: 0,
    successes: 0,
    failures: 0,
    successRatePct: 100,
    lastUpdated: null,
  };
}

function saveTelemetry(
  stats: Omit<JoinTelemetryStats, 'successRatePct'>,
): void {
  const successRatePct =
    stats.attempts > 0
      ? Number(((stats.successes / stats.attempts) * 100).toFixed(1))
      : 100;
  const full: JoinTelemetryStats = { ...stats, successRatePct };
  memoryStats = { ...full };

  if (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  ) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    } catch {
      // Ignore storage write error
    }
  }
}

export function resetJoinTelemetryStats(): void {
  memoryStats = null;
  if (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  ) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
  }
}

export function recordCallJoinAttempt(roomCode: string): void {
  const current = getJoinTelemetryStats();
  saveTelemetry({
    attempts: current.attempts + 1,
    successes: current.successes,
    failures: current.failures,
    lastUpdated: new Date().toISOString(),
  });

  if (SENTRY_DSN) {
    Sentry.addBreadcrumb({
      category: 'call.join',
      message: `Join attempt for room: ${roomCode}`,
      level: 'info',
    });
  }
}

export function recordCallJoinSuccess(roomCode: string): void {
  const current = getJoinTelemetryStats();
  saveTelemetry({
    attempts: current.attempts,
    successes: current.successes + 1,
    failures: current.failures,
    lastUpdated: new Date().toISOString(),
  });

  if (SENTRY_DSN) {
    Sentry.addBreadcrumb({
      category: 'call.join',
      message: `Join succeeded for room: ${roomCode}`,
      level: 'info',
    });
  }
}

export function recordCallJoinFailure(roomCode: string, reason: string): void {
  const current = getJoinTelemetryStats();
  saveTelemetry({
    attempts: current.attempts,
    successes: current.successes,
    failures: current.failures + 1,
    lastUpdated: new Date().toISOString(),
  });

  if (SENTRY_DSN) {
    Sentry.captureMessage(
      `Join failure in room ${roomCode}: ${reason}`,
      'warning',
    );
  }
}

export function captureException(
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  if (SENTRY_DSN) {
    if (extra !== undefined) {
      Sentry.captureException(error, { extra });
    } else {
      Sentry.captureException(error);
    }
  } else {
    console.error('[Telemetry Error]', error, extra);
  }
}

export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  extra?: Record<string, unknown>,
): void {
  if (SENTRY_DSN) {
    if (extra !== undefined) {
      Sentry.captureMessage(message, { level, extra });
    } else {
      Sentry.captureMessage(message, level);
    }
  } else {
    console.log(`[Telemetry ${level.toUpperCase()}]`, message, extra);
  }
}

export function initTelemetry(): void {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: APP_ENV,
      tracesSampleRate: 0.2,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'AbortError: The user aborted a request',
        'The play() request was interrupted by a new load request',
        'The play() request was interrupted by a call to pause()',
      ],
    });
  }

  if (typeof window !== 'undefined') {
    // Expose diagnostic interface for debugging & automated checks
    (
      window as unknown as { __meetit_telemetry__: unknown }
    ).__meetit_telemetry__ = {
      getStats: getJoinTelemetryStats,
      reset: resetJoinTelemetryStats,
      recordAttempt: recordCallJoinAttempt,
      recordSuccess: recordCallJoinSuccess,
      recordFailure: recordCallJoinFailure,
    };

    window.addEventListener('unhandledrejection', (event) => {
      // Don't report abort errors
      if (event.reason?.name === 'AbortError') return;
      captureException(event.reason, { source: 'unhandledrejection' });
    });
  }
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    captureException(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/dashboard';
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg, #0b0f19)',
            color: 'var(--fg, #f8fafc)',
            padding: '24px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: '#161e2e',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '32px 24px',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '24px',
              }}
            >
              ⚠️
            </div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '8px',
                color: '#f8fafc',
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: '#94a3b8',
                lineHeight: 1.5,
                marginBottom: '24px',
              }}
            >
              An unexpected application error occurred. We have logged this
              issue to telemetry.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Reload application
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#f8fafc',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
