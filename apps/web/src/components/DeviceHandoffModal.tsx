import { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  Smartphone,
  Laptop,
  ArrowRightLeft,
  Copy,
  Check,
  RefreshCw,
  X,
  ShieldCheck,
  Clock,
  Loader2,
} from 'lucide-react';
import { type DeviceHandoffState, type PeerRole } from '@meetit/protocol';
import {
  createHandoffState,
  generateHandoffUrl,
  generateQrSvg,
  getDeviceDescriptor,
  isHandoffExpired,
} from '../lib/deviceHandoffService';
import type { SignalingClient } from '../lib/signalingClient';

interface DeviceHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  userId: string;
  displayName: string;
  role?: PeerRole;
  mediaState?: {
    audio: boolean;
    video: boolean;
    screen: boolean;
    handRaised: boolean;
  };
  signalingClient: SignalingClient | null;
  onHandoffComplete: (targetDevice: string) => void;
}

type HandoffPhase =
  'generating' | 'waiting' | 'claimed' | 'completed' | 'expired';

export function DeviceHandoffModal({
  isOpen,
  onClose,
  roomCode,
  userId,
  displayName,
  role = 'guest',
  mediaState = { audio: true, video: true, screen: false, handRaised: false },
  signalingClient,
  onHandoffComplete,
}: DeviceHandoffModalProps) {
  const [phase, setPhase] = useState<HandoffPhase>('generating');
  const [handoffState, setHandoffState] = useState<DeviceHandoffState | null>(
    null,
  );
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [targetDeviceName, setTargetDeviceName] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(180);
  const timerRef = useRef<number | null>(null);

  const initHandoff = useCallback(async () => {
    setPhase('generating');
    setCopied(false);
    const state = createHandoffState({
      roomCode,
      userId,
      displayName,
      role,
      mediaState,
    });
    setHandoffState(state);

    const url = generateHandoffUrl(roomCode, state.handoffToken);
    try {
      const svg = await generateQrSvg(url);
      setQrSvg(svg);
      setPhase('waiting');
      setSecondsRemaining(
        Math.max(0, Math.floor((state.expiresAt - Date.now()) / 1000)),
      );

      // Broadcast handoff offer to room signaling
      signalingClient?.sendHandoffInitiate({
        token: state.handoffToken,
        handoffState: state,
      });
    } catch {
      setPhase('expired');
    }
  }, [roomCode, userId, displayName, role, mediaState, signalingClient]);

  // Initialize on open
  useEffect(() => {
    if (!isOpen) {
      setHandoffState(null);
      setQrSvg('');
      setPhase('generating');
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    void initHandoff();
  }, [isOpen, initHandoff]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !handoffState || phase === 'completed') return;

    timerRef.current = window.setInterval(() => {
      if (isHandoffExpired(handoffState)) {
        setPhase('expired');
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } else {
        setSecondsRemaining(
          Math.max(0, Math.floor((handoffState.expiresAt - Date.now()) / 1000)),
        );
      }
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, handoffState, phase]);

  // Signaling listeners for handoff claim and completion
  useEffect(() => {
    if (!isOpen || !signalingClient || !handoffState) return;

    const unClaim = signalingClient.on('handoff.claimed', (evt) => {
      if (evt.token === handoffState.handoffToken) {
        setPhase('claimed');
        setTargetDeviceName(evt.targetDevice);
      }
    });

    const unTransferred = signalingClient.on('handoff.transferred', (evt) => {
      if (evt.token === handoffState.handoffToken) {
        setPhase('completed');
        setTargetDeviceName(evt.targetDevice);
        // Delay 1.5s to let the user see the success confirmation before leaving
        window.setTimeout(() => {
          onHandoffComplete(evt.targetDevice);
        }, 1500);
      }
    });

    return () => {
      unClaim();
      unTransferred();
    };
  }, [isOpen, signalingClient, handoffState, onHandoffComplete]);

  if (!isOpen) return null;

  const currentDevice = getDeviceDescriptor();
  const transferUrl = handoffState
    ? generateHandoffUrl(roomCode, handoffState.handoffToken)
    : '';

  const handleCopyLink = async () => {
    if (!transferUrl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(transferUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = transferUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
    >
      <div
        className="modal-card handoff-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-icon-title">
            <div className="modal-header-icon">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <h2 id="handoff-title" className="modal-title">
                Seamless Device Handoff
              </h2>
              <p className="modal-subtitle">
                Switch to your phone or another computer without leaving the
                meeting
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn-ghost"
            onClick={onClose}
            aria-label="Close device handoff modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="handoff-modal-body">
          {/* Source and Target Device Visualization */}
          <div className="handoff-flow-row">
            <div className="device-node active">
              <Laptop size={18} />
              <div className="device-node-info">
                <span className="node-label">Current Device</span>
                <strong className="node-name">{currentDevice}</strong>
              </div>
            </div>

            <div className="handoff-arrow-indicator">
              <ArrowRightLeft size={16} className="pulse-icon" />
            </div>

            <div
              className={`device-node ${phase === 'claimed' || phase === 'completed' ? 'active' : 'pending'}`}
            >
              <Smartphone size={18} />
              <div className="device-node-info">
                <span className="node-label">Target Device</span>
                <strong className="node-name">
                  {targetDeviceName || 'Scan to connect…'}
                </strong>
              </div>
            </div>
          </div>

          {/* QR Code and Status Box */}
          <div className="handoff-qr-card">
            {phase === 'generating' && (
              <div className="handoff-loading">
                <Loader2 size={36} className="spin" />
                <p>Generating secure migration token…</p>
              </div>
            )}

            {(phase === 'waiting' || phase === 'claimed') && (
              <div className="handoff-qr-view">
                <div
                  className="handoff-qr-wrapper"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  aria-label="QR code for seamless meeting handoff"
                />
                <div className="handoff-scan-instructions">
                  <div className="instructions-badge">
                    <QrCode size={14} />
                    <span>Point phone camera at QR code</span>
                  </div>
                  <div className="handoff-timer">
                    <Clock size={12} />
                    <span>Expires in {formatTime(secondsRemaining)}</span>
                  </div>
                </div>
              </div>
            )}

            {phase === 'claimed' && (
              <div className="handoff-claimed-banner">
                <Loader2 size={16} className="spin" />
                <span>
                  Device connected ({targetDeviceName}). Migrating audio and
                  video…
                </span>
              </div>
            )}

            {phase === 'completed' && (
              <div className="handoff-success-view">
                <div className="success-circle">
                  <Check size={32} />
                </div>
                <h3>Handoff Complete!</h3>
                <p>
                  Call transferred to <strong>{targetDeviceName}</strong>.
                </p>
                <span className="subtext">Leaving meeting on this device…</span>
              </div>
            )}

            {phase === 'expired' && (
              <div className="handoff-expired-view">
                <Clock size={32} className="warning-icon" />
                <h3>Handoff QR Expired</h3>
                <p>
                  For your security, migration tokens expire after 3 minutes.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void initHandoff()}
                >
                  <RefreshCw size={14} />
                  <span>Generate New QR</span>
                </button>
              </div>
            )}
          </div>

          {/* 1-Tap Copy Link Option */}
          {phase !== 'completed' && (
            <div className="handoff-link-section">
              <label
                className="handoff-link-label"
                htmlFor="handoff-transfer-input"
              >
                Or transfer via 1-tap link
              </label>
              <div className="handoff-link-input-group">
                <input
                  id="handoff-transfer-input"
                  type="text"
                  readOnly
                  value={transferUrl}
                  className="handoff-link-input"
                  aria-label="Meeting handoff link"
                />
                <button
                  type="button"
                  className={`btn btn-sm ${copied ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => void handleCopyLink()}
                  disabled={!transferUrl || phase === 'expired'}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Security & Sync Details */}
          <div className="handoff-security-notice">
            <ShieldCheck size={14} />
            <span>
              Your audio, video, permissions, and identity will seamlessly
              transfer without rejoining or entering passcodes.
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
