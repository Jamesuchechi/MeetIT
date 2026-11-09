import React, { useState, useEffect, useRef } from 'react';
import type { FormItSession } from '@meetit/protocol';
import {
  ClipboardList,
  ExternalLink,
  X,
  Send,
  Pin,
  Check,
  Info,
} from 'lucide-react';

interface FormItModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  selfId: string;
  displayName: string;
  activeSession: FormItSession | null;
  onLaunchFormIt: (formUrl: string, title?: string) => void;
  onSubmitFormIt: (id: string, editKey?: string | null) => void;
  onCloseFormIt: (id: string) => void;
  onAttachToSummary?: (session: FormItSession) => void;
}

const DEFAULT_FORMIT_BASE = 'https://form-it-sandy.vercel.app';

export function FormItModal({
  isOpen,
  onClose,
  isHost,
  selfId,
  displayName,
  activeSession,
  onLaunchFormIt,
  onSubmitFormIt,
  onCloseFormIt,
  onAttachToSummary,
}: FormItModalProps) {
  if (!isOpen) return null;

  const [formUrlInput, setFormUrlInput] = useState('');
  const [formTitleInput, setFormTitleInput] = useState('');
  const [iframeHeight, setIframeHeight] = useState<number>(550);
  const [hasSubmittedLocally, setHasSubmittedLocally] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Parse embed URL with embed=true query parameter
  const getEmbedUrl = (rawUrl: string): string => {
    let trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      if (trimmed.startsWith('/f/')) {
        trimmed = `${DEFAULT_FORMIT_BASE}${trimmed}`;
      } else {
        trimmed = `${DEFAULT_FORMIT_BASE}/f/${trimmed}`;
      }
    }
    try {
      const parsed = new URL(trimmed);
      parsed.searchParams.set('embed', 'true');
      return parsed.toString();
    } catch {
      return `${trimmed}${trimmed.includes('?') ? '&' : '?'}embed=true`;
    }
  };

  // Listen for FormIT postMessage events: formit:resize and formit:submit
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'formit:resize' && typeof data.height === 'number') {
        const nextHeight = Math.max(300, Math.min(data.height + 40, 900));
        setIframeHeight(nextHeight);
      }

      if (data.type === 'formit:submit' && activeSession) {
        setHasSubmittedLocally(true);
        onSubmitFormIt(activeSession.id, data.editKey ?? null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeSession, onSubmitFormIt]);

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUrlInput.trim()) return;
    const cleanUrl = getEmbedUrl(formUrlInput);
    onLaunchFormIt(cleanUrl, formTitleInput.trim() || undefined);
    setFormUrlInput('');
    setFormTitleInput('');
  };

  return (
    <div
      className="app-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="formit-modal-title"
      onClick={onClose}
    >
      <div
        className="app-modal-dialog wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal-header">
          <div className="app-modal-title-group">
            <div className="app-modal-icon">
              <ClipboardList size={20} />
            </div>
            <div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <h2 id="formit-modal-title" className="app-modal-title">
                  FormIT Integration
                </h2>
                <span
                  className="panel-badge muted"
                  style={{ fontSize: '10px' }}
                >
                  form-it-sandy.vercel.app
                </span>
              </div>
              <p className="app-modal-subtitle">
                Launch interactive surveys and questionnaires live during the
                meeting
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-modal-close"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="app-modal-body">
          {/* If no active FormIT session */}
          {!activeSession || !activeSession.active ? (
            isHost ? (
              <form
                onSubmit={handleLaunch}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div
                  className="panel-card"
                  style={{
                    background: 'var(--soft)',
                    borderColor: 'var(--accent)',
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}
                >
                  <Info
                    size={18}
                    style={{
                      color: 'var(--accent)',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '13px',
                      lineHeight: 1.5,
                      color: 'var(--ink)',
                    }}
                  >
                    Connect your FormIT form to collect structured feedback,
                    pulse checks, or exit surveys. Attendees can complete the
                    form directly without leaving the video call.
                  </span>
                </div>

                <div className="panel-form-group">
                  <label htmlFor="formit-url-input">
                    FormIT Form URL or Slug
                  </label>
                  <input
                    id="formit-url-input"
                    type="text"
                    required
                    placeholder="https://form-it-sandy.vercel.app/f/my-survey or slug"
                    value={formUrlInput}
                    onChange={(e) => setFormUrlInput(e.target.value)}
                    className="panel-input"
                  />
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: 'var(--muted)',
                      marginTop: '2px',
                    }}
                  >
                    Example:{' '}
                    <code>https://form-it-sandy.vercel.app/f/feedback</code> or
                    simply <code>feedback</code>
                  </span>
                </div>

                <div className="panel-form-group">
                  <label htmlFor="formit-title-input">
                    Survey Title (Optional)
                  </label>
                  <input
                    id="formit-title-input"
                    type="text"
                    placeholder="e.g. End of Meeting Feedback"
                    value={formTitleInput}
                    onChange={(e) => setFormTitleInput(e.target.value)}
                    className="panel-input"
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    paddingTop: '8px',
                  }}
                >
                  <button
                    type="button"
                    onClick={onClose}
                    className="panel-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="panel-btn-primary">
                    <Send size={15} />
                    Launch Survey to Call
                  </button>
                </div>
              </form>
            ) : (
              <div className="panel-empty-state">
                <ClipboardList className="panel-empty-icon" />
                <strong className="panel-empty-text">
                  No FormIT survey active
                </strong>
                <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  The host has not launched a survey yet. It will appear here
                  when launched.
                </span>
              </div>
            )
          ) : (
            /* Active FormIT session */
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div
                className="panel-card"
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <span className="panel-badge active">Live</span>
                  <div>
                    <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                      {activeSession.title || 'FormIT Live Survey'}
                    </strong>
                    <a
                      href={activeSession.formUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '12px',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        textDecoration: 'none',
                        marginTop: '2px',
                      }}
                    >
                      <span>Open in new tab</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <div style={{ textAlign: 'right' }}>
                    <strong
                      style={{ fontSize: '14px', fontFamily: 'monospace' }}
                    >
                      {activeSession.submissionsCount}
                    </strong>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted)',
                        display: 'block',
                      }}
                    >
                      {activeSession.submissionsCount === 1
                        ? 'response'
                        : 'responses'}
                    </span>
                  </div>

                  {isHost && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {onAttachToSummary && (
                        <button
                          type="button"
                          onClick={() => onAttachToSummary(activeSession)}
                          className="panel-btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          title="Embed survey results in meeting summary"
                        >
                          <Pin size={12} /> Attach to Notes
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onCloseFormIt(activeSession.id)}
                        className="panel-btn-danger"
                      >
                        End Survey
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {hasSubmittedLocally && (
                <div
                  className="panel-card"
                  style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: '#22c55e',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={16} />
                  <span>Thank you! Your FormIT submission was recorded.</span>
                </div>
              )}

              {/* Embedded FormIT Frame */}
              <div
                style={{
                  width: '100%',
                  minHeight: `${iframeHeight}px`,
                  borderRadius: '12px',
                  border: '1px solid var(--line)',
                  overflow: 'hidden',
                  background: 'var(--surface)',
                }}
              >
                <iframe
                  ref={iframeRef}
                  src={getEmbedUrl(activeSession.formUrl)}
                  title={activeSession.title || 'FormIT Survey'}
                  style={{
                    width: '100%',
                    height: `${iframeHeight}px`,
                    border: 'none',
                  }}
                  allow="camera; microphone; clipboard-write"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
