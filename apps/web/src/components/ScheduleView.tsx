import React, { useState } from 'react';
import {
  createScheduledMeeting,
  deleteScheduledMeeting,
  downloadIcsFile,
  formatRecurrenceLabel,
  type RecurrenceRule,
  type ScheduledMeetingItem,
} from '../lib/meetingsStore';
import {
  copyToClipboard,
  personalRoomCodeForUser,
  type AuthUser,
} from '../types';
import { CalIcon, CheckIcon, LnkIcon, PlusIcon, VidIcon } from './Icons';
import { Repeat as RepeatIcon, Lock as LockIcon } from 'lucide-react';

interface ScheduleViewProps {
  user: AuthUser | null;
  scheduled: ScheduledMeetingItem[];
  onRefreshData: () => void;
  onEnterRoom: (code: string) => void;
  onToast: (msg: string) => void;
}

function defaultTomorrowDateTimeLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleView({
  user,
  scheduled,
  onRefreshData,
  onEnterRoom,
  onToast,
}: ScheduleViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() =>
    defaultTomorrowDateTimeLocal(),
  );
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [rrule, setRrule] = useState<RecurrenceRule>('');
  const [usePersonalRoom, setUsePersonalRoom] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [inviteesRaw, setInviteesRaw] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const personalCode = personalRoomCodeForUser(user?.id ?? '');

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      onToast('Please enter a meeting title.');
      return;
    }

    setCreating(true);
    const invitees = inviteesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const created = await createScheduledMeeting({
      ownerId: user.id,
      title: trimmedTitle,
      description: description.trim(),
      ...(usePersonalRoom ? { roomCode: personalCode } : {}),
      startsAt,
      durationMinutes,
      rrule,
      ...(passcode.trim() ? { passcode: passcode.trim() } : {}),
      invitees,
    });
    setCreating(false);

    setTitle('');
    setDescription('');
    setPasscode('');
    setInviteesRaw('');
    setRrule('');
    onRefreshData();
    onToast(`Scheduled "${created.title}" (${created.roomCode}).`);
  };

  const handleCopyInvite = async (item: ScheduledMeetingItem) => {
    const url = `${window.location.origin}/m/${item.roomCode}`;
    const when = new Date(item.startsAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const lines = [
      `${item.title} — MeetIT Video Call`,
      `When: ${when} (${item.durationMinutes} min)`,
      item.rrule ? `Recurrence: ${formatRecurrenceLabel(item.rrule)}` : '',
      `Join link: ${url}`,
      item.passcode ? `Passcode: ${item.passcode}` : '',
    ].filter(Boolean);

    const ok = await copyToClipboard(lines.join('\n'));
    if (ok) {
      setCopiedId(item.id);
      onToast('Meeting invite copied to clipboard.');
      window.setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = (id: string, itemTitle: string) => {
    deleteScheduledMeeting(id);
    onRefreshData();
    onToast(`Cancelled "${itemTitle}".`);
  };

  return (
    <section
      className="schedule-page"
      aria-labelledby="schedule-page-heading"
      data-testid="schedule-view"
    >
      <div className="page-subhead">
        <div>
          <span className="eyebrow-badge">Calendar &amp; Recurrence</span>
          <h2 id="schedule-page-heading">Schedule Meetings</h2>
          <p>
            Plan one-time or recurring (`RRULE`) meetings, set lobby agendas and
            passcodes, and export standards-compliant `.ics` calendar invites.
          </p>
        </div>
      </div>

      <div className="schedule-grid">
        {/* Left: Schedule New Meeting Form */}
        <form
          className="profile-section-card profile-edit-form"
          onSubmit={(e) => void handleScheduleSubmit(e)}
          data-testid="schedule-meeting-form"
        >
          <h3>
            <CalIcon style={{ width: 18, height: 18, marginRight: 8 }} />
            New scheduled meeting
          </h3>

          <div className="field">
            <label htmlFor="sched-title">Meeting title *</label>
            <input
              id="sched-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Product Sync"
              maxLength={80}
              required
            />
          </div>

          <div className="form-row-2col">
            <div className="field">
              <label htmlFor="sched-start">Start date &amp; time *</label>
              <input
                id="sched-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="sched-duration">Duration</label>
              <select
                id="sched-duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes (1 hour)</option>
                <option value={90}>90 minutes (1.5 hours)</option>
              </select>
            </div>
          </div>

          <div className="form-row-2col">
            <div className="field">
              <label htmlFor="sched-rrule">Recurrence (RRULE)</label>
              <select
                id="sched-rrule"
                value={rrule}
                onChange={(e) => setRrule(e.target.value as RecurrenceRule)}
              >
                <option value="">Does not repeat (One-time)</option>
                <option value="FREQ=DAILY">Daily (RRULE:FREQ=DAILY)</option>
                <option value="FREQ=WEEKLY">Weekly (RRULE:FREQ=WEEKLY)</option>
                <option value="FREQ=WEEKLY;INTERVAL=2">
                  Every 2 weeks (INTERVAL=2)
                </option>
                <option value="FREQ=MONTHLY">
                  Monthly (RRULE:FREQ=MONTHLY)
                </option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="sched-passcode">Room passcode (optional)</label>
              <input
                id="sched-passcode"
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Optional passcode"
                maxLength={32}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="sched-desc">
              Lobby description / agenda (shown before joining)
            </label>
            <textarea
              id="sched-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Share topics, links, or preparation notes displayed in the lobby…"
              maxLength={300}
            />
          </div>

          <div className="field">
            <label htmlFor="sched-invitees">
              Invitees (comma-separated emails)
            </label>
            <input
              id="sched-invitees"
              type="text"
              value={inviteesRaw}
              onChange={(e) => setInviteesRaw(e.target.value)}
              placeholder="mei@example.com, alex@example.com"
            />
          </div>

          <div className="sw" style={{ paddingTop: 6 }}>
            <div>
              Use my permanent personal room ({personalCode})
              <small>
                Otherwise generates a dedicated room code for this series
              </small>
            </div>
            <button
              type="button"
              aria-pressed={usePersonalRoom}
              aria-label="Toggle use personal room"
              onClick={() => setUsePersonalRoom((prev) => !prev)}
            />
          </div>

          <div className="profile-form-footer">
            <button
              type="submit"
              className="btn primary"
              disabled={creating}
              data-testid="schedule-submit-btn"
            >
              <PlusIcon />
              <span>{creating ? 'Scheduling…' : 'Schedule meeting'}</span>
            </button>
          </div>
        </form>

        {/* Right: Upcoming Scheduled Meetings List */}
        <div
          className="profile-section-card"
          data-testid="upcoming-scheduled-list"
        >
          <div className="profile-section-head">
            <h3>Upcoming scheduled ({scheduled.length})</h3>
          </div>

          {scheduled.length === 0 ? (
            <div className="empty-state-box">
              <p>
                No scheduled meetings yet. Use the form on the left to schedule
                a one-time or recurring session and download its `.ics` calendar
                invite.
              </p>
            </div>
          ) : (
            <div className="scheduled-cards-list">
              {scheduled.map((item) => {
                const startObj = new Date(item.startsAt);
                const dateFormatted = startObj.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });
                const timeFormatted = startObj.toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={item.id}
                    className="scheduled-item-card"
                    data-testid="scheduled-meeting-card"
                  >
                    <div className="scheduled-item-top">
                      <div>
                        <h4>{item.title}</h4>
                        <small className="scheduled-time-sub">
                          {dateFormatted} · {timeFormatted} (
                          {item.durationMinutes} min) ·{' '}
                          <code>{item.roomCode}</code>
                        </small>
                      </div>

                      <div className="scheduled-badges">
                        {item.rrule && (
                          <span
                            className="chip"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <RepeatIcon size={12} />{' '}
                            {formatRecurrenceLabel(item.rrule)}
                          </span>
                        )}
                        {item.passcode && (
                          <span
                            className="chip"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <LockIcon size={12} /> Passcode
                          </span>
                        )}
                      </div>
                    </div>

                    {item.description && (
                      <p className="scheduled-desc">{item.description}</p>
                    )}

                    {item.invitees.length > 0 && (
                      <small style={{ color: 'var(--muted)' }}>
                        Invitees: {item.invitees.join(', ')}
                      </small>
                    )}

                    <div className="scheduled-item-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          downloadIcsFile(item);
                          onToast(`Downloaded .ics for "${item.title}".`);
                        }}
                        data-testid="download-ics-btn"
                      >
                        <CalIcon />
                        <span>Download .ics</span>
                      </button>

                      <button
                        type="button"
                        className="btn"
                        onClick={() => void handleCopyInvite(item)}
                      >
                        {copiedId === item.id ? <CheckIcon /> : <LnkIcon />}
                        <span>
                          {copiedId === item.id ? 'Copied' : 'Copy invite'}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => onEnterRoom(item.roomCode)}
                      >
                        <VidIcon />
                        <span>Join</span>
                      </button>

                      <button
                        type="button"
                        className="btn danger-outline"
                        onClick={() => handleDelete(item.id, item.title)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
