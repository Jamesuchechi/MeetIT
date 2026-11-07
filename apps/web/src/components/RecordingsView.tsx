import React, { useState, useEffect } from 'react';
import {
  fetchRecordings,
  deleteRecording,
  formatFileSize,
  formatRecordingDuration,
  formatRecordingDate,
  type RecordingItem,
  type RecordingStatus,
  type RecordingLayout,
} from '../lib/recordingsStore';
import { copyToClipboard, type AuthUser } from '../types';
import { RecIcon, CloseIcon, CheckIcon, LnkIcon } from './Icons';

interface RecordingsViewProps {
  user: AuthUser | null;
  onToast: (msg: string) => void;
  onEnterRoom?: (code: string) => void;
}

export function RecordingsView({
  user,
  onToast,
  onEnterRoom,
}: RecordingsViewProps) {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RecordingStatus>(
    'all',
  );
  const [layoutFilter, setLayoutFilter] = useState<'all' | RecordingLayout>(
    'all',
  );
  const [playingRecording, setPlayingRecording] =
    useState<RecordingItem | null>(null);
  const [deletingRecording, setDeletingRecording] =
    useState<RecordingItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const items = await fetchRecordings(user?.id);
      setRecordings(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.id]);

  const handleCopyLink = async (rec: RecordingItem) => {
    const url =
      rec.downloadUrl ||
      rec.playUrl ||
      `${window.location.origin}/recordings/${rec.id}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(rec.id);
      onToast(`Recording link copied.`);
      window.setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRecording) return;
    setIsDeleting(true);
    try {
      const ok = await deleteRecording(deletingRecording.id);
      if (ok) {
        setRecordings((prev) =>
          prev.filter((r) => r.id !== deletingRecording.id),
        );
        onToast('Recording deleted.');
      } else {
        onToast('Failed to delete recording.');
      }
    } finally {
      setIsDeleting(false);
      setDeletingRecording(null);
    }
  };

  const filtered = recordings.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (layoutFilter !== 'all' && r.layout !== layoutFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesTitle = r.roomTitle.toLowerCase().includes(q);
      const matchesCode = r.roomCode.toLowerCase().includes(q);
      if (!matchesTitle && !matchesCode) return false;
    }
    return true;
  });

  return (
    <div className="recordings-page" data-testid="recordings-page">
      {/* Header section */}
      <div className="head" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow">Studio Vault</span>
          <h2>Meeting Recordings</h2>
          <p>
            Review, stream, download, and manage your cloud composite session
            recordings.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="recordings-filter-bar">
        <div className="recordings-search-wrap">
          <input
            type="search"
            placeholder="Search by meeting title or room code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            aria-label="Search recordings"
            data-testid="search-recordings-input"
          />
        </div>

        <div className="recordings-filter-group">
          <label className="recordings-select-label">
            <span>Layout:</span>
            <select
              value={layoutFilter}
              onChange={(e) =>
                setLayoutFilter(e.target.value as 'all' | RecordingLayout)
              }
              aria-label="Filter by layout"
            >
              <option value="all">All layouts</option>
              <option value="grid">Grid Gallery</option>
              <option value="speaker">Speaker View</option>
            </select>
          </label>

          <label className="recordings-select-label">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | RecordingStatus)
              }
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="ready">Ready</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        </div>
      </div>

      {/* Recordings List / Grid */}
      {loading ? (
        <div className="recordings-loading">
          <div className="spinner" />
          <p>Loading your recordings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="recordings-empty" data-testid="recordings-empty">
          <div className="empty-icon-bubble">
            <RecIcon />
          </div>
          <h3>No recordings found</h3>
          <p>
            {searchQuery || statusFilter !== 'all' || layoutFilter !== 'all'
              ? 'No recordings match your current filters. Try clearing search criteria.'
              : 'You have not recorded any meetings yet. Start a call and click "Record" to record your first session.'}
          </p>
          {(searchQuery ||
            statusFilter !== 'all' ||
            layoutFilter !== 'all') && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setLayoutFilter('all');
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="recordings-grid" data-testid="recordings-grid">
          {filtered.map((rec) => (
            <article
              key={rec.id}
              className="recording-card"
              data-testid={`recording-card-${rec.id}`}
            >
              {/* Video Thumbnail Header */}
              <div
                className="recording-thumbnail"
                onClick={() => setPlayingRecording(rec)}
                role="button"
                tabIndex={0}
                aria-label={`Play recording for ${rec.roomTitle}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPlayingRecording(rec);
                  }
                }}
              >
                <div className="thumbnail-backdrop-pattern" />
                <div className="play-overlay-button" aria-hidden="true">
                  <span>▶</span>
                </div>
                <div className="thumbnail-badges">
                  <span className="rec-badge duration-badge">
                    {formatRecordingDuration(rec.durationSeconds)}
                  </span>
                  <span className="rec-badge layout-badge">
                    {rec.layout === 'speaker' ? 'Speaker' : 'Grid'}
                  </span>
                </div>
              </div>

              {/* Card Meta Content */}
              <div className="recording-card-body">
                <div className="recording-card-header">
                  <h4 title={rec.roomTitle}>{rec.roomTitle}</h4>
                  <span
                    className={`rec-status-tag ${rec.status}`}
                    title={`Recording status: ${rec.status}`}
                  >
                    {rec.status}
                  </span>
                </div>

                <div className="recording-card-meta">
                  <div className="meta-row">
                    <span className="meta-room-code">
                      {onEnterRoom ? (
                        <button
                          type="button"
                          className="room-code-link"
                          onClick={() => onEnterRoom(rec.roomCode)}
                          title={`Rejoin room ${rec.roomCode}`}
                        >
                          {rec.roomCode}
                        </button>
                      ) : (
                        rec.roomCode
                      )}
                    </span>
                    <span className="meta-sep">·</span>
                    <span className="meta-size">
                      {formatFileSize(rec.fileSizeBytes)}
                    </span>
                  </div>
                  <div className="meta-date">
                    {formatRecordingDate(rec.startedAt)}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="recording-card-actions">
                  <button
                    type="button"
                    className="btn btn-sm primary"
                    onClick={() => setPlayingRecording(rec)}
                    data-testid={`play-rec-${rec.id}`}
                  >
                    ▶ Play
                  </button>

                  {rec.downloadUrl ? (
                    <a
                      href={rec.downloadUrl}
                      download={`${rec.roomCode}-${Date.now()}.mp4`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm"
                      title="Download MP4 file"
                      data-testid={`download-rec-${rec.id}`}
                    >
                      ⬇ Download
                    </a>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn-sm btn-icon"
                    onClick={() => void handleCopyLink(rec)}
                    aria-label="Copy recording link"
                    title="Copy recording link"
                  >
                    {copiedId === rec.id ? <CheckIcon /> : <LnkIcon />}
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm danger-outline-btn btn-icon"
                    onClick={() => setDeletingRecording(rec)}
                    aria-label="Delete recording"
                    title="Delete recording"
                    data-testid={`delete-rec-${rec.id}`}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Built-in Video Player Modal */}
      {playingRecording && (
        <div
          className="shortcuts-modal-backdrop"
          onClick={() => setPlayingRecording(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-modal-title"
          data-testid="recording-player-modal"
        >
          <div
            className="shortcuts-modal-card recording-player-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-modal-head">
              <div>
                <h3 id="player-modal-title">{playingRecording.roomTitle}</h3>
                <small style={{ color: 'var(--muted)' }}>
                  Room: {playingRecording.roomCode} ·{' '}
                  {formatRecordingDate(playingRecording.startedAt)} ·{' '}
                  {formatRecordingDuration(playingRecording.durationSeconds)} ·{' '}
                  {playingRecording.layout === 'speaker'
                    ? 'Speaker layout'
                    : 'Grid layout'}
                </small>
              </div>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setPlayingRecording(null)}
                aria-label="Close video player"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="recording-video-wrapper">
              <video
                controls
                autoPlay
                playsInline
                className="recording-video-player"
                src={playingRecording.playUrl || playingRecording.downloadUrl}
              >
                <p>
                  Your browser does not support HTML5 video playback.{' '}
                  {playingRecording.downloadUrl && (
                    <a href={playingRecording.downloadUrl} download>
                      Download video file
                    </a>
                  )}
                </p>
              </video>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 16,
              }}
            >
              <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                Size: {formatFileSize(playingRecording.fileSizeBytes)}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {playingRecording.downloadUrl && (
                  <a
                    href={playingRecording.downloadUrl}
                    download={`${playingRecording.roomCode}.mp4`}
                    className="btn primary btn-sm"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ⬇ Download MP4
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPlayingRecording(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingRecording && (
        <div
          className="shortcuts-modal-backdrop"
          onClick={() => !isDeleting && setDeletingRecording(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          data-testid="delete-recording-modal"
        >
          <div
            className="shortcuts-modal-card"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-modal-head">
              <h3 id="delete-confirm-title">Delete recording?</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setDeletingRecording(null)}
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
                lineHeight: 1.5,
                color: 'var(--muted)',
              }}
            >
              Are you sure you want to delete the recording for{' '}
              <strong>"{deletingRecording.roomTitle}"</strong>? This will
              permanently remove the video file and its metadata.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => setDeletingRecording(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger-btn"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
                data-testid="confirm-delete-rec-btn"
              >
                {isDeleting ? 'Deleting...' : 'Delete recording'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
