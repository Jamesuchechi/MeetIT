import React, { useState } from 'react';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from '../lib/speechRecognition';
import {
  TRANSLATION_LANGUAGES,
  type TranslationLanguage,
} from '../lib/translationService';
import { type CaptionFontSize, type CaptionPosition } from './CaptionsOverlay';
import { CloseIcon } from './Icons';
import { Languages, Volume2 } from 'lucide-react';

export interface CaptionConfig {
  language: SupportedLanguageCode;
  fontSize: CaptionFontSize;
  position: CaptionPosition;
  vocabulary: string[];
  targetLanguage?: string | undefined;
  showDualLanguage?: boolean | undefined;
  dubbingEnabled?: boolean | undefined;
}

interface CaptionSettingsModalProps {
  config: CaptionConfig;
  onSave: (config: CaptionConfig) => void;
  onClose: () => void;
}

export function CaptionSettingsModal({
  config,
  onSave,
  onClose,
}: CaptionSettingsModalProps) {
  const [language, setLanguage] = useState<SupportedLanguageCode>(
    config.language,
  );
  const [targetLanguage, setTargetLanguage] = useState<string>(
    config.targetLanguage ?? 'none',
  );
  const [showDualLanguage, setShowDualLanguage] = useState<boolean>(
    config.showDualLanguage ?? true,
  );
  const [dubbingEnabled, setDubbingEnabled] = useState<boolean>(
    config.dubbingEnabled ?? false,
  );
  const [fontSize, setFontSize] = useState<CaptionFontSize>(config.fontSize);
  const [position, setPosition] = useState<CaptionPosition>(config.position);
  const [vocabulary, setVocabulary] = useState<string[]>(
    config.vocabulary || [],
  );
  const [newTerm, setNewTerm] = useState('');

  const handleAddTerm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    if (!vocabulary.includes(trimmed)) {
      setVocabulary([...vocabulary, trimmed]);
    }
    setNewTerm('');
  };

  const handleRemoveTerm = (termToRemove: string) => {
    setVocabulary(vocabulary.filter((t) => t !== termToRemove));
  };

  const handleApply = () => {
    onSave({
      language,
      fontSize,
      position,
      vocabulary,
      targetLanguage,
      showDualLanguage,
      dubbingEnabled,
    });
    onClose();
  };

  return (
    <div
      className="shortcuts-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="caption-settings-title"
      data-testid="caption-settings-modal"
    >
      <div
        className="shortcuts-modal-card"
        style={{ maxWidth: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-head">
          <h3 id="caption-settings-title">Closed Captions & STT Settings</h3>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            margin: '16px 0 24px',
          }}
        >
          {/* Spoken Language */}
          <label className="device-select-group">
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Spoken Language (Input)
            </span>
            <select
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value as SupportedLanguageCode)
              }
              data-testid="caption-language-select"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>

          {/* Target Translation Language (30+ Languages) */}
          <div
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--soft)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Languages size={18} style={{ color: 'var(--accent)' }} />
              <div>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'block',
                  }}
                >
                  Live Translation (30+ Languages)
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Translate speech in real-time with sub-second latency
                </span>
              </div>
            </div>

            <label className="device-select-group" style={{ margin: 0 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                Translate Captions Into
              </span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                data-testid="caption-target-translation-select"
                style={{ background: 'var(--surface)' }}
              >
                <option value="none">
                  Off (Display Original Language Only)
                </option>
                {TRANSLATION_LANGUAGES.filter((l) => l.code !== 'none').map(
                  (l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            {targetLanguage !== 'none' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  paddingTop: '4px',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showDualLanguage}
                    onChange={(e) => setShowDualLanguage(e.target.checked)}
                    data-testid="caption-dual-language-toggle"
                  />
                  <span>
                    Show dual-language subtitles (original text + translated)
                  </span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={dubbingEnabled}
                    onChange={(e) => setDubbingEnabled(e.target.checked)}
                    data-testid="caption-dubbing-toggle"
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Volume2 size={14} style={{ color: 'var(--accent)' }} />
                    <span>
                      Live voice dubbing (audibly speak translated captions)
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Font Size & Position in a row */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
          >
            <label className="device-select-group">
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Font Size
              </span>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as CaptionFontSize)}
                data-testid="caption-font-size-select"
              >
                <option value="small">Small (14px)</option>
                <option value="medium">Medium (18px)</option>
                <option value="large">Large (24px)</option>
              </select>
            </label>

            <label className="device-select-group">
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                Overlay Position
              </span>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as CaptionPosition)}
                data-testid="caption-position-select"
              >
                <option value="bottom">Bottom (Above controls)</option>
                <option value="top">Top (Header banner)</option>
              </select>
            </label>
          </div>

          {/* Custom Vocabulary / Jargon Boosting */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Custom Vocabulary & Technical Jargon
            </span>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>
              Add domain terms, company acronyms, or speaker names to boost
              recognition accuracy.
            </p>
            <form onSubmit={handleAddTerm} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="e.g. Kubernetes, WebRTC, MeetIT..."
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                className="input"
                style={{ flex: 1, padding: '7px 10px', fontSize: '0.875rem' }}
                data-testid="add-vocab-input"
              />
              <button
                type="submit"
                className="btn btn-sm"
                disabled={!newTerm.trim()}
                data-testid="add-vocab-btn"
              >
                + Add Term
              </button>
            </form>

            {vocabulary.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  maxHeight: 120,
                  overflowY: 'auto',
                  padding: 4,
                }}
              >
                {vocabulary.map((term) => (
                  <span
                    key={term}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '12px',
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      padding: '3px 8px',
                      borderRadius: 14,
                    }}
                  >
                    <span>{term}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm(term)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: 'var(--muted)',
                        fontWeight: 'bold',
                        fontSize: '12px',
                      }}
                      title={`Remove ${term}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleApply}
            data-testid="save-caption-settings-btn"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
}
