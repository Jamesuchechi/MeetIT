import React, { useState, useEffect } from 'react';
import {
  Volume2,
  X,
  Mic,
  ShieldAlert,
  Headphones,
  Sparkles,
  Radio,
  Sliders,
} from 'lucide-react';
import {
  type AudioEffectsConfig,
  type NoiseSuppressionMode,
} from '@meetit/media';

interface AudioEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: AudioEffectsConfig;
  onApplyConfig: (config: AudioEffectsConfig) => void;
  liveAudioLevel?: number;
}

const STORAGE_KEY = 'meetit_audio_effects_v1';

export function loadSavedAudioEffects(): AudioEffectsConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        noiseSuppression: 'high',
        voiceBoost: true,
        feedbackGuard: true,
        spatialAudio: false,
        voiceFirstMode: false,
      };
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        noiseSuppression: 'high',
        voiceBoost: true,
        feedbackGuard: true,
        spatialAudio: false,
        voiceFirstMode: false,
      };
    }
    return JSON.parse(raw) as AudioEffectsConfig;
  } catch {
    return {
      noiseSuppression: 'high',
      voiceBoost: true,
      feedbackGuard: true,
      spatialAudio: false,
      voiceFirstMode: false,
    };
  }
}

export function saveAudioEffects(config: AudioEffectsConfig): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

export function AudioEffectsModal({
  isOpen,
  onClose,
  currentConfig,
  onApplyConfig,
  liveAudioLevel = 0,
}: AudioEffectsModalProps) {
  const [config, setConfig] = useState<AudioEffectsConfig>(currentConfig);

  useEffect(() => {
    if (isOpen) {
      setConfig(currentConfig);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) {
    return null;
  }

  const handleApply = () => {
    saveAudioEffects(config);
    onApplyConfig(config);
    onClose();
  };

  const noiseModes: Array<{
    mode: NoiseSuppressionMode;
    label: string;
    desc: string;
  }> = [
    {
      mode: 'off',
      label: 'Off',
      desc: 'Raw unprocessed audio capture',
    },
    {
      mode: 'low',
      label: 'Low',
      desc: 'Mild noise gate for quiet home offices',
    },
    {
      mode: 'high',
      label: 'High (Default)',
      desc: 'Suppresses fans, air conditioners & hum',
    },
    {
      mode: 'ai',
      label: 'AI Studio',
      desc: 'Maximum isolation: cuts typing & chatter',
    },
  ];

  return (
    <div
      className="timer-config-backdrop"
      onClick={onClose}
      data-testid="audio-effects-backdrop"
    >
      <div
        className="app-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Audio Intelligence and Noise Suppression"
        style={{ maxWidth: '580px', width: '100%', maxHeight: '90vh' }}
      >
        <div className="app-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Volume2 size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="app-modal-title">
              Audio Intelligence &amp; Effects
            </h2>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div
          className="app-modal-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: 'calc(90vh - 140px)',
            overflowY: 'auto',
          }}
        >
          {/* Live Mic Test Meter */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mic size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
                Microphone Input Meter
              </span>
            </div>
            <div
              style={{
                flex: 1,
                maxWidth: '200px',
                height: '8px',
                borderRadius: '999px',
                background: 'var(--line)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(4, liveAudioLevel))}%`,
                  background:
                    liveAudioLevel > 80
                      ? 'var(--danger)'
                      : liveAudioLevel > 50
                        ? '#eab308'
                        : '#10b981',
                  transition: 'width 0.08s ease',
                }}
              />
            </div>
          </div>

          {/* Section 1: Noise Suppression Profile */}
          <div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted)',
                display: 'block',
                marginBottom: '10px',
              }}
            >
              AI Noise Suppression
            </span>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
              }}
            >
              {noiseModes.map(({ mode, label, desc }) => {
                const isSelected = config.noiseSuppression === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      setConfig((c) => ({ ...c, noiseSuppression: mode }))
                    }
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: isSelected
                        ? '2px solid var(--accent)'
                        : '1px solid var(--line)',
                      background: isSelected ? 'var(--soft)' : 'var(--surface)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      gap: '4px',
                    }}
                    data-testid={`noise-mode-${mode}`}
                  >
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Voice Clarity & Protection */}
          <div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--muted)',
                display: 'block',
                marginBottom: '10px',
              }}
            >
              Voice Enhancements &amp; Protection
            </span>

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {/* Voice Presence Booster */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <Sparkles size={18} style={{ color: 'var(--accent)' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Vocal Presence Booster
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      EQ boost for crisp, broadcast-quality speech clarity
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.voiceBoost ?? true}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, voiceBoost: e.target.checked }))
                  }
                  data-testid="toggle-voice-boost"
                />
              </label>

              {/* Feedback Guard */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <ShieldAlert size={18} style={{ color: '#f59e0b' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Acoustic Feedback &amp; Echo Guard
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Alerts and mutes runaway microphone screech loops
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.feedbackGuard ?? true}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      feedbackGuard: e.target.checked,
                    }))
                  }
                  data-testid="toggle-feedback-guard"
                />
              </label>

              {/* Spatial Audio */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <Headphones size={18} style={{ color: '#3b82f6' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Spatial Stereo Sound (Headphones)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Positions attendees in stereo field matching their video
                      tile
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.spatialAudio ?? false}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      spatialAudio: e.target.checked,
                    }))
                  }
                  data-testid="toggle-spatial-audio"
                />
              </label>

              {/* Adaptive Voice-First Mode */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <Radio size={18} style={{ color: '#10b981' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Adaptive Voice-First Mode
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Prioritizes speech audio and disables video when signal
                      drops
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.voiceFirstMode ?? false}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      voiceFirstMode: e.target.checked,
                    }))
                  }
                  data-testid="toggle-voice-first"
                />
              </label>
            </div>
          </div>
        </div>

        <div
          className="app-modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            borderTop: '1px solid var(--line)',
            paddingTop: '14px',
          }}
        >
          <button
            type="button"
            className="panel-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="panel-btn-primary"
            onClick={handleApply}
            data-testid="apply-audio-effects-btn"
          >
            Apply Audio Settings
          </button>
        </div>
      </div>
    </div>
  );
}
