import React, { useState, useRef, useEffect } from 'react';
import { useBackendHealth } from '../lib/backendHealth';
import { WifiIcon, WifiOffIcon } from './Icons';

interface BackendStatusIndicatorProps {
  compact?: boolean;
  className?: string;
}

export function BackendStatusIndicator({
  compact = false,
  className = '',
}: BackendStatusIndicatorProps) {
  const { status, latencyMs, serverUrl, isColdStart, pingNow } =
    useBackendHealth();
  const [isOpen, setIsOpen] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleManualPing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinging(true);
    try {
      await pingNow();
    } finally {
      setIsPinging(false);
    }
  };

  const statusConfig = {
    live: {
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.3)',
      label: latencyMs ? `${latencyMs}ms` : 'Live',
      tooltip: 'Signaling Server Live',
      badgeText: 'Connected',
      description:
        'The real-time WebRTC signaling server is running and responsive.',
    },
    waking: {
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
      label: 'Waking up...',
      tooltip: 'Waking up server (~30s cold start)',
      badgeText: 'Waking up',
      description:
        'The Render free-tier signaling server is spinning up. This usually takes 20–40 seconds on cold start.',
    },
    checking: {
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgba(99, 102, 241, 0.3)',
      label: 'Checking...',
      tooltip: 'Checking server health',
      badgeText: 'Checking',
      description: 'Verifying connection to the signaling server...',
    },
    offline: {
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.3)',
      label: 'Offline',
      tooltip: 'Signaling Server Offline',
      badgeText: 'Offline',
      description:
        'Cannot reach the signaling backend. Please verify your internet connection or check the server status.',
    },
  }[status];

  return (
    <div
      ref={dropdownRef}
      className={`backend-status-container ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={statusConfig.tooltip}
        aria-label={`Server status: ${statusConfig.badgeText}`}
        aria-expanded={isOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '4px 8px' : '5px 10px',
          borderRadius: 20,
          background: statusConfig.bg,
          border: `1px solid ${statusConfig.border}`,
          color: 'var(--text, #f1f5f9)',
          fontSize: compact ? '0.75rem' : '0.8125rem',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          outline: 'none',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: statusConfig.color,
            boxShadow: `0 0 8px ${statusConfig.color}`,
            animation:
              status === 'waking' || status === 'checking'
                ? 'pulse 1.5s infinite'
                : 'none',
          }}
        />
        {status === 'offline' ? (
          <WifiOffIcon
            style={{
              width: 14,
              height: 14,
              stroke: statusConfig.color,
              strokeWidth: 2,
            }}
          />
        ) : (
          <WifiIcon
            style={{
              width: 14,
              height: 14,
              stroke: statusConfig.color,
              strokeWidth: 2,
            }}
          />
        )}
        {!compact && (
          <span style={{ color: statusConfig.color, fontWeight: 600 }}>
            {statusConfig.label}
          </span>
        )}
      </button>

      {/* Dropdown status card */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Server Connection Status"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 290,
            background: 'var(--card-bg, #1e293b)',
            color: 'var(--text, #f8fafc)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
            borderRadius: 12,
            boxShadow:
              '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            padding: 14,
            zIndex: 1000,
            fontSize: '0.8125rem',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
              borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
              paddingBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: statusConfig.color,
                }}
              />
              <strong style={{ fontSize: '0.875rem' }}>Backend Server</strong>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: 10,
                background: statusConfig.bg,
                color: statusConfig.color,
                fontWeight: 600,
              }}
            >
              {statusConfig.badgeText}
            </span>
          </div>

          <p
            style={{
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.775rem',
              lineHeight: 1.4,
              marginBottom: 10,
            }}
          >
            {statusConfig.description}
          </p>

          <div
            style={{
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 6,
              padding: '6px 8px',
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              color: 'var(--text-dim, #cbd5e1)',
              marginBottom: 12,
              wordBreak: 'break-all',
            }}
          >
            <div>URL: {serverUrl}</div>
            {latencyMs !== null && <div>Latency: {latencyMs} ms</div>}
            {isColdStart && status === 'live' && (
              <div style={{ color: '#10b981', marginTop: 2 }}>
                ✓ Woken up from sleep
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleManualPing}
            disabled={isPinging}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--primary, #3b82f6)',
              color: '#fff',
              border: 'none',
              fontWeight: 500,
              cursor: isPinging ? 'not-allowed' : 'pointer',
              opacity: isPinging ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {isPinging ? 'Pinging server...' : 'Ping / Reconnect'}
          </button>
        </div>
      )}
    </div>
  );
}
