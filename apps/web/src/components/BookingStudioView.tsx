import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Video,
} from 'lucide-react';
import {
  downloadIcsFile,
  type ScheduledMeetingItem,
} from '../lib/meetingsStore';
import { copyToClipboard, type AuthUser } from '../types';

export interface BookingPageSettings {
  handle: string;
  enabled: boolean;
  headline: string;
  welcomeMessage: string;
  durations: number[];
  availableDays: number[]; // 0=Sun..6=Sat
  startHour: number;
  endHour: number;
  timezone: string;
}

const BOOKING_SETTINGS_PREFIX = 'meetit_booking_settings_v1:';

export function getDefaultBookingSettings(
  handle: string,
  hostName?: string,
): BookingPageSettings {
  const tz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC';
  return {
    handle,
    enabled: true,
    headline: hostName
      ? `Book a meeting with ${hostName}`
      : `Book a meeting with @${handle}`,
    welcomeMessage:
      'Pick a time slot that works for you. A private MeetIT room link will be generated automatically.',
    durations: [15, 30, 45],
    availableDays: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
    timezone: tz,
  };
}

export function loadBookingSettings(
  handle: string,
  hostName?: string,
): BookingPageSettings {
  const fallback = getDefaultBookingSettings(handle, hostName);
  try {
    const raw = window.localStorage.getItem(
      `${BOOKING_SETTINGS_PREFIX}${handle.toLowerCase()}`,
    );
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BookingPageSettings>;
    return {
      ...fallback,
      ...parsed,
      durations:
        Array.isArray(parsed.durations) && parsed.durations.length > 0
          ? parsed.durations
          : fallback.durations,
      availableDays:
        Array.isArray(parsed.availableDays) && parsed.availableDays.length > 0
          ? parsed.availableDays
          : fallback.availableDays,
    };
  } catch {
    return fallback;
  }
}

export function saveBookingSettings(settings: BookingPageSettings): void {
  try {
    window.localStorage.setItem(
      `${BOOKING_SETTINGS_PREFIX}${settings.handle.toLowerCase()}`,
      JSON.stringify(settings),
    );
  } catch {
    // ignore quota error
  }
}

const DAY_LABELS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export interface BookingStudioViewProps {
  user: AuthUser | null;
  personalRoomCode: string;
  scheduled: ScheduledMeetingItem[];
  onEnterRoom: (code: string) => void;
  onToast: (msg: string) => void;
}

