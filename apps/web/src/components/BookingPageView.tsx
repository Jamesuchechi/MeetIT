import React, { useMemo, useState } from 'react';
import { Calendar, Clock, CheckCircle2, ArrowLeft, Video } from 'lucide-react';
import {
  createScheduledMeeting,
  downloadIcsFile,
  type ScheduledMeetingItem,
} from '../lib/meetingsStore';
import {
  loadBookingSettings,
  type BookingPageSettings,
} from './BookingStudioView';
import { normalizeRoomCode } from '../types';

export interface BookingPageViewProps {
  handle: string;
  onEnterRoom: (code: string) => void;
  onNavigateHome: () => void;
  onToast: (msg: string) => void;
}

interface TimeSlotOption {
  iso: string;
  label: string;
  dayLabel: string;
}

function buildUpcomingSlots(settings: BookingPageSettings): TimeSlotOption[] {
  const slots: TimeSlotOption[] = [];
  const stepHours = 2;
  const hours: number[] = [];
  for (
    let h = settings.startHour;
    h < settings.endHour && hours.length < 4;
    h += stepHours
  ) {
    hours.push(h);
  }
  if (hours.length === 0) hours.push(9, 11, 14, 16);

  const now = new Date();
  let dayOffset = 1;
  while (slots.length < 8 && dayOffset <= 14) {
    const d = new Date(now);
    d.setDate(now.getDate() + dayOffset);
    if (settings.availableDays.includes(d.getDay())) {
      for (const h of hours) {
        if (slots.length >= 8) break;
        const slot = new Date(d);
        slot.setHours(h, 0, 0, 0);
        slots.push({
          iso: slot.toISOString(),
          dayLabel: slot.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
          label: slot.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
      }
    }
    dayOffset += 1;
  }
  return slots;
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ink)',
};

const inputControlStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 13px',
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
};

