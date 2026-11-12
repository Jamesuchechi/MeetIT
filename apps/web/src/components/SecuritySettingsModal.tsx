import React, { useEffect, useState } from 'react';
import {
  Shield,
  KeyRound,
  Fingerprint,
  Smartphone,
  Laptop,
  Globe,
  Trash2,
  X,
  Check,
  Copy,
  AlertCircle,
  LogOut,
} from 'lucide-react';
import type { PasskeyCredential, UserSession } from '@meetit/protocol';
import {
  getStoredPasskeys,
  registerPasskey,
  deletePasskey,
  isPasskeySupported,
} from '../lib/passkeyService.js';
import {
  getStored2FaConfig,
  getStoredBackupCodes,
  generateBase32Secret,
  generateBackupCodes,
  verify2FaCode,
  enableTwoFactor,
  disableTwoFactor,
} from '../lib/twoFactorService.js';
import {
  getActiveSessions,
  revokeSession,
  revokeAllOtherSessions,
} from '../lib/sessionManagerService.js';
import { logAuditEvent } from '../lib/auditService.js';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?:
    | { id: string; email: string; displayName?: string | undefined }
    | null
    | undefined;
  relayPrivacyEnabled?: boolean | undefined;
  onToggleRelayPrivacy?: ((enabled: boolean) => void) | undefined;
}

