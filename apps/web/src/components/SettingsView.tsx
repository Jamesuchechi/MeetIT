import React, { useState, useEffect } from 'react';
import {
  enumerateMediaDevices,
  loadDevicePreferences,
  saveDevicePreferences,
  type EnumeratedDevices,
} from '../lib/devices';
import {
  getEffectiveApiKeys,
  savePreferredProvider,
  testAIConnectivity,
  type AIProvider,
} from '../lib/aiService';
import {
  loadIntegrationsConfig,
  saveIntegrationsConfig,
  type IntegrationConfig,
} from '../lib/integrationsService';
import { Avatar } from './Avatar';
import { SunIcon, MoonIcon } from './Icons';
import {
  Shield,
  Fingerprint,
  FileCheck,
  FileText,
  Trash2,
  Globe,
  Check,
  Zap,
  KeyRound,
  Award,
} from 'lucide-react';
import { SecuritySettingsModal } from './SecuritySettingsModal';
import { ComplianceCenterModal } from './ComplianceCenterModal';
import { AuditLogModal } from './AuditLogModal';
import { AccountDeletionModal } from './AccountDeletionModal';
import { EnterpriseSsoModal } from './EnterpriseSsoModal';
import { EnterpriseControlsModal } from './EnterpriseControlsModal';
import { BugBountyModal } from './BugBountyModal';
import type { AuthUser } from '../types';

const APP_SETTINGS_KEY = 'meetit_app_settings_v1';

export interface InAppSettings {
  joinMutedByDefault: boolean;
  joinCameraOffByDefault: boolean;
  mirrorSelfView: boolean;
  audioFirstMode: boolean;
  dataSaver360p: boolean;
  joinLeaveChimes: boolean;
}

const DEFAULT_SETTINGS: InAppSettings = {
  joinMutedByDefault: false,
  joinCameraOffByDefault: false,
  mirrorSelfView: true,
  audioFirstMode: true,
  dataSaver360p: false,
  joinLeaveChimes: true,
};

