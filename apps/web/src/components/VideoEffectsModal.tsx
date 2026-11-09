import React, { useRef, useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Upload,
  Sun,
  Smile,
  Maximize2,
  Hand,
  Check,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import {
  DEFAULT_VIRTUAL_BACKGROUNDS,
  type VideoEffectsConfig,
  type VideoEffectType,
  VideoEffectProcessor,
} from '@meetit/media';

interface VideoEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: VideoEffectsConfig;
  onApplyConfig: (config: VideoEffectsConfig) => void;
  activeMediaStream?: MediaStream | null;
}

const STORAGE_KEY = 'meetit_video_effects_v1';

export function loadSavedVideoEffects(): VideoEffectsConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        effect: 'none',
        lowLightEnhancement: false,
        touchUp: false,
        autoFraming: false,
        gestureReactions: false,
        eyeContactCorrection: false,
      };
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        effect: 'none',
        lowLightEnhancement: false,
        touchUp: false,
        autoFraming: false,
        gestureReactions: false,
        eyeContactCorrection: false,
      };
    }
    return JSON.parse(raw) as VideoEffectsConfig;
  } catch {
    return {
      effect: 'none',
      lowLightEnhancement: false,
      touchUp: false,
      autoFraming: false,
      gestureReactions: false,
      eyeContactCorrection: false,
    };
  }
}

export function saveVideoEffects(config: VideoEffectsConfig): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