export function BookingPageView({
  handle,
  onEnterRoom,
  onNavigateHome,
  onToast,
}: BookingPageViewProps) {
  const settings = useMemo(() => loadBookingSettings(handle), [handle]);
  const slots = useMemo(() => buildUpcomingSlots(settings), [settings]);
  const [selectedSlot, setSelectedSlot] = useState<string>(
    () => slots[0]?.iso ?? new Date(Date.now() + 86400000).toISOString(),
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    () => settings.durations[0] ?? 30,
  );
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [topic, setTopic] = useState('');
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<ScheduledMeetingItem | null>(null);

  const hostRoomCode = useMemo(() => {
    return normalizeRoomCode(handle) ?? undefined;
  }, [handle]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !guestEmail.trim()) {
      onToast('Please enter your name and email.');
      return;
    }
    setBooking(true);
    const created = await createScheduledMeeting({
      ownerId: `booking:${handle}`,
      title: topic.trim()
        ? `${topic.trim()} (${guestName.trim()})`
        : `Meeting with ${guestName.trim()}`,
      description: `Booked via MeetIT booking page (#book/${handle}) by ${guestName.trim()} (${guestEmail.trim()}).`,
      ...(hostRoomCode ? { roomCode: hostRoomCode } : {}),
      startsAt: selectedSlot,
      durationMinutes,
      rrule: '',
      invitees: [guestEmail.trim()],
    });
    setBooking(false);
    setConfirmed(created);
    onToast(`Booked ${created.title}!`);
  };

  return (
    <div
      className="lobby-shell"
      data-view="booking-page"
      data-testid="booking-page-view"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 660 }}>
        <button
          type="button"
          className="btn"
          onClick={onNavigateHome}
          style={{ marginBottom: 16 }}
        >
          <ArrowLeft size={15} />
          <span>Back to MeetIT</span>
        </button>

        <div
          className="profile-section-card"
          style={{
            padding: 28,
            borderRadius: 18,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--muted, #94a3b8)',
              }}
            >
              Booking Page · @{handle}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.14)',
              }}
            >
              Free · Instant Room Link
            </span>
          </div>

          {!settings.enabled ? (
            <div
              data-testid="booking-paused-card"
              style={{ padding: '12px 0' }}
            >
              <h1 style={{ margin: '0 0 8px', fontSize: '1.35rem' }}>
                Bookings are currently paused
              </h1>
              <p style={{ margin: 0, color: 'var(--muted, #94a3b8)' }}>
                @{handle} is not accepting new bookings at the moment. Please
                check back later.
              </p>
            </div>
          ) : confirmed ? (
            <div data-testid="booking-confirmed-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 8,
                  color: '#10b981',
                }}
              >
                <CheckCircle2 size={24} />
                <h1
                  style={{
                    margin: 0,
                    fontSize: '1.35rem',
                    color: 'var(--text, #f8fafc)',
                  }}
                >
                  Booking Confirmed
                </h1>
              </div>
              <p style={{ margin: '6px 0', fontSize: 15 }}>
                <strong>{confirmed.title}</strong> · Room{' '}
                <code>{confirmed.roomCode}</code>
              </p>
              <p
                style={{
                  margin: '4px 0 18px',
                  color: 'var(--muted, #94a3b8)',
                  fontSize: 14,
                }}
              >
                {new Date(confirmed.startsAt).toLocaleString()} (
                {confirmed.durationMinutes} min)
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => downloadIcsFile(confirmed)}
                >
                  <Calendar size={15} />
                  <span>Download .ics invite</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onEnterRoom(confirmed.roomCode)}
                >
                  <Video size={15} />
                  <span>Join room</span>
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleBook}
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
            >
              <div>
                <h1 style={{ margin: '0 0 6px', fontSize: '1.45rem' }}>
                  {settings.headline}
                </h1>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--muted, #94a3b8)',
                    fontSize: 14,
                  }}
                >
                  {settings.welcomeMessage}
                </p>
              </div>

              <label style={fieldLabelStyle}>
                <span>Duration</span>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  style={inputControlStyle}
                >
                  {settings.durations.map((mins) => (
                    <option key={mins} value={mins}>
                      {mins} minutes
                    </option>
                  ))}
                </select>
              </label>

              <div style={fieldLabelStyle}>
                <span>Available slots</span>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(145px, 1fr))',
                    gap: 10,
                  }}
                >
                  {slots.map((slot) => {
                    const active = selectedSlot === slot.iso;
                    return (
                      <button
                        key={slot.iso}
                        type="button"
                        className={active ? 'btn primary' : 'btn'}
                        onClick={() => setSelectedSlot(slot.iso)}
                        style={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          padding: '10px 12px',
                          fontSize: 12,
                          borderRadius: 10,
                        }}
                      >
                        <span style={{ opacity: 0.85 }}>{slot.dayLabel}</span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          <Clock size={12} /> {slot.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <label htmlFor="book-name" style={fieldLabelStyle}>
                  <span>Your name</span>
                  <input
                    id="book-name"
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Ada Lovelace"
                    style={inputControlStyle}
                  />
                </label>
                <label htmlFor="book-email" style={fieldLabelStyle}>
                  <span>Your email</span>
                  <input
                    id="book-email"
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="ada@example.com"
                    style={inputControlStyle}
                  />
                </label>
              </div>

              <label htmlFor="book-topic" style={fieldLabelStyle}>
                <span>Topic (optional)</span>
                <input
                  id="book-topic"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Product intro or architecture sync"
                  maxLength={120}
                  style={inputControlStyle}
                />
              </label>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  paddingTop: 4,
                }}
              >
                <button
                  type="submit"
                  className="btn primary"
                  disabled={booking}
                  data-testid="booking-submit-btn"
                  style={{ padding: '10px 20px', fontSize: 14 }}
                >
                  {booking ? 'Booking…' : 'Book free meeting'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
