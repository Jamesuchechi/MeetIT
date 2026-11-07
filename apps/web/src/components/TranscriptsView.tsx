import React, { useState, useEffect } from 'react';
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
} from '../lib/transcriptsStore';
import { type AuthUser } from '../types';
import { CloseIcon } from './Icons';

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
  const [selectedTranscript, setSelectedTranscript] =
    useState<MeetingTranscript | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetchTranscripts(user?.id).then((items) => {
      if (mounted) {
        setTranscripts(items);
        if (items.length > 0 && !selectedTranscript) {
          setSelectedTranscript(items[0] || null);
        }
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const filteredTranscripts = transcripts.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
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

  return (
    <div className="recordings-view-shell" data-testid="transcripts-view">
      {/* Header */}
      <div className="recordings-hero">
        <div>
          <span className="eyebrow">Transcripts & Captions</span>
          <h2>Meeting Transcripts Hub</h2>
          <p className="hero-subtext">
            Searchable dialogue, speaker-labeled cues, and multi-format exports
            (TXT, SRT, VTT, DOCX).
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="recordings-filter-bar">
        <div className="recordings-search-wrap" style={{ flex: 1 }}>
          <input
            type="search"
            placeholder="Search transcripts by keywords, speakers, or meeting code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            aria-label="Search transcripts"
            data-testid="search-transcripts-input"
          />
        </div>
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
          <h3>No transcripts yet</h3>
          <p>
            Closed captions and meeting transcripts are automatically recorded
            during calls when Closed Captions (CC) are enabled.
          </p>
        </div>
      ) : (
        <div
          className="notes-split-layout"
          style={{ minHeight: '520px', marginTop: 16 }}
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
                    onClick={() => setSelectedTranscript(t)}
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

          {/* Right Column: Selected Transcript Detail & Export */}
          {selectedTranscript ? (
            <div
              className="note-detail-col"
              data-testid="transcript-detail-pane"
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
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

                {/* Export Buttons */}
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
                    className="btn btn-sm"
                    onClick={() => handleExport('txt', selectedTranscript)}
                    title="Export as Plain Text (.txt)"
                    data-testid="export-txt-btn"
                  >
                    ⬇ TXT
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleExport('srt', selectedTranscript)}
                    title="Export as SubRip Subtitles (.srt)"
                    data-testid="export-srt-btn"
                  >
                    ⬇ SRT
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleExport('vtt', selectedTranscript)}
                    title="Export as WebVTT Subtitles (.vtt)"
                    data-testid="export-vtt-btn"
                  >
                    ⬇ VTT
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm primary"
                    onClick={() => handleExport('docx', selectedTranscript)}
                    title="Export as formatted document (.docx)"
                    data-testid="export-docx-btn"
                  >
                    ⬇ DOCX
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

              {/* Dialogue Scroll Area */}
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  padding: 16,
                  maxHeight: '480px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
                data-testid="transcript-dialogue-list"
              >
                {selectedTranscript.cues.length === 0 ? (
                  <p style={{ color: 'var(--muted)', margin: 0 }}>
                    No dialogue cues recorded for this meeting.
                  </p>
                ) : (
                  selectedTranscript.cues.map((cue) => (
                    <div
                      key={cue.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        paddingBottom: 8,
                        borderBottom:
                          '1px solid var(--line-subtle, rgba(255,255,255,0.05))',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 8,
                        }}
                      >
                        <strong
                          style={{
                            fontSize: '0.9rem',
                            color: 'var(--primary, #3b82f6)',
                          }}
                        >
                          {cue.speakerName}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--muted)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {formatMsToClock(cue.startMs)}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.925rem',
                          lineHeight: 1.45,
                          color: 'var(--ink)',
                        }}
                      >
                        {cue.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
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