export function VideoEffectsModal({
  isOpen,
  onClose,
  currentConfig,
  onApplyConfig,
  activeMediaStream,
}: VideoEffectsModalProps) {
  const [config, setConfig] = useState<VideoEffectsConfig>(currentConfig);
  const [customBackgrounds, setCustomBackgrounds] = useState<
    Array<{ id: string; name: string; dataUrl: string }>
  >([]);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const processorRef = useRef<VideoEffectProcessor | null>(null);
  const [previewTrack, setPreviewTrack] = useState<MediaStreamTrack | null>(
    null,
  );

  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      setConfig(currentConfig);
    }
  }, [isOpen, currentConfig]);

  // Handle preview stream processing
  useEffect(() => {
    if (!isOpen) {
      if (processorRef.current) {
        processorRef.current.stop();
        processorRef.current = null;
      }
      setPreviewTrack(null);
      return;
    }

    const inputTrack = activeMediaStream?.getVideoTracks()[0];
    if (!inputTrack) {
      return;
    }

    const processor = new VideoEffectProcessor(config);
    processorRef.current = processor;

    let cancelled = false;
    void processor.processTrack(inputTrack).then((track) => {
      if (!cancelled) {
        setPreviewTrack(track);
      }
    });

    return () => {
      cancelled = true;
      processor.stop();
      processorRef.current = null;
    };
  }, [isOpen, activeMediaStream]);

  // Update live preview when config changes
  useEffect(() => {
    if (processorRef.current) {
      processorRef.current.updateConfig(config);
    }
  }, [config]);

  // Attach preview stream to video tag
  useEffect(() => {
    if (previewVideoRef.current && previewTrack) {
      previewVideoRef.current.srcObject = new MediaStream([previewTrack]);
    } else if (previewVideoRef.current && activeMediaStream) {
      previewVideoRef.current.srcObject = activeMediaStream;
    }
  }, [previewTrack, activeMediaStream]);

  if (!isOpen) {
    return null;
  }

  const handleSelectEffect = (
    effect: VideoEffectType,
    virtualBackgroundUrl?: string,
  ) => {
    const updated: VideoEffectsConfig = {
      ...config,
      effect,
      virtualBackgroundUrl: virtualBackgroundUrl ?? config.virtualBackgroundUrl,
    };
    setConfig(updated);
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const newBg = {
        id: `custom_${Date.now()}`,
        name: file.name.slice(0, 15),
        dataUrl: result,
      };
      setCustomBackgrounds((prev) => [newBg, ...prev]);
      handleSelectEffect('virtual-image', result);
    };
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    saveVideoEffects(config);
    onApplyConfig(config);
    onClose();
  };

  return (
    <div
      className="timer-config-backdrop"
      onClick={onClose}
      data-testid="video-effects-backdrop"
    >
      <div
        className="app-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Visual Effects and Virtual Backgrounds"
        style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh' }}
      >
        <div className="app-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="app-modal-title">
              Visual Effects &amp; Backgrounds
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
          {/* Live Preview Monitor */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#090d16',
              border: '1px solid var(--line)',
            }}
          >
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)', // Mirror self view
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '12px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.65)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10b981',
                }}
              />
              Live Preview
            </div>
          </div>

          {/* Section: Background Filters */}
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
              Background Effects
            </span>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))',
                gap: '10px',
              }}
            >
              {/* None */}
              <button
                type="button"
                className={`panel-card ${config.effect === 'none' ? 'active-effect' : ''}`}
                onClick={() => handleSelectEffect('none')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 8px',
                  cursor: 'pointer',
                  borderRadius: '10px',
                  border:
                    config.effect === 'none'
                      ? '2px solid var(--accent)'
                      : '1px solid var(--line)',
                  background: 'var(--surface)',
                  gap: '6px',
                }}
                data-testid="effect-none-btn"
              >
                <ImageIcon size={20} style={{ color: 'var(--muted)' }} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>None</span>
              </button>

              {/* Slight Blur */}
              <button
                type="button"
                className={`panel-card ${config.effect === 'blur-slight' ? 'active-effect' : ''}`}
                onClick={() => handleSelectEffect('blur-slight')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 8px',
                  cursor: 'pointer',
                  borderRadius: '10px',
                  border:
                    config.effect === 'blur-slight'
                      ? '2px solid var(--accent)'
                      : '1px solid var(--line)',
                  background: 'var(--surface)',
                  gap: '6px',
                }}
                data-testid="effect-blur-slight-btn"
              >
                <Sparkles size={20} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>
                  Soft Blur
                </span>
              </button>

              {/* Heavy Blur */}
              <button
                type="button"
                className={`panel-card ${config.effect === 'blur-heavy' ? 'active-effect' : ''}`}
                onClick={() => handleSelectEffect('blur-heavy')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 8px',
                  cursor: 'pointer',
                  borderRadius: '10px',
                  border:
                    config.effect === 'blur-heavy'
                      ? '2px solid var(--accent)'
                      : '1px solid var(--line)',
                  background: 'var(--surface)',
                  gap: '6px',
                }}
                data-testid="effect-blur-heavy-btn"
              >
                <Sparkles size={20} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>
                  Deep Blur
                </span>
              </button>

              {/* Preset Wallpapers */}
              {DEFAULT_VIRTUAL_BACKGROUNDS.map((bg) => {
                const isSelected =
                  config.effect === 'virtual-image' &&
                  config.virtualBackgroundUrl === bg.dataUrl;

                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() =>
                      handleSelectEffect('virtual-image', bg.dataUrl)
                    }
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      padding: '8px 4px',
                      height: '75px',
                      cursor: 'pointer',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: isSelected
                        ? '2px solid var(--accent)'
                        : '1px solid var(--line)',
                      backgroundImage: `url("${bg.thumbnail}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    data-testid={`effect-bg-${bg.id}`}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)',
                      }}
                    />
                    {isSelected && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Check size={12} />
                      </span>
                    )}
                    <span
                      style={{
                        position: 'relative',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#fff',
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      }}
                    >
                      {bg.name}
                    </span>
                  </button>
                );
              })}

              {/* Custom Uploads */}
              {customBackgrounds.map((bg) => {
                const isSelected =
                  config.effect === 'virtual-image' &&
                  config.virtualBackgroundUrl === bg.dataUrl;

                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() =>
                      handleSelectEffect('virtual-image', bg.dataUrl)
                    }
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      padding: '8px 4px',
                      height: '75px',
                      cursor: 'pointer',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: isSelected
                        ? '2px solid var(--accent)'
                        : '1px solid var(--line)',
                      backgroundImage: `url("${bg.dataUrl}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)',
                      }}
                    />
                    <span
                      style={{
                        position: 'relative',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#fff',
                      }}
                    >
                      {bg.name}
                    </span>
                  </button>
                );
              })}

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 8px',
                  cursor: 'pointer',
                  borderRadius: '10px',
                  border: '1px dashed var(--line)',
                  background: 'var(--soft)',
                  gap: '6px',
                  color: 'var(--ink)',
                }}
                data-testid="upload-bg-btn"
              >
                <Upload size={18} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>
                  Upload
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCustomUpload}
                  style={{ display: 'none' }}
                />
              </button>
            </div>
          </div>

          {/* Section: Image Enhancements & Intelligence */}
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
              Lighting &amp; AI Framing
            </span>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {/* Low Light Booster */}
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
                  <Sun size={18} style={{ color: '#eab308' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Low-Light Enhancement
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Automatically illuminates dark or backlit rooms
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.lowLightEnhancement ?? false}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      lowLightEnhancement: e.target.checked,
                    }))
                  }
                  data-testid="toggle-low-light"
                />
              </label>

              {/* Soft Touch-Up */}
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
                  <Smile size={18} style={{ color: '#ec4899' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Soft Touch-Up Filter
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Gently smooths skin tone and softens camera noise
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.touchUp ?? false}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, touchUp: e.target.checked }))
                  }
                  data-testid="toggle-touch-up"
                />
              </label>

              {/* Auto-Framing */}
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
                  <Maximize2 size={18} style={{ color: '#3b82f6' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Auto-Framing (Face Centering)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Dynamically centers you in the frame as you move
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoFraming ?? false}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, autoFraming: e.target.checked }))
                  }
                  data-testid="toggle-auto-framing"
                />
              </label>

              {/* Eye-Contact Correction */}
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
                  <Eye size={18} style={{ color: '#8b5cf6' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Eye-Contact Correction
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Digital gaze adjustment to maintain direct eye contact
                      with the camera
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.eyeContactCorrection ?? false}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      eyeContactCorrection: e.target.checked,
                    }))
                  }
                  data-testid="toggle-eye-contact"
                />
              </label>

              {/* Gesture Reactions */}
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
                  <Hand size={18} style={{ color: '#10b981' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      Gesture Reactions
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Thumbs up to send reactions, or raise your hand to queue
                      to speak
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.gestureReactions ?? false}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      gestureReactions: e.target.checked,
                    }))
                  }
                  data-testid="toggle-gestures"
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
            data-testid="apply-effects-btn"
          >
            Apply Effects
          </button>
        </div>
      </div>
    </div>
  );
}