export function SecuritySettingsModal({
  isOpen,
  onClose,
  user,
  relayPrivacyEnabled = false,
  onToggleRelayPrivacy,
}: SecuritySettingsModalProps) {
  const [activeTab, setActiveTab] = useState<
    'passkeys' | '2fa' | 'sessions' | 'privacy'
  >('passkeys');

  // Passkeys state
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);

  // 2FA state
  const [twoFaConfig, setTwoFaConfig] = useState(getStored2FaConfig());
  const [twoFaSetupStep, setTwoFaSetupStep] = useState<'idle' | 'setup'>(
    'idle',
  );
  const [setupSecret, setSetupSecret] = useState('');
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<UserSession[]>([]);

  // Relay privacy
  const [relayEnabled, setRelayEnabled] = useState(relayPrivacyEnabled);

  useEffect(() => {
    if (isOpen) {
      setPasskeys(getStoredPasskeys());
      setTwoFaConfig(getStored2FaConfig());
      setSessions(getActiveSessions());
      setRelayEnabled(relayPrivacyEnabled);
    }
  }, [isOpen, relayPrivacyEnabled]);

  if (!isOpen) return null;

  // Passkey actions
  const handleAddPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsRegisteringPasskey(true);
    try {
      await registerPasskey(newPasskeyName || 'Biometric Device', user);
      setPasskeys(getStoredPasskeys());
      setNewPasskeyName('');
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = (id: string) => {
    deletePasskey(id, user?.id);
    setPasskeys(getStoredPasskeys());
  };

  // 2FA actions
  const handleStart2FaSetup = () => {
    const sec = generateBase32Secret(16);
    const codes = generateBackupCodes(10);
    setSetupSecret(sec);
    setSetupBackupCodes(codes);
    setVerifyCode('');
    setVerifyError(null);
    setTwoFaSetupStep('setup');
  };

  const handleConfirm2Fa = (e: React.FormEvent) => {
    e.preventDefault();
    const res = verify2FaCode(verifyCode, setupSecret, setupBackupCodes);
    if (res.valid) {
      const cfg = enableTwoFactor(setupSecret, setupBackupCodes, user?.id);
      setTwoFaConfig(cfg);
      setTwoFaSetupStep('idle');
      setVerifyCode('');
      setVerifyError(null);
    } else {
      setVerifyError(
        'Invalid 6-digit verification code. Please check your authenticator app.',
      );
    }
  };

  const handleDisable2Fa = () => {
    disableTwoFactor(user?.id);
    setTwoFaConfig(getStored2FaConfig());
    setTwoFaSetupStep('idle');
  };

  // Session actions
  const handleRevokeSession = (sessionId: string) => {
    const updated = revokeSession(sessionId, user?.id);
    setSessions(updated);
  };

  const handleRevokeAllOther = () => {
    const updated = revokeAllOtherSessions(user?.id);
    setSessions(updated);
  };

  // Privacy toggle
  const handleToggleRelay = (val: boolean) => {
    setRelayEnabled(val);
    if (onToggleRelayPrivacy) onToggleRelayPrivacy(val);
    localStorage.setItem('meetit_relay_privacy_enabled', String(val));
    void logAuditEvent({
      userId: user?.id,
      action: 'privacy.relay_mode_toggle',
      targetType: 'privacy',
      metadata: { relayEnabled: val },
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card security-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640,
          width: '94%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <Shield size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Security & Sign-in
              </h3>
              <p
                style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}
              >
                Passkeys, Two-Factor Authentication, Active Sessions, and
                Network Privacy
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ctrl-btn sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--line)',
            paddingBottom: 10,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            className={`btn sm ${activeTab === 'passkeys' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('passkeys')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <Fingerprint size={14} />
            Passkeys ({passkeys.length})
          </button>
          <button
            type="button"
            className={`btn sm ${activeTab === '2fa' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('2fa')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <KeyRound size={14} />
            2FA {twoFaConfig.enabled ? '(On)' : '(Off)'}
          </button>
          <button
            type="button"
            className={`btn sm ${activeTab === 'sessions' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('sessions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <Laptop size={14} />
            Active Sessions ({sessions.length})
          </button>
          <button
            type="button"
            className={`btn sm ${activeTab === 'privacy' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('privacy')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.82rem',
            }}
          >
            <Globe size={14} />
            Relay Privacy
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {/* TAB 1: PASSKEYS */}
          {activeTab === 'passkeys' && (
            <div>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--ink)',
                  lineHeight: 1.45,
                  marginBottom: 16,
                }}
              >
                Passkeys let you sign in securely using your biometric sensors
                (Touch ID, Face ID, Windows Hello) or security keys (YubiKey)
                without typing a password.
              </p>

              <form
                onSubmit={handleAddPasskey}
                style={{ display: 'flex', gap: 8, marginBottom: 16 }}
              >
                <input
                  type="text"
                  placeholder="Passkey label (e.g. MacBook Pro Touch ID)"
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    fontSize: '0.82rem',
                  }}
                />
                <button
                  type="submit"
                  className="btn primary sm"
                  disabled={isRegisteringPasskey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.82rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Fingerprint size={14} />
                  {isRegisteringPasskey ? 'Registering...' : 'Add Passkey'}
                </button>
              </form>

              {passkeys.length === 0 ? (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                    fontSize: '0.85rem',
                    border: '1px dashed var(--line)',
                    borderRadius: 8,
                  }}
                >
                  No passkeys registered yet. Add a biometric key above for
                  one-touch sign-in.
                </div>
              ) : (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {passkeys.map((pk) => (
                    <div
                      key={pk.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--soft)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent)',
                          }}
                        >
                          <Fingerprint size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {pk.name}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--muted)',
                              fontFamily: 'monospace',
                            }}
                          >
                            Created{' '}
                            {new Date(pk.createdAt).toLocaleDateString()} •{' '}
                            {pk.credentialId.slice(0, 16)}...
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="ctrl-btn sm"
                        onClick={() => handleDeletePasskey(pk.id)}
                        title="Delete passkey"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 2FA */}
          {activeTab === '2fa' && (
            <div>
              {twoFaConfig.enabled ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    background: 'rgba(34, 197, 94, 0.08)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <Check size={20} style={{ color: '#22c55e' }} />
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        Two-Factor Authentication is Active
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: '#22c55e',
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    >
                      Protected
                    </span>
                  </div>

                  <p
                    style={{
                      margin: '0 0 16px',
                      fontSize: '0.82rem',
                      color: 'var(--ink)',
                    }}
                  >
                    Your account is secured with standard RFC 6238 TOTP. Every
                    sign-in requires your password or magic link plus a code
                    from your authenticator app.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{ fontSize: '0.78rem', color: 'var(--muted)' }}
                    >
                      {twoFaConfig.backupCodesCount} recovery backup codes
                      remaining
                    </span>
                    <button
                      type="button"
                      className="btn danger sm"
                      onClick={handleDisable2Fa}
                      style={{ fontSize: '0.8rem' }}
                    >
                      Disable 2FA
                    </button>
                  </div>
                </div>
              ) : twoFaSetupStep === 'setup' ? (
                <form onSubmit={handleConfirm2Fa}>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: 'block',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        marginBottom: 6,
                      }}
                    >
                      Step 1: Enter this key into Google Authenticator or
                      1Password:
                    </label>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <code
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: 'var(--soft)',
                          borderRadius: 6,
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          letterSpacing: '0.1em',
                          color: 'var(--accent)',
                        }}
                      >
                        {setupSecret}
                      </code>
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() => {
                          navigator.clipboard.writeText(setupSecret);
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }}
                      >
                        {copiedSecret ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                        {copiedSecret ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: 'block',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        marginBottom: 6,
                      }}
                    >
                      Step 2: Save emergency backup recovery codes:
                    </label>
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 6,
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        marginBottom: 8,
                      }}
                    >
                      {setupBackupCodes.map((c, i) => (
                        <div key={i}>{c}</div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          setupBackupCodes.join('\n'),
                        );
                        setCopiedCodes(true);
                        setTimeout(() => setCopiedCodes(false), 2000);
                      }}
                      style={{ fontSize: '0.78rem' }}
                    >
                      {copiedCodes ? <Check size={13} /> : <Copy size={13} />}
                      {copiedCodes
                        ? 'Codes Copied to Clipboard'
                        : 'Copy 10 Backup Codes'}
                    </button>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: 'block',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        marginBottom: 6,
                      }}
                    >
                      Step 3: Enter the 6-digit code shown in your app:
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      style={{
                        width: 140,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        background: 'var(--bg)',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        letterSpacing: '0.2em',
                        textAlign: 'center',
                      }}
                    />
                    {verifyError && (
                      <p
                        style={{
                          color: 'var(--danger)',
                          fontSize: '0.78rem',
                          margin: '6px 0 0',
                        }}
                      >
                        {verifyError}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => setTwoFaSetupStep('idle')}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn primary sm"
                      disabled={verifyCode.length !== 6}
                    >
                      Verify and Activate 2FA
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--ink)',
                      lineHeight: 1.45,
                      marginBottom: 16,
                    }}
                  >
                    Add an extra layer of defense to your MeetIT account. When
                    2FA is active, an authenticator app (Google Authenticator,
                    Microsoft Authenticator, 1Password) code is required at
                    sign-in.
                  </p>
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={handleStart2FaSetup}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.82rem',
                    }}
                  >
                    <KeyRound size={14} />
                    Enable Two-Factor Authentication
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ACTIVE SESSIONS */}
          {activeTab === 'sessions' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.83rem',
                    color: 'var(--ink)',
                  }}
                >
                  Active browsers and devices signed in to your account.
                </p>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={handleRevokeAllOther}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.78rem',
                    }}
                  >
                    <LogOut size={13} />
                    Log Out Other Devices
                  </button>
                )}
              </div>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {sessions.map((sess) => (
                  <div
                    key={sess.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: sess.current
                        ? '1px solid var(--accent)'
                        : '1px solid var(--line)',
                      background: sess.current
                        ? 'var(--soft)'
                        : 'var(--surface)',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      {sess.os.toLowerCase().includes('ios') ||
                      sess.os.toLowerCase().includes('android') ? (
                        <Smartphone
                          size={20}
                          style={{ color: 'var(--muted)' }}
                        />
                      ) : (
                        <Laptop size={20} style={{ color: 'var(--accent)' }} />
                      )}
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span
                            style={{ fontWeight: 600, fontSize: '0.85rem' }}
                          >
                            {sess.browser} on {sess.os}
                          </span>
                          {sess.current && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'var(--accent)',
                                color: '#fff',
                                fontWeight: 600,
                              }}
                            >
                              This device
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--muted)',
                            marginTop: 2,
                          }}
                        >
                          {sess.location} ({sess.ipAddress}) • Last active{' '}
                          {new Date(sess.lastActiveAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>

                    {!sess.current && (
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() => handleRevokeSession(sess.id)}
                        style={{ fontSize: '0.75rem' }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: RELAY PRIVACY */}
          {activeTab === 'privacy' && (
            <div>
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.92rem',
                        color: 'var(--ink)',
                      }}
                    >
                      Relay-Only Privacy Mode (Hide Public IP)
                    </div>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: '0.8rem',
                        color: 'var(--muted)',
                        lineHeight: 1.45,
                      }}
                    >
                      Enforces WebRTC TURN relay routing (
                      <code>iceTransportPolicy: relay</code>). When active, your
                      local device and public IP address are never exposed to
                      peer participants during direct connections.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={relayEnabled}
                    onChange={(e) => handleToggleRelay(e.target.checked)}
                    style={{
                      width: 18,
                      height: 18,
                      cursor: 'pointer',
                      marginTop: 4,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--muted)',
                  lineHeight: 1.45,
                }}
              >
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Note on performance:</strong>
                </p>
                Relaying media adds approximately 5-15ms of latency depending on
                your geographic proximity to our nearest edge server. In
                standard mode, MeetIT attempts direct peer-to-peer UDP first for
                lowest latency.
              </div>
            </div>
          )}
        </div>

        <div
          style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}
        >
          <button type="button" className="btn secondary sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
