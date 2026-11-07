import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  fetchTranscripts,
  deleteTranscript,
  exportTranscriptAsTxt,
  exportTranscriptAsSrt,
  exportTranscriptAsVtt,
  exportTranscriptAsDocx,
  downloadTranscriptFile,
  formatMsToClock,
  type MeetingTranscript,
  type TranscriptCue,
} from '../lib/transcriptsStore';
import {
  formatEmailDigest,
  extractHeuristicIntelligence,
} from '../lib/aiService';
import { AskMeetingModal } from './AskMeetingModal';
import { EmailDigestModal } from './EmailDigestModal';
import { copyToClipboard, type AuthUser } from '../types';
import { CloseIcon, CheckIcon, LnkIcon } from './Icons';

interface TranscriptsViewProps {
  user: AuthUser | null;
  onToast: (msg: string) => void;
  onEnterRoom?: (code: string) => void;
}

export function TranscriptsView({
  user,
  onToast,
  onEnterRoom,
}: TranscriptsViewProps) {
  const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState<string>('all');
  const [selectedTranscript, setSelectedTranscript] =
    useState<MeetingTranscript | null>(null);

  // Modals & Interactive Tools state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAskMeeting, setShowAskMeeting] = useState(false);
  const [showEmailDigest, setShowEmailDigest] = useState(false);
  const [copiedLineId, setCopiedLineId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Text-To-Speech (TTS) reading state
  const [speakingCueId, setSpeakingCueId] = useState<string | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const items = await fetchTranscripts(user?.id);
      setTranscripts(items);
      if (items.length > 0 && !selectedTranscript) {
        setSelectedTranscript(items[0] || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.id]);

  // Global Transcripts Vault Metrics
  const stats = useMemo(() => {
    const totalCount = transcripts.length;
    let totalCues = 0;
    let totalDurationSecs = 0;
    const speakers = new Set<string>();

    for (const t of transcripts) {
      totalCues += t.cues.length;
      totalDurationSecs += t.durationSeconds || 0;
      for (const c of t.cues) {
        if (c.speakerName) speakers.add(c.speakerName);
      }
    }

    const hours = Math.floor(totalDurationSecs / 3600);
    const minutes = Math.floor((totalDurationSecs % 3600) / 60);
    const durationLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return {
      totalCount,
      totalCues,
      uniqueSpeakers: speakers.size,
      durationLabel,
    };
  }, [transcripts]);

  // Unique speakers in the currently selected transcript
  const activeTranscriptSpeakers = useMemo(() => {
    if (!selectedTranscript) return [];
    const set = new Set<string>();
    for (const c of selectedTranscript.cues) {
      if (c.speakerName) set.add(c.speakerName);
    }
    return Array.from(set);
  }, [selectedTranscript]);

  const filteredTranscripts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return transcripts;
    return transcripts.filter((t) => {
      const matchMeta =
        t.roomTitle.toLowerCase().includes(q) ||
        t.roomCode.toLowerCase().includes(q);
      if (matchMeta) return true;
      return t.cues.some(
        (c) =>
          c.text.toLowerCase().includes(q) ||
          c.speakerName.toLowerCase().includes(q),
      );
    });
  }, [transcripts, searchQuery]);

  // Filter cues of the selected transcript by speaker or query
  const displayedCues = useMemo(() => {
    if (!selectedTranscript) return [];
    return selectedTranscript.cues.filter((cue) => {
      if (speakerFilter !== 'all' && cue.speakerName !== speakerFilter) {
        return false;
      }
      return true;
    });
  }, [selectedTranscript, speakerFilter]);

  // Highlight matches helper
  const highlightText = (text: string, query: string) => {
    const q = query.trim();
    if (!q) return text;
    const regex = new RegExp(
      `(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi',
    );
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="dialogue-highlight">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  const handleExport = (
    format: 'txt' | 'srt' | 'vtt' | 'docx',
    transcript: MeetingTranscript,
  ) => {
    const safeTitle = transcript.roomTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const baseName = `transcript-${transcript.roomCode}-${safeTitle}`;

    switch (format) {
      case 'txt':
        downloadTranscriptFile(
          exportTranscriptAsTxt(transcript),
          `${baseName}.txt`,
          'text/plain',
        );
        onToast('Downloaded .TXT transcript');
        break;
      case 'srt':
        downloadTranscriptFile(
          exportTranscriptAsSrt(transcript),
          `${baseName}.srt`,
          'application/x-subrip',
        );
        onToast('Downloaded .SRT subtitle file');
        break;
      case 'vtt':
        downloadTranscriptFile(
          exportTranscriptAsVtt(transcript),
          `${baseName}.vtt`,
          'text/vtt',
        );
        onToast('Downloaded .VTT subtitle file');
        break;
      case 'docx':
        downloadTranscriptFile(
          exportTranscriptAsDocx(transcript),
          `${baseName}.docx.md`,
          'text/markdown',
        );
        onToast('Downloaded formatted Markdown / DOCX transcript');
        break;
    }
  };

  const handleCopyFullTranscript = async () => {
    if (!selectedTranscript) return;
    const text = selectedTranscript.cues
      .map((c) => `[${formatMsToClock(c.startMs)}] ${c.speakerName}: ${c.text}`)
      .join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedAll(true);
      onToast('Full dialogue copied to clipboard.');
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleCopySingleCue = async (cue: TranscriptCue) => {
    const line = `[${formatMsToClock(cue.startMs)}] ${cue.speakerName}: ${cue.text}`;
    const ok = await copyToClipboard(line);
    if (ok) {
      setCopiedLineId(cue.id);
      onToast('Dialogue line copied.');
      setTimeout(() => setCopiedLineId(null), 2000);
    }
  };

  const handleSpeakCue = (cue: TranscriptCue) => {
    if (!synthRef.current) {
      onToast('Speech synthesis is not available in your browser.');
      return;
    }

    if (speakingCueId === cue.id) {
      synthRef.current.cancel();
      setSpeakingCueId(null);
      return;
    }

    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(cue.text);
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingCueId(null);
    utterance.onerror = () => setSpeakingCueId(null);
    setSpeakingCueId(cue.id);
    synthRef.current.speak(utterance);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    const success = await deleteTranscript(deletingId);
    if (success) {
      const updated = transcripts.filter((t) => t.id !== deletingId);
      setTranscripts(updated);
      if (selectedTranscript?.id === deletingId) {
        setSelectedTranscript(updated[0] || null);
      }
      onToast('Transcript deleted');
    } else {
      onToast('Failed to delete transcript');
    }
    setIsDeleting(false);
    setDeletingId(null);
  };

  // Prepare text & digest for AI modals
  const fullTranscriptText = useMemo(() => {
    if (!selectedTranscript) return '';
    return selectedTranscript.cues
      .map((c) => `[${formatMsToClock(c.startMs)}] ${c.speakerName}: ${c.text}`)
      .join('\n');
  }, [selectedTranscript]);

  const emailDigest = useMemo(() => {
    if (!selectedTranscript) {
      return { subject: '', bodyText: '', bodyHtml: '', mailtoUrl: '' };
    }
    const intel = extractHeuristicIntelligence(
      fullTranscriptText,
      selectedTranscript.roomTitle,
    );
    return formatEmailDigest(
      intel,
      selectedTranscript.roomTitle,
      selectedTranscript.roomCode,
      selectedTranscript.startedAt,
      activeTranscriptSpeakers,
    );
  }, [selectedTranscript, fullTranscriptText, activeTranscriptSpeakers]);

  return (
    <div className="recordings-view-shell" data-testid="transcripts-view">
      {/* Header */}
      <div className="recordings-hero" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow">Dialogue &amp; Speech Intelligence</span>
          <h2>Meeting Transcripts Hub</h2>
          <p className="hero-subtext">
            Searchable dialogue, speaker-separated logs, interactive speech
            playback, and multi-format exports.
          </p>
        </div>
      </div>

      {/* Global Transcripts Stats */}
      <div className="hub-stats-row">
        <div className="hub-stat-card">
          <div className="hub-stat-icon">💬</div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">{stats.totalCount}</span>
            <span className="hub-stat-label">Transcripts Recorded</span>
          </div>
        </div>

        <div className="hub-stat-card">
          <div className="hub-stat-icon">🗣️</div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">{stats.totalCues}</span>
            <span className="hub-stat-label">Dialogue Cues</span>
          </div>
        </div>

        <div className="hub-stat-card">
          <div className="hub-stat-icon">👥</div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">{stats.uniqueSpeakers}</span>
            <span className="hub-stat-label">Unique Speakers</span>
          </div>
        </div>

        <div className="hub-stat-card">
          <div className="hub-stat-icon">⏳</div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">{stats.durationLabel}</span>
            <span className="hub-stat-label">Total Spoken Time</span>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="recordings-filter-bar">
        <div className="recordings-search-wrap" style={{ flex: 1 }}>
          <input
            type="search"
            placeholder="Search dialogue keywords, speakers, or meeting codes across transcripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            aria-label="Search transcripts"
            data-testid="search-transcripts-input"
          />
        </div>

        {selectedTranscript && activeTranscriptSpeakers.length > 0 && (
          <div className="recordings-filter-group">
            <label className="recordings-select-label">
              <span>Speaker filter:</span>
              <select
                value={speakerFilter}
                onChange={(e) => setSpeakerFilter(e.target.value)}
                aria-label="Filter dialogue by speaker"
              >
                <option value="all">All speakers</option>
                {activeTranscriptSpeakers.map((spk) => (
                  <option key={spk} value={spk}>
                    {spk}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Main Content Layout */}
      {loading ? (
        <div className="recordings-loading">
          <div className="spinner" />
          <p>Loading transcripts...</p>
        </div>
      ) : transcripts.length === 0 ? (
        <div className="recordings-empty" data-testid="transcripts-empty">
          <div className="empty-icon-bubble">💬</div>
          <h3>No transcripts recorded yet</h3>
          <p>
            Closed captions and meeting transcripts are automatically recorded
            during calls when Closed Captions (CC) are enabled.
          </p>
        </div>
      ) : (
        <div
          className="notes-split-layout"
          style={{ minHeight: '560px', marginTop: 12 }}
        >
          {/* Left Column: List of Transcripts */}
          <div
            className="notes-list-col"
            role="listbox"
            aria-label="Transcripts list"
            style={{ maxWidth: '340px' }}
          >
            {filteredTranscripts.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--muted)' }}>
                No transcripts match "{searchQuery}"
              </div>
            ) : (
              filteredTranscripts.map((t) => {
                const isSelected = selectedTranscript?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`note-list-card ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTranscript(t);
                      setSpeakerFilter('all');
                    }}
                    data-testid={`transcript-item-${t.id}`}
                  >
                    <div className="note-list-card-top">
                      <strong>{t.roomTitle}</strong>
                      <code className="note-room-pill">{t.roomCode}</code>
                    </div>
                    <p className="note-list-summary">
                      {t.cues.length > 0
                        ? `${t.cues[0]?.speakerName}: "${t.cues[0]?.text}"`
                        : 'No spoken dialogue recorded.'}
                    </p>
                    <div className="note-list-meta">
                      <time>
                        {new Date(t.startedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </time>
                      <span className="note-task-pill">
                        {t.cues.length} {t.cues.length === 1 ? 'line' : 'lines'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Column: Selected Transcript Studio Detail */}
          {selectedTranscript ? (
            <div
              className="note-detail-col"
              data-testid="transcript-detail-pane"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {/* Studio Header & Action Bar */}
              <div className="note-detail-head">
                <div>
                  <div className="note-detail-badges">
                    <code className="note-room-pill">
                      {onEnterRoom ? (
                        <button
                          type="button"
                          className="room-code-link"
                          onClick={() =>
                            onEnterRoom(selectedTranscript.roomCode)
                          }
                        >
                          Room {selectedTranscript.roomCode}
                        </button>
                      ) : (
                        `Room ${selectedTranscript.roomCode}`
                      )}
                    </code>
                    <span className="note-date-label">
                      {new Date(selectedTranscript.startedAt).toLocaleString()}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginLeft: 8,
                      }}
                    >
                      Duration:{' '}
                      {Math.floor(selectedTranscript.durationSeconds / 60)}m{' '}
                      {selectedTranscript.durationSeconds % 60}s
                    </span>
                  </div>
                  <h3>{selectedTranscript.roomTitle}</h3>
                </div>

                {/* AI & Quick Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => setShowAskMeeting(true)}
                    title="Ask AI questions about this dialogue"
                  >
                    💬 Ask AI
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setShowEmailDigest(true)}
                    title="Generate Email Digest for attendees"
                  >
                    📧 Email Digest
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void handleCopyFullTranscript()}
                    title="Copy full dialogue text"
                  >
                    {copiedAll ? <CheckIcon /> : <LnkIcon />}
                    <span>{copiedAll ? 'Copied' : 'Copy All'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-icon-subtle danger"
                    onClick={() => setDeletingId(selectedTranscript.id)}
                    title="Delete transcript"
                    aria-label="Delete transcript"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Multi-Format Export Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--soft)',
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: 'var(--muted)' }}>
                  Export Formats ({selectedTranscript.cues.length} lines):
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleExport('txt', selectedTranscript)}
                    title="Export plain text (.txt)"
                    data-testid="export-txt-btn"
                  >
                    TXT
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleExport('srt', selectedTranscript)}
                    title="Export SubRip Subtitles (.srt)"
                    data-testid="export-srt-btn"
                  >
                    SRT
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleExport('vtt', selectedTranscript)}
                    title="Export WebVTT Subtitles (.vtt)"
                    data-testid="export-vtt-btn"
                  >
                    VTT
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm primary"
                    onClick={() => handleExport('docx', selectedTranscript)}
                    title="Export formatted Markdown / DOCX"
                    data-testid="export-docx-btn"
                  >
                    DOCX
                  </button>
                </div>
              </div>

              {/* Dialogue Scroll Stream */}
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  padding: 16,
                  maxHeight: '520px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
                data-testid="transcript-dialogue-list"
              >
                {displayedCues.length === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: 0 }}>
                    {speakerFilter !== 'all'
                      ? `No dialogue lines from speaker "${speakerFilter}".`
                      : 'No dialogue cues recorded for this meeting.'}
                  </p>
                ) : (
                  displayedCues.map((cue) => {
                    const isSpeaking = speakingCueId === cue.id;
                    const isCopied = copiedLineId === cue.id;
                    return (
                      <div
                        key={cue.id}
                        className={`dialogue-bubble ${isSpeaking ? 'active-speech' : ''}`}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                background: 'var(--soft)',
                                color: 'var(--primary)',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {cue.speakerName.slice(0, 1).toUpperCase()}
                            </span>
                            <strong
                              style={{
                                fontSize: '0.9rem',
                                color: 'var(--ink)',
                              }}
                            >
                              {highlightText(cue.speakerName, searchQuery)}
                            </strong>
                            <span
                              className="badge"
                              style={{
                                fontSize: '0.75rem',
                                fontFamily: 'monospace',
                              }}
                            >
                              {formatMsToClock(cue.startMs)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn-icon-subtle"
                              onClick={() => handleSpeakCue(cue)}
                              title={
                                isSpeaking
                                  ? 'Stop voice playback'
                                  : 'Read line aloud (TTS)'
                              }
                              aria-label="Read line aloud"
                              style={{ fontSize: 13 }}
                            >
                              {isSpeaking ? '⏹' : '🔊'}
                            </button>
                            <button
                              type="button"
                              className="btn-icon-subtle"
                              onClick={() => void handleCopySingleCue(cue)}
                              title="Copy dialogue line"
                              aria-label="Copy dialogue line"
                            >
                              {isCopied ? (
                                <CheckIcon style={{ width: 13, height: 13 }} />
                              ) : (
                                <LnkIcon style={{ width: 13, height: 13 }} />
                              )}
                            </button>
                          </div>
                        </div>

                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: '0.925rem',
                            lineHeight: 1.5,
                            color: 'var(--ink)',
                          }}
                        >
                          {highlightText(cue.text, searchQuery)}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Ask Meeting Modal */}
      {showAskMeeting && selectedTranscript && (
        <AskMeetingModal
          roomTitle={selectedTranscript.roomTitle}
          transcriptText={fullTranscriptText}
          onClose={() => setShowAskMeeting(false)}
        />
      )}

      {/* Email Digest Modal */}
      {showEmailDigest && selectedTranscript && (
        <EmailDigestModal
          roomTitle={selectedTranscript.roomTitle}
          digest={emailDigest}
          onClose={() => setShowEmailDigest(false)}
          onToast={onToast}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div
          className="shortcuts-modal-backdrop"
          onClick={() => !isDeleting && setDeletingId(null)}
          role="dialog"
          aria-modal="true"
          data-testid="delete-transcript-modal"
        >
          <div
            className="shortcuts-modal-card"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-modal-head">
              <h3>Delete transcript?</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setDeletingId(null)}
                disabled={isDeleting}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <p
              style={{
                margin: '14px 0 20px',
                fontSize: '0.925rem',
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to permanently delete this transcript and
              its dialogue cues?
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => setDeletingId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger-btn"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
                data-testid="confirm-delete-transcript-btn"
              >
                {isDeleting ? 'Deleting...' : 'Delete transcript'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
