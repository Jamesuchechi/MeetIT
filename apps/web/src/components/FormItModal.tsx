import React, { useState, useEffect, useRef } from 'react';
import type { FormItSession } from '@meetit/protocol';

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
      // Validate data structure from FormIT
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="formit-modal-title"
    >
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl text-neutral-100 p-6 flex flex-col gap-5 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 font-bold text-lg">
              📝
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="formit-modal-title"
                  className="text-xl font-bold text-white"
                >
                  FormIT Integration
                </h2>
                <span className="text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  form-it-sandy.vercel.app
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Launch interactive surveys and questionnaires live during the
                meeting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* If no active FormIT session */}
        {!activeSession || !activeSession.active ? (
          isHost ? (
            <form onSubmit={handleLaunch} className="flex flex-col gap-4">
              <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl text-xs text-neutral-300 leading-relaxed">
                Connect your FormIT form to collect structured feedback, pulse
                checks, or exit surveys. Attendees can complete the form
                directly without leaving the video call.
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  FormIT Form URL or Slug
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="https://form-it-sandy.vercel.app/f/my-survey or slug"
                    value={formUrlInput}
                    onChange={(e) => setFormUrlInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Example:{' '}
                  <code>https://form-it-sandy.vercel.app/f/feedback</code> or
                  simply <code>feedback</code>
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  Survey Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. End of Meeting Feedback"
                  value={formTitleInput}
                  onChange={(e) => setFormTitleInput(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 font-semibold text-sm rounded-xl text-neutral-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 font-bold text-sm rounded-xl text-white shadow-lg transition"
                >
                  🚀 Launch Survey to Call
                </button>
              </div>
            </form>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-500">
              <span className="text-4xl mb-2">📋</span>
              <p className="font-semibold text-neutral-300">
                No FormIT survey active
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                The host hasn't launched a survey yet. It will appear here when
                launched.
              </p>
            </div>
          )
        ) : (
          /* Active FormIT session */
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between p-3 bg-neutral-800/80 rounded-xl border border-neutral-700">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {activeSession.title || 'FormIT Live Survey'}
                  </h3>
                  <a
                    href={activeSession.formUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <span>Open in new tab</span> ↗
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-white">
                    {activeSession.submissionsCount}
                  </span>
                  <span className="text-[10px] text-neutral-400 block">
                    {activeSession.submissionsCount === 1
                      ? 'response'
                      : 'responses'}
                  </span>
                </div>

                {isHost && (
                  <div className="flex items-center gap-2">
                    {onAttachToSummary && (
                      <button
                        onClick={() => onAttachToSummary(activeSession)}
                        className="text-xs px-2.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition"
                        title="Embed survey results in meeting summary"
                      >
                        📌 Attach to Notes
                      </button>
                    )}
                    <button
                      onClick={() => onCloseFormIt(activeSession.id)}
                      className="text-xs px-2.5 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/30 rounded-lg transition font-medium"
                    >
                      End Survey
                    </button>
                  </div>
                )}
              </div>
            </div>

            {hasSubmittedLocally && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-center text-xs text-emerald-300">
                ✓ Thank you! Your FormIT submission was recorded.
              </div>
            )}

            {/* Embedded FormIT Frame */}
            <div
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden transition-all duration-300"
              style={{ minHeight: `${iframeHeight}px` }}
            >
              <iframe
                ref={iframeRef}
                src={getEmbedUrl(activeSession.formUrl)}
                title={activeSession.title || 'FormIT Survey'}
                className="w-full h-full min-h-[500px] border-0"
                allow="camera; microphone; clipboard-write"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
