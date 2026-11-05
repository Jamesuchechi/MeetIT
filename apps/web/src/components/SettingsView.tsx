import React, { useState, useEffect } from 'react';
import {
  enumerateMediaDevices,
  loadDevicePreferences,
  saveDevicePreferences,
  type EnumeratedDevices,
} from '../lib/devices';
import { Avatar } from './Avatar';
import { SunIcon, MoonIcon } from './Icons';
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

        {/* 3. Account & Public Profile Card (Full Width) */}
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
      </div>
    </section>
  );
}