function loadAppSettings(): InAppSettings {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(raw) as Partial<InAppSettings>),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveAppSettings(next: InAppSettings): void {
  try {
    window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

interface SettingsViewProps {
  user: AuthUser | null;
  currentTheme: 'light' | 'dark';
  onToggleTheme?: () => void;
  onOpenProfile: () => void;
  onOpenProfileEdit: () => void;
  onSignOut?: () => void;
  onToast: (msg: string) => void;
}

export function SettingsView({
  user,
  currentTheme,
  onToggleTheme,
  onOpenProfile,
  onOpenProfileEdit,
  onSignOut,
  onToast,
}: SettingsViewProps) {
  const [devices, setDevices] = useState<EnumeratedDevices>({
    microphones: [],
    cameras: [],
    speakers: [],
  });
  const [devicePrefs, setDevicePrefs] = useState(() => loadDevicePreferences());
  const [appSettings, setAppSettings] = useState<InAppSettings>(() =>
    loadAppSettings(),
  );
  const [aiKeys, setAiKeys] = useState(() => getEffectiveApiKeys());
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [integrationsConfig, setIntegrationsConfig] =
    useState<IntegrationConfig>(() => loadIntegrationsConfig());

  // Phase 10: Security, Privacy & Compliance state
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showAccountDeletionModal, setShowAccountDeletionModal] =
    useState(false);
  const [showEnterpriseSsoModal, setShowEnterpriseSsoModal] = useState(false);
  const [showEnterpriseControlsModal, setShowEnterpriseControlsModal] =
    useState(false);
  const [showBugBountyModal, setShowBugBountyModal] = useState(false);
  const [relayPrivacy, setRelayPrivacy] = useState<boolean>(() => {
    try {
      return localStorage.getItem('meetit_relay_privacy_enabled') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mounted = true;
    void enumerateMediaDevices().then((res) => {
      if (mounted) setDevices(res);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDeviceChange = (
    key: 'audioInputId' | 'videoInputId' | 'audioOutputId',
    value: string,
  ) => {
    const updated = { ...devicePrefs, [key]: value };
    setDevicePrefs(updated);
    saveDevicePreferences({ [key]: value });
    onToast('Default media device saved.');
  };

  const toggleSetting = (key: keyof InAppSettings, label: string) => {
    const nextValue = !appSettings[key];
    const updated: InAppSettings = { ...appSettings, [key]: nextValue };
    setAppSettings(updated);
    saveAppSettings(updated);
    onToast(`${label} ${nextValue ? 'enabled' : 'disabled'}.`);
  };

  const handleSaveAIProvider = (provider: AIProvider) => {
    savePreferredProvider(provider);
    setAiKeys(getEffectiveApiKeys());
    onToast(`Preferred AI provider set to ${provider}.`);
  };

  const handleTestAI = async () => {
    setIsTestingAI(true);
    setTestResult(null);
    try {
      const res = await testAIConnectivity(aiKeys.preferredProvider);
      setTestResult(res.message);
      if (res.success) {
        onToast(`AI Connection verified (${res.latencyMs}ms)!`);
      } else {
        onToast(`AI Check: ${res.message}`);
      }
    } catch (err) {
      setTestResult(`Failed: ${(err as Error).message}`);
      onToast(`AI Connection failed: ${(err as Error).message}`);
    } finally {
      setIsTestingAI(false);
    }
  };

  const handleSaveWebhook = (url: string) => {
    const updated = {
      ...integrationsConfig,
      ...(url.trim() ? { webhookUrl: url.trim() } : {}),
    };
    if (!url.trim()) delete updated.webhookUrl;
    setIntegrationsConfig(updated);
    saveIntegrationsConfig(updated);
    onToast('Integration webhook URL saved.');
  };

  return (
    <section
      className="settings-page"
      aria-labelledby="settings-page-heading"
      data-testid="settings-view"
    >
      <div className="page-subhead">
        <div>
          <span className="eyebrow-badge">Preferences &amp; Studio</span>
          <h2 id="settings-page-heading">In-App Settings</h2>
          <p>
            Configure your default camera, microphone, audio-first network
            resilience, and workspace preferences.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        {/* 1. Audio & Video Hardware Defaults */}
        <div className="profile-section-card">
          <h3>Audio &amp; video defaults</h3>
          <p className="profile-card-sub">
            Pre-selected hardware and entry behavior when joining any MeetIT
            room.
          </p>

          <div className="settings-fields">
            <div className="field">
              <label htmlFor="settings-mic">Default Microphone</label>
              <select
                id="settings-mic"
                value={devicePrefs.audioInputId}
                onChange={(e) =>
                  handleDeviceChange('audioInputId', e.target.value)
                }
              >
                <option value="">System default microphone</option>
                {devices.microphones.map((mic, i) => (
                  <option key={mic.deviceId || i} value={mic.deviceId}>
                    {mic.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="settings-cam">Default Camera</label>
              <select
                id="settings-cam"
                value={devicePrefs.videoInputId}
                onChange={(e) =>
                  handleDeviceChange('videoInputId', e.target.value)
                }
              >
                <option value="">System default camera</option>
                {devices.cameras.map((cam, i) => (
                  <option key={cam.deviceId || i} value={cam.deviceId}>
                    {cam.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="settings-spk">Default Speaker Output</label>
              <select
                id="settings-spk"
                value={devicePrefs.audioOutputId}
                onChange={(e) =>
                  handleDeviceChange('audioOutputId', e.target.value)
                }
              >
                <option value="">System default speaker</option>
                {devices.speakers.map((spk, i) => (
                  <option key={spk.deviceId || i} value={spk.deviceId}>
                    {spk.label || `Speaker ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-toggles">
            <div className="sw">
              <div>
                Mirror my self-view video
                <small>
                  Flip local camera horizontally in preview and call
                </small>
              </div>
              <button
                type="button"
                aria-pressed={appSettings.mirrorSelfView}
                aria-label="Toggle mirror self-view"
                onClick={() =>
                  toggleSetting('mirrorSelfView', 'Mirror self-view')
                }
              />
            </div>

            <div className="sw">
              <div>
                Join meetings muted by default
                <small>Start with microphone muted when entering a room</small>
              </div>
              <button
                type="button"
                aria-pressed={appSettings.joinMutedByDefault}
                aria-label="Toggle join muted by default"
                onClick={() =>
                  toggleSetting('joinMutedByDefault', 'Join muted by default')
                }
              />
            </div>

            <div className="sw">
              <div>
                Join with camera off by default
                <small>Start in audio-only mode until you enable camera</small>
              </div>
              <button
                type="button"
                aria-pressed={appSettings.joinCameraOffByDefault}
                aria-label="Toggle join with camera off by default"
                onClick={() =>
                  toggleSetting(
                    'joinCameraOffByDefault',
                    'Join with camera off',
                  )
                }
              />
            </div>
          </div>
        </div>

        {/* 2. Network & Audio-First Resilience */}
        <div className="profile-section-card">
          <h3>Network &amp; audio-first resilience</h3>
          <p className="profile-card-sub">
            MeetIT prioritizes crystal-clear voice over video when bandwidth
            drops.
          </p>

          <div className="settings-toggles">
            <div className="sw">
              <div>
                Audio-first automatic fallback
                <small>
                  Automatically step down or pause video if packet loss exceeds
                  5%
                </small>
              </div>
              <button
                type="button"
                aria-pressed={appSettings.audioFirstMode}
                aria-label="Toggle audio-first automatic fallback"
                onClick={() =>
                  toggleSetting('audioFirstMode', 'Audio-first mode')
                }
              />
            </div>

            <div className="sw">
              <div>
                Data saver mode (360p cap)
                <small>
                  Limit outgoing and incoming video resolution on metered links
                </small>
              </div>
              <button
                type="button"
                aria-pressed={appSettings.dataSaver360p}
                aria-label="Toggle data saver 360p cap"
                onClick={() => toggleSetting('dataSaver360p', 'Data saver')}
              />
            </div>

            <div className="sw">
              <div>
                Room join &amp; leave sound chimes
                <small>
                  Play subtle synthesized audio cues when guests join or leave
                </small>
              </div>
              <button
                type="button"
                aria-pressed={appSettings.joinLeaveChimes}
                aria-label="Toggle room join and leave chimes"
                onClick={() =>
                  toggleSetting('joinLeaveChimes', 'Join/leave chimes')
                }
              />
            </div>
          </div>

          <hr className="profile-divider" />

          <h3>Appearance &amp; shortcuts</h3>
          <div className="settings-theme-row">
            <div>
              <strong>Color theme</strong>
              <small style={{ display: 'block', color: 'var(--muted)' }}>
                Currently using {currentTheme === 'dark' ? 'Dark' : 'Light'}{' '}
                mode
              </small>
            </div>
            {onToggleTheme && (
              <button type="button" className="btn" onClick={onToggleTheme}>
                {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
                <span>
                  Switch to {currentTheme === 'dark' ? 'Light' : 'Dark'}
                </span>
              </button>
            )}
          </div>

          <div className="shortcuts-mini-grid" aria-label="Keyboard shortcuts">
            <div className="shortcut-pill">
              <kbd>M</kbd> <span>Mute / Unmute</span>
            </div>
            <div className="shortcut-pill">
              <kbd>V</kbd> <span>Start / Stop Video</span>
            </div>
            <div className="shortcut-pill">
              <kbd>S</kbd> <span>Share Screen</span>
            </div>
            <div className="shortcut-pill">
              <kbd>H</kbd> <span>Raise Hand</span>
            </div>
            <div className="shortcut-pill">
              <kbd>C</kbd> <span>Toggle Chat</span>
            </div>
            <div className="shortcut-pill">
              <kbd>?</kbd> <span>All Shortcuts</span>
            </div>
          </div>
        </div>

        {/* 3. AI Meeting Intelligence & Model Provider */}
        <div className="profile-section-card">
          <h3>AI Meeting Intelligence &amp; LLM Provider</h3>
          <p className="profile-card-sub">
            Configure Groq (Llama 3.3 70B) and Mistral AI for post-meeting
            notes, key decisions, chapters, and Q&amp;A.
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              marginTop: 12,
            }}
          >
            <label className="form-field">
              <span>Preferred LLM Provider</span>
              <select
                value={aiKeys.preferredProvider}
                onChange={(e) =>
                  handleSaveAIProvider(e.target.value as AIProvider)
                }
              >
                <option value="auto">
                  Auto (Best Available: Groq → Mistral → Fallback)
                </option>
                <option value="groq">Groq (Llama 3.3 70B Versatile)</option>
                <option value="mistral">
                  Mistral AI (Mistral Small Latest)
                </option>
              </select>
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  background: 'var(--soft, #f8fafc)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    Groq AI Engine
                  </div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>
                    Llama 3.3 70B Versatile
                  </small>
                </div>
                <span
                  className="badge"
                  style={{
                    fontSize: 11,
                    background: aiKeys.groqKey
                      ? 'rgba(34, 197, 94, 0.15)'
                      : 'var(--soft)',
                    color: aiKeys.groqKey ? '#16a34a' : 'var(--muted)',
                    borderColor: aiKeys.groqKey
                      ? 'rgba(34, 197, 94, 0.3)'
                      : 'var(--line)',
                  }}
                >
                  {aiKeys.groqKey ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Check size={11} /> Active &amp; Connected
                    </span>
                  ) : (
                    'Managed'
                  )}
                </span>
              </div>

              <div
                style={{
                  background: 'var(--soft, #f8fafc)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    Mistral AI Engine
                  </div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>
                    Mistral Small Latest
                  </small>
                </div>
                <span
                  className="badge"
                  style={{
                    fontSize: 11,
                    background: aiKeys.mistralKey
                      ? 'rgba(34, 197, 94, 0.15)'
                      : 'var(--soft)',
                    color: aiKeys.mistralKey ? '#16a34a' : 'var(--muted)',
                    borderColor: aiKeys.mistralKey
                      ? 'rgba(34, 197, 94, 0.3)'
                      : 'var(--line)',
                  }}
                >
                  {aiKeys.mistralKey ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Check size={11} /> Active &amp; Connected
                    </span>
                  ) : (
                    'Managed'
                  )}
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <button
                type="button"
                className="btn primary"
                onClick={() => void handleTestAI()}
                disabled={isTestingAI}
              >
                {isTestingAI ? (
                  'Testing Connection…'
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Zap size={14} /> Test AI Connectivity
                  </span>
                )}
              </button>
              {testResult && (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {testResult}
                </span>
              )}
            </div>

            <hr className="profile-divider" style={{ margin: '12px 0' }} />

            <h3>
              External Integrations &amp; Webhooks (Linear, Notion, Asana, Docs)
            </h3>
            <p className="profile-card-sub">
              Automatically sync meeting action items to your company task
              management system or webhook receiver.
            </p>

            <label className="form-field">
              <span>Integration Webhook Endpoint URL (Optional)</span>
              <input
                type="url"
                placeholder="https://hooks.zapier.com/... or https://company.com/webhook"
                defaultValue={integrationsConfig.webhookUrl || ''}
                onBlur={(e) => handleSaveWebhook(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* 4. Account & Public Profile Card (Full Width) */}
        {user && (
          <div className="profile-section-card settings-account-card">
            <div className="settings-account-info">
              <Avatar
                name={user.displayName}
                src={user.avatarUrl}
                className="av"
              />
              <div>
                <strong>{user.displayName}</strong>
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  {user.email} · Public profile &amp; identity
                </small>
              </div>
            </div>

            <div className="settings-account-actions">
              <button type="button" className="btn" onClick={onOpenProfile}>
                View public profile
              </button>
              <button type="button" className="btn" onClick={onOpenProfileEdit}>
                Edit profile
              </button>
              {onSignOut && (
                <button
                  type="button"
                  className="btn danger-outline"
                  onClick={onSignOut}
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        )}

        {/* 5. Phase 10: Security, Privacy & Compliance Hub */}
        <div
          className="profile-section-card settings-security-card"
          style={{ gridColumn: '1 / -1' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 6,
            }}
          >
            <Shield size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0 }}>
              Security, Privacy &amp; Compliance (v1.6)
            </h3>
          </div>
          <p className="profile-card-sub" style={{ marginBottom: 16 }}>
            Manage biometric passkeys, two-factor authentication, active device
            sessions, SOC 2 Type II trust checklist, and GDPR / NDPR data
            portability rights.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowSecurityModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Fingerprint size={16} />
              Passkeys, 2FA &amp; Sessions
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowComplianceModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FileCheck size={16} />
              Compliance Center &amp; Data Residency
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowAuditModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FileText size={16} />
              Security Audit Trail
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowEnterpriseSsoModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <KeyRound size={16} />
              SSO &amp; SCIM
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowEnterpriseControlsModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Globe size={16} />
              Enterprise Controls &amp; DLP
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowBugBountyModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Award size={16} />
              Bug Bounty Program
            </button>

            <button
              type="button"
              className="btn danger-outline"
              onClick={() => setShowAccountDeletionModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginLeft: 'auto',
              }}
            >
              <Trash2 size={16} />
              Erase Account &amp; Data
            </button>
          </div>
        </div>
      </div>

      {/* Security Modals */}
      <SecuritySettingsModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        user={
          user
            ? { id: user.id, email: user.email, displayName: user.displayName }
            : null
        }
        relayPrivacyEnabled={relayPrivacy}
        onToggleRelayPrivacy={(val) => {
          setRelayPrivacy(val);
          onToast(
            val
              ? 'Relay-only privacy mode enabled'
              : 'Standard direct WebRTC mode active',
          );
        }}
      />

      <ComplianceCenterModal
        isOpen={showComplianceModal}
        onClose={() => setShowComplianceModal(false)}
        userId={user?.id}
        onRequestDeleteAccount={() => {
          setShowComplianceModal(false);
          setShowAccountDeletionModal(true);
        }}
      />

      <AuditLogModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        userId={user?.id}
      />

      <AccountDeletionModal
        isOpen={showAccountDeletionModal}
        onClose={() => setShowAccountDeletionModal(false)}
        userId={user?.id}
        onDeleted={() =>
          onToast('Account and all associated records permanently purged.')
        }
      />

      <EnterpriseSsoModal
        isOpen={showEnterpriseSsoModal}
        onClose={() => setShowEnterpriseSsoModal(false)}
        onToast={onToast}
      />

      <EnterpriseControlsModal
        isOpen={showEnterpriseControlsModal}
        onClose={() => setShowEnterpriseControlsModal(false)}
        onToast={onToast}
      />

      <BugBountyModal
        isOpen={showBugBountyModal}
        onClose={() => setShowBugBountyModal(false)}
        onToast={onToast}
      />
    </section>
  );
}
