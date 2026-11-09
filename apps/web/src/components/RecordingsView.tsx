import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  fetchRecordings,
  deleteRecording,
  formatFileSize,
  formatRecordingDuration,
  formatRecordingDate,
  formatExpiryCountdown,
  type RecordingItem,
  type RecordingStatus,
  type RecordingLayout,
} from '../lib/recordingsStore';
import { copyToClipboard, type AuthUser } from '../types';
import { RecIcon, CloseIcon, CheckIcon, LnkIcon } from './Icons';
import {
  Video as VideoIcon,
  Clock as ClockIcon,
  HardDrive as HardDriveIcon,
  Lock as LockIcon,
  LayoutGrid as LayoutGridIcon,
  List as ListIcon,
  Play as PlayIcon,
  Trash2 as Trash2Icon,
  Download as DownloadIcon,
  RotateCcw as RotateCcwIcon,
  RotateCw as RotateCwIcon,
  PictureInPicture2 as PictureInPicture2Icon,
} from 'lucide-react';

interface RecordingsViewProps {
  user: AuthUser | null;
  onToast: (msg: string) => void;
  onEnterRoom?: (code: string) => void;
}

type SortOption = 'newest' | 'oldest' | 'duration' | 'size' | 'title';

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
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [playingRecording, setPlayingRecording] =
    useState<RecordingItem | null>(null);
  const [sharingRecording, setSharingRecording] =
    useState<RecordingItem | null>(null);
  const [deletingRecording, setDeletingRecording] =
    useState<RecordingItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Player controls state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

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

  // Overall Vault Metrics
  const stats = useMemo(() => {
    const count = recordings.length;
    const totalDurationSecs = recordings.reduce(
      (acc, r) => acc + (r.durationSeconds || 0),
      0,
    );
    const totalBytes = recordings.reduce(
      (acc, r) => acc + (r.fileSizeBytes || 0),
      0,
    );
    const hours = Math.floor(totalDurationSecs / 3600);
    const minutes = Math.floor((totalDurationSecs % 3600) / 60);
    const durationLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return {
      count,
      durationLabel,
      storageLabel: formatFileSize(totalBytes),
    };
  }, [recordings]);

  const handleCopyLink = async (rec: RecordingItem) => {
    const url =
      rec.downloadUrl ||
      rec.playUrl ||
      `${window.location.origin}/recordings/${rec.id}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(rec.id);
      onToast(`Recording link copied to clipboard.`);
      window.setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleCopyEmbedCode = async (rec: RecordingItem) => {
    const url =
      rec.playUrl ||
      rec.downloadUrl ||
      `${window.location.origin}/recordings/${rec.id}`;
    const snippet = `<iframe src="${url}" width="640" height="360" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    const ok = await copyToClipboard(snippet);
    if (ok) {
      onToast(`Embed iframe snippet copied!`);
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

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleJumpTime = (deltaSeconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(
        0,
        videoRef.current.currentTime + deltaSeconds,
      );
    }
  };

  const handlePictureInPicture = async () => {
    if (videoRef.current && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await videoRef.current.requestPictureInPicture();
        }
      } catch {
        onToast('Picture-in-Picture not supported in this window.');
      }
    }
  };

  const filtered = useMemo(() => {
    const result = recordings.filter((r) => {
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

    return result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return (
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          );
        case 'oldest':
          return (
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
          );
        case 'duration':
          return (b.durationSeconds || 0) - (a.durationSeconds || 0);
        case 'size':
          return (b.fileSizeBytes || 0) - (a.fileSizeBytes || 0);
        case 'title':
          return a.roomTitle.localeCompare(b.roomTitle);
      }
    });
  }, [recordings, statusFilter, layoutFilter, searchQuery, sortBy]);

  return (
    <div className="recordings-page" data-testid="recordings-page">
      {/* Header section */}
      <div className="head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow">Studio Media Vault</span>
          <h2>Meeting Recordings</h2>
          <p>
            Stream, download, organize, and inspect full composite and ISO stem
            meeting recordings.
          </p>
        </div>
      </div>

      {/* Vault Overview Stats Cards */}
      <div className="hub-stats-row">
        <div className="hub-stat-card">
          <div className="hub-stat-icon">
            <VideoIcon size={20} />
          </div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">{stats.count}</span>
            <span className="hub-stat-label">Total Recordings</span>
          </div>
        </div>

        <div className="hub-stat-card">
          <div className="hub-stat-icon">
            <ClockIcon size={20} />
          </div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">{stats.durationLabel}</span>
            <span className="hub-stat-label">Total Captured Time</span>
          </div>
        </div>

        <div className="hub-stat-card">
          <div className="hub-stat-icon">
            <HardDriveIcon size={20} />
          </div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">{stats.storageLabel}</span>
            <span className="hub-stat-label">Cloud Storage Used</span>
          </div>
        </div>

        <div className="hub-stat-card">
          <div className="hub-stat-icon">
            <LockIcon size={20} />
          </div>
          <div className="hub-stat-content">
            <span className="hub-stat-value">30-Day Policy</span>
            <span className="hub-stat-label">Auto-Purge Retention</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="recordings-filter-bar">
        <div className="recordings-search-wrap">
          <input
            type="search"
            placeholder="Search recordings by meeting title or room code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            aria-label="Search recordings"
            data-testid="search-recordings-input"
          />
        </div>

        <div className="recordings-filter-group">
          <label className="recordings-select-label">
            <span>Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort recordings"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="duration">Longest duration</option>
              <option value="size">Largest file size</option>
              <option value="title">Alphabetical (A-Z)</option>
            </select>
          </label>

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

          {/* View Mode Switcher */}
          <div className="view-toggle-group">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid card view"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <LayoutGridIcon size={14} /> Grid
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table list view"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ListIcon size={14} /> Table
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Loading, Empty, or Data */}
      {loading ? (
        <div className="recordings-loading">
          <div className="spinner" />
          <p>Loading your recordings vault...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="recordings-empty" data-testid="recordings-empty">
          <div className="empty-icon-bubble">
            <RecIcon />
          </div>
          <h3>No recordings found</h3>
          <p>
            {searchQuery || statusFilter !== 'all' || layoutFilter !== 'all'
              ? 'No recordings match your current filters. Try resetting your search parameters.'
              : 'You have not recorded any meetings yet. Start a call and click "Record" to archive your sessions.'}
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
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
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
                  <PlayIcon
                    size={22}
                    fill="currentColor"
                    style={{ marginLeft: 2 }}
                  />
                </div>
                <div className="thumbnail-badges">
                  <span className="rec-badge duration-badge">
                    {formatRecordingDuration(rec.durationSeconds)}
                  </span>
                  <span className="rec-badge layout-badge">
                    {rec.layout === 'speaker' ? 'Speaker' : 'Grid'}
                  </span>
                  {rec.isoTracks ? (
                    <span
                      className="rec-badge iso-badge"
                      title="Per-participant ISO stems recorded"
                    >
                      ISO Stems
                    </span>
                  ) : null}
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
                  {rec.expiresAt ? (
                    <div
                      className="meta-expiry"
                      title={
                        rec.retentionDays
                          ? `Retention: ${rec.retentionDays} days`
                          : 'Retention policy active'
                      }
                    >
                      <span
                        className="expiry-tag"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ClockIcon size={12} />{' '}
                        {formatExpiryCountdown(rec.expiresAt)}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Card Actions */}
                <div className="recording-card-actions">
                  <button
                    type="button"
                    className="btn btn-sm primary"
                    onClick={() => setPlayingRecording(rec)}
                    data-testid={`play-rec-${rec.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <PlayIcon size={13} fill="currentColor" /> Play
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
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <DownloadIcon size={13} /> Download
                    </a>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setSharingRecording(rec)}
                    title="Share recording & embed code"
                  >
                    Share
                  </button>

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
                    <Trash2Icon size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="recordings-table-wrap">
          <table
            className="recordings-table"
            aria-label="Recordings data table"
          >
            <thead>
              <tr>
                <th>Meeting Title &amp; Room</th>
                <th>Recorded Date</th>
                <th>Duration</th>
                <th>Size</th>
                <th>Layout</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => (
                <tr key={rec.id}>
                  <td>
                    <div>
                      <strong>{rec.roomTitle}</strong>
                      <div style={{ marginTop: 2 }}>
                        <code className="note-room-pill">{rec.roomCode}</code>
                        {rec.isoTracks && (
                          <span
                            className="badge"
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              background: 'var(--soft)',
                            }}
                          >
                            ISO Stems
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{formatRecordingDate(rec.startedAt)}</div>
                    {rec.expiresAt && (
                      <small
                        style={{
                          color: '#f59e0b',
                          fontSize: 11,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ClockIcon size={11} />{' '}
                        {formatExpiryCountdown(rec.expiresAt)}
                      </small>
                    )}
                  </td>
                  <td>
                    <code>{formatRecordingDuration(rec.durationSeconds)}</code>
                  </td>
                  <td>{formatFileSize(rec.fileSizeBytes)}</td>
                  <td>
                    <span
                      className="badge"
                      style={{ textTransform: 'capitalize' }}
                    >
                      {rec.layout}
                    </span>
                  </td>
                  <td>
                    <span className={`rec-status-tag ${rec.status}`}>
                      {rec.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-sm primary"
                        onClick={() => setPlayingRecording(rec)}
                        title="Stream video"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <PlayIcon size={13} fill="currentColor" /> Play
                      </button>
                      {rec.downloadUrl && (
                        <a
                          href={rec.downloadUrl}
                          download={`${rec.roomCode}.mp4`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          title="Download MP4"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          <DownloadIcon size={13} />
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setSharingRecording(rec)}
                        title="Share"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm danger-outline-btn btn-icon"
                        onClick={() => setDeletingRecording(rec)}
                        title="Delete"
                      >
                        <Trash2Icon size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Enhanced Studio Theater Video Player Modal */}
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
            style={{ maxWidth: 880 }}
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
                    ? 'Speaker view'
                    : 'Grid gallery'}
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

            {/* Video Canvas Container */}
            <div className="recording-video-wrapper">
              <video
                ref={videoRef}
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

            {/* Theater Advanced Controls Bar */}
            <div className="player-theater-controls">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--muted)',
                    marginRight: 4,
                  }}
                >
                  Speed:
                </span>
                {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={`player-speed-pill ${playbackSpeed === speed ? 'active' : ''}`}
                    onClick={() => handleSpeedChange(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleJumpTime(-10)}
                  title="Rewind 10 seconds"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RotateCcwIcon size={13} /> 10s
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleJumpTime(10)}
                  title="Forward 10 seconds"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  10s <RotateCwIcon size={13} />
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handlePictureInPicture()}
                  title="Picture in Picture Mode"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <PictureInPicture2Icon size={13} /> PiP
                </button>
              </div>
            </div>

            {/* Player Footer Actions & Info */}
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
                {playingRecording.expiresAt && (
                  <span
                    style={{
                      marginLeft: 12,
                      color: '#f59e0b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <ClockIcon size={12} /> Expires in{' '}
                    {formatExpiryCountdown(playingRecording.expiresAt)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSharingRecording(playingRecording)}
                >
                  Share &amp; Embed
                </button>
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

      {/* Share & Embed Modal Dialog */}
      {sharingRecording && (
        <div
          className="shortcuts-modal-backdrop"
          onClick={() => setSharingRecording(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="shortcuts-modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-modal-head">
              <h3>Share Recording: {sharingRecording.roomTitle}</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setSharingRecording(null)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                margin: '16px 0',
              }}
            >
              <label className="form-field">
                <span>Direct Shareable Link</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={
                      sharingRecording.downloadUrl ||
                      sharingRecording.playUrl ||
                      `${window.location.origin}/recordings/${sharingRecording.id}`
                    }
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void handleCopyLink(sharingRecording)}
                  >
                    Copy Link
                  </button>
                </div>
              </label>

              <label className="form-field">
                <span>Embed Code Snippet</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={`<iframe src="${sharingRecording.playUrl || sharingRecording.downloadUrl}" width="640" height="360" allowfullscreen></iframe>`}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleCopyEmbedCode(sharingRecording)}
                  >
                    Copy Embed
                  </button>
                </div>
              </label>
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => setSharingRecording(null)}
              >
                Done
              </button>
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
