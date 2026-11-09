import React, { useState } from 'react';
import {
  ensurePersonalRoomForUser,
  saveOrUpdateRoom,
  type SavedRoom,
  type MeetingHistoryItem,
} from '../lib/meetingsStore';
import { copyToClipboard, type AuthUser } from '../types';
import { LnkIcon, CheckIcon, VidIcon, PlusIcon } from './Icons';
import { Lock as LockIcon } from 'lucide-react';

interface MeetingsViewProps {
  user: AuthUser | null;
  rooms: SavedRoom[];
  history: MeetingHistoryItem[];
  onRefreshData: () => void;
  onEnterRoom: (code: string) => void;
  onToast: (msg: string) => void;
}

export function MeetingsView({
  user,
  rooms,
  history,
  onRefreshData,
  onEnterRoom,
  onToast,
}: MeetingsViewProps) {
  const personalRoom = user
    ? rooms.find((r) => r.kind === 'personal') ||
      ensurePersonalRoomForUser({
        id: user.id,
        displayName: user.displayName,
      })
    : null;

  const [editingPersonal, setEditingPersonal] = useState(false);
  const [personalTitle, setPersonalTitle] = useState(
    personalRoom?.title ?? 'Personal Meeting Room',
  );
  const [personalDesc, setPersonalDesc] = useState(
    personalRoom?.description ?? '',
  );
  const [personalPasscode, setPersonalPasscode] = useState(
    personalRoom?.passcode ?? '',
  );

  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyLink = async (code: string) => {
    const url = `${window.location.origin}/m/${code}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedCode(code);
      onToast(`Room link ${code} copied.`);
      window.setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const handleSavePersonalRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !personalRoom) return;
    setSavingRoom(true);
    await saveOrUpdateRoom({
      ownerId: user.id,
      code: personalRoom.code,
      kind: 'personal',
      title: personalTitle,
      description: personalDesc,
      passcode: personalPasscode,
    });
    setSavingRoom(false);
    setEditingPersonal(false);
    onRefreshData();
    onToast('Personal room settings saved.');
  };

  const handleCreateCustomRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newTitle.trim()) {
      onToast('Please enter a room title.');
      return;
    }
    setSavingRoom(true);
    const created = await saveOrUpdateRoom({
      ownerId: user.id,
      kind: 'instant',
      title: newTitle,
      description: newDesc,
      passcode: newPasscode,
    });
    setSavingRoom(false);
    setNewTitle('');
    setNewDesc('');
    setNewPasscode('');
    setShowNewRoomModal(false);
    onRefreshData();
    onToast(`Room "${created.title}" (${created.code}) created.`);
  };

  const customRooms = rooms.filter((r) => r.kind !== 'personal');

  const filteredHistory = history.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.roomTitle.toLowerCase().includes(q) ||
      item.roomCode.toLowerCase().includes(q) ||
      item.attendees.some((a) => a.displayName.toLowerCase().includes(q))
    );
  });

  return (
    <section
      className="meetings-page"
      aria-labelledby="meetings-page-heading"
      data-testid="meetings-view"
    >
      <div className="page-subhead">
        <div>
          <span className="eyebrow-badge">Rooms &amp; Call Log</span>
          <h2 id="meetings-page-heading">Meetings &amp; History</h2>
          <p>
            Manage your permanent personal room, custom rooms with lobby
            descriptions and passcodes, and inspect past meeting sessions.
          </p>
        </div>

        <div className="page-subhead-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowNewRoomModal((prev) => !prev)}
          >
            <PlusIcon />
            <span>
              {showNewRoomModal ? 'Close form' : 'Create custom room'}
            </span>
          </button>
        </div>
      </div>

      {/* Create Custom Room Form */}
      {showNewRoomModal && (
        <form
          className="profile-section-card profile-edit-form"
          onSubmit={(e) => void handleCreateCustomRoom(e)}
          data-testid="create-custom-room-form"
        >
          <h3>Create a dedicated meeting room</h3>
          <p className="profile-card-sub">
            The room title and description are displayed to guests in the
            pre-join lobby. Add an optional passcode for restricted sessions.
          </p>

          <div className="form-row-2col">
            <div className="field">
              <label htmlFor="new-room-title">Room title *</label>
              <input
                id="new-room-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Design Architecture Review"
                maxLength={80}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="new-room-passcode">
                Room passcode (optional)
              </label>
              <input
                id="new-room-passcode"
                type="text"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder="Leave blank for open link access"
                maxLength={32}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="new-room-desc">
              Lobby description / agenda (optional)
            </label>
            <textarea
              id="new-room-desc"
              rows={2}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Shown in the pre-call lobby so participants know the agenda…"
              maxLength={280}
            />
          </div>

          <div className="profile-form-footer">
            <button
              type="button"
              className="btn"
              onClick={() => setShowNewRoomModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={savingRoom}>
              <CheckIcon />
              <span>{savingRoom ? 'Creating…' : 'Save & create room'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 1. Permanent Personal Room Card */}
      {personalRoom && (
        <div
          className="profile-section-card"
          data-testid="personal-room-manage-card"
        >
          <div className="profile-section-head">
            <div>
              <span className="chip" style={{ marginBottom: 6 }}>
                Permanent Personal Room · {personalRoom.code}
              </span>
              <h3>{personalRoom.title}</h3>
            </div>
            <div className="profile-room-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPersonalTitle(personalRoom.title);
                  setPersonalDesc(personalRoom.description);
                  setPersonalPasscode(personalRoom.passcode ?? '');
                  setEditingPersonal((prev) => !prev);
                }}
              >
                {editingPersonal ? 'Cancel' : 'Configure lobby & passcode'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleCopyLink(personalRoom.code)}
              >
                {copiedCode === personalRoom.code ? <CheckIcon /> : <LnkIcon />}
                <span>
                  {copiedCode === personalRoom.code ? 'Copied' : 'Copy link'}
                </span>
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => onEnterRoom(personalRoom.code)}
              >
                <VidIcon />
                <span>Start room</span>
              </button>
            </div>
          </div>

          <p
            className="profile-card-sub"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            <span>
              {personalRoom.description ||
                'Your permanent room link that never expires.'}
            </span>
            {personalRoom.passcode ? (
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                · <LockIcon size={12} /> Passcode protected
              </span>
            ) : null}
          </p>

          {editingPersonal && (
            <form
              className="profile-edit-form"
              style={{
                marginTop: 12,
                paddingTop: 14,
                borderTop: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
              onSubmit={(e) => void handleSavePersonalRoom(e)}
            >
              <div className="form-row-2col">
                <div className="field">
                  <label htmlFor="personal-room-title">Lobby title</label>
                  <input
                    id="personal-room-title"
                    type="text"
                    value={personalTitle}
                    onChange={(e) => setPersonalTitle(e.target.value)}
                    maxLength={80}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="personal-room-passcode">
                    Room passcode (optional)
                  </label>
                  <input
                    id="personal-room-passcode"
                    type="text"
                    value={personalPasscode}
                    onChange={(e) => setPersonalPasscode(e.target.value)}
                    placeholder="No passcode required"
                    maxLength={32}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="personal-room-desc">Lobby description</label>
                <input
                  id="personal-room-desc"
                  type="text"
                  value={personalDesc}
                  onChange={(e) => setPersonalDesc(e.target.value)}
                  placeholder="Welcome message or office hours shown in lobby"
                  maxLength={240}
                />
              </div>

              <div className="profile-form-footer">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={savingRoom}
                >
                  <CheckIcon />
                  <span>Save personal room</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 2. Saved Custom Rooms (if any) */}
      {customRooms.length > 0 && (
        <div className="profile-section-card">
          <h3>Configured rooms ({customRooms.length})</h3>
          <div className="meetings-rooms-list">
            {customRooms.slice(0, 8).map((r) => (
              <div key={r.id} className="row">
                <time>
                  <code>{r.code}</code>
                </time>
                <div>
                  <strong>{r.title}</strong>
                  {r.passcode && (
                    <span
                      className="chip"
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <LockIcon size={11} /> Passcode
                    </span>
                  )}
                  {r.description && <p className="sum">{r.description}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleCopyLink(r.code)}
                  >
                    {copiedCode === r.code ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => onEnterRoom(r.code)}
                  >
                    Join
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Meeting History Log */}
      <div className="profile-section-card" data-testid="meeting-history-card">
        <div className="profile-section-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <h3>Meeting history</h3>
            <p className="profile-card-sub">
              Past calls with date, duration, peak participants, and attendee
              roster.
            </p>
          </div>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by title, code, or attendee…"
            aria-label="Filter meeting history"
            className="history-search-input"
          />
        </div>

        {filteredHistory.length === 0 ? (
          <div className="empty-state-box">
            <p>
              {searchQuery
                ? 'No past meetings match your search.'
                : 'No completed meetings recorded yet. Start or join a room to log your call history automatically.'}
            </p>
          </div>
        ) : (
          <div className="history-list">
            {filteredHistory.map((item) => {
              const dateObj = new Date(item.startedAt);
              const dateStr = dateObj.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const timeStr = dateObj.toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              });

              return (
                <div
                  key={item.id}
                  className="history-item-row"
                  data-testid="history-row"
                >
                  <div className="history-item-main">
                    <div className="history-title-line">
                      <strong>{item.roomTitle}</strong>
                      <code className="room-code-pill">{item.roomCode}</code>
                      <span className="chip">{item.durationMinutes} min</span>
                    </div>

                    <small className="history-meta-line">
                      {dateStr} at {timeStr} · Peak {item.peakParticipants}{' '}
                      {item.peakParticipants === 1
                        ? 'participant'
                        : 'participants'}
                    </small>

                    {item.attendees.length > 0 && (
                      <div className="history-attendees-row">
                        <span className="attendees-label">Attendees:</span>
                        {item.attendees.map((att, idx) => (
                          <span
                            key={`${att.id}-${idx}`}
                            className="attendee-badge"
                          >
                            {att.displayName}
                            {att.role === 'host' ? ' (Host)' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="history-item-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void handleCopyLink(item.roomCode)}
                    >
                      {copiedCode === item.roomCode ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onEnterRoom(item.roomCode)}
                    >
                      Rejoin
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