export function BookingStudioView({
  user,
  personalRoomCode,
  scheduled,
  onEnterRoom,
  onToast,
}: BookingStudioViewProps) {
  const [settings, setSettings] = useState<BookingPageSettings>(() =>
    loadBookingSettings(personalRoomCode, user?.displayName),
  );
  const [copiedLink, setCopiedLink] = useState(false);

  const bookingUrl = `${window.location.origin}/#book/${personalRoomCode}`;
  const guestBookings = scheduled.filter((s) =>
    s.description?.includes('#book/'),
  );

  const toggleDuration = (mins: number) => {
    setSettings((prev) => {
      const exists = prev.durations.includes(mins);
      if (exists && prev.durations.length === 1) return prev;
      const next = exists
        ? prev.durations.filter((d) => d !== mins)
        : [...prev.durations, mins].sort((a, b) => a - b);
      return { ...prev, durations: next };
    });
  };

  const toggleDay = (day: number) => {
    setSettings((prev) => {
      const exists = prev.availableDays.includes(day);
      if (exists && prev.availableDays.length === 1) return prev;
      const next = exists
        ? prev.availableDays.filter((d) => d !== day)
        : [...prev.availableDays, day];
      return { ...prev, availableDays: next };
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveBookingSettings(settings);
    onToast('Booking page settings saved.');
  };

  return (
    <div
      data-testid="dashboard-booking-tab"
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      {/* Top Share Banner */}
      <div
        className="profile-section-card"
        style={{
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        <div style={{ minWidth: 240, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              Personal Booking Page
            </h2>
            <span
              style={{
                padding: '2px 9px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: settings.enabled
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
                color: settings.enabled ? '#10b981' : '#ef4444',
              }}
            >
              {settings.enabled ? 'Live · Free' : 'Paused'}
            </span>
          </div>
          <code style={{ fontSize: 13, opacity: 0.85, wordBreak: 'break-all' }}>
            {bookingUrl}
          </code>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void copyToClipboard(bookingUrl).then(() => {
                setCopiedLink(true);
                onToast('Booking page link copied!');
                setTimeout(() => setCopiedLink(false), 2000);
              });
            }}
          >
            {copiedLink ? <Check size={15} /> : <Copy size={15} />}
            <span>{copiedLink ? 'Copied' : 'Copy link'}</span>
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              saveBookingSettings(settings);
              window.location.hash = `#book/${personalRoomCode}`;
            }}
          >
            <ExternalLink size={15} />
            <span>Preview booking page</span>
          </button>
        </div>
      </div>

      {/* Main 2-column grid */}
      <div className="profile-grid">
        {/* Left: Availability & Customization */}
        <form
          onSubmit={handleSave}
          className="profile-section-card profile-form"
          style={{ padding: 22 }}
        >
          <div className="sec-head" style={{ marginBottom: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>Availability &amp; Details</h3>
              <small style={{ opacity: 0.75 }}>
                Customize how guests book time with you
              </small>
            </div>
          </div>

          <div className="sw" style={{ paddingBottom: 8 }}>
            <div>
              Accept new bookings
              <small>Pause anytime without deleting your link</small>
            </div>
            <button
              type="button"
              aria-pressed={settings.enabled}
              aria-label="Toggle accept new bookings"
              onClick={() =>
                setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="booking-headline">Page headline</label>
            <input
              id="booking-headline"
              type="text"
              value={settings.headline}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, headline: e.target.value }))
              }
              maxLength={80}
            />
          </div>

          <div className="field">
            <label htmlFor="booking-welcome">Welcome message</label>
            <textarea
              id="booking-welcome"
              rows={2}
              value={settings.welcomeMessage}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  welcomeMessage: e.target.value,
                }))
              }
              maxLength={240}
            />
          </div>

          <div className="field">
            <label>Meeting durations</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[15, 30, 45, 60].map((mins) => {
                const active = settings.durations.includes(mins);
                return (
                  <button
                    key={mins}
                    type="button"
                    className={active ? 'btn primary' : 'btn'}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => toggleDuration(mins)}
                  >
                    <Clock size={13} />
                    <span>{mins} min</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Available days</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAY_LABELS.map(({ day, label }) => {
                const active = settings.availableDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={active ? 'btn primary' : 'btn'}
                    style={{ padding: '6px 10px', fontSize: 12 }}
                    onClick={() => toggleDay(day)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-row-2col">
            <div className="field">
              <label htmlFor="booking-start-hr">Start hour</label>
              <select
                id="booking-start-hr"
                value={settings.startHour}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    startHour: Number(e.target.value),
                  }))
                }
              >
                {[7, 8, 9, 10, 11, 12].map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="booking-end-hr">End hour</label>
              <select
                id="booking-end-hr"
                value={settings.endHour}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    endHour: Number(e.target.value),
                  }))
                }
              >
                {[14, 15, 16, 17, 18, 19, 20].map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              paddingTop: 6,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                opacity: 0.75,
              }}
            >
              <Globe size={13} /> {settings.timezone}
            </span>
            <button type="submit" className="btn primary">
              Save booking settings
            </button>
          </div>
        </form>

        {/* Right: Upcoming Bookings */}
        <div className="profile-section-card" style={{ padding: 22 }}>
          <div className="sec-head" style={{ marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>
                Guest Bookings ({guestBookings.length})
              </h3>
              <small style={{ opacity: 0.75 }}>
                Meetings booked through your public link
              </small>
            </div>
          </div>

          {guestBookings.length === 0 ? (
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                border: '1px dashed var(--border)',
                textAlign: 'center',
                opacity: 0.8,
                fontSize: 13,
              }}
            >
              <Calendar size={24} style={{ marginBottom: 8, opacity: 0.6 }} />
              <div>No guest bookings yet.</div>
              <div style={{ marginTop: 4, opacity: 0.75 }}>
                Share your booking link or click Preview booking page to test
                the guest flow.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {guestBookings.map((b) => (
                <div
                  key={b.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong>{b.title}</strong>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {new Date(b.startsAt).toLocaleString()} ·{' '}
                      {b.durationMinutes} min
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={() => downloadIcsFile(b)}
                    >
                      .ics
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => onEnterRoom(b.roomCode)}
                    >
                      <Video size={13} />
                      <span>Join</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
