import React, { useMemo, useState } from 'react';
import { Calendar, Clock, CheckCircle2, ArrowLeft, Video } from 'lucide-react';
import {
  createScheduledMeeting,
  downloadIcsFile,
  type ScheduledMeetingItem,
} from '../lib/meetingsStore';
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

function buildUpcomingSlots(): TimeSlotOption[] {
  const slots: TimeSlotOption[] = [];
  const hours = [9, 11, 14, 16];
  const now = new Date();
  let dayOffset = 1;
  while (slots.length < 8 && dayOffset <= 7) {
    const d = new Date(now);
    d.setDate(now.getDate() + dayOffset);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      for (const h of hours) {
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

export function BookingPageView({
  handle,
  onEnterRoom,
  onNavigateHome,
  onToast,
}: BookingPageViewProps) {
  const slots = useMemo(() => buildUpcomingSlots(), []);
  const [selectedSlot, setSelectedSlot] = useState<string>(
    () => slots[0]?.iso ?? new Date(Date.now() + 86400000).toISOString(),
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
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
      description: `Booked via free booking page (#book/${handle}) by ${guestName.trim()} (${guestEmail.trim()}).`,
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
    >
      <div
        className="wrap"
        style={{ maxWidth: 680, margin: '40px auto', padding: '0 16px' }}
      >
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
          style={{ padding: 24, borderRadius: 16 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span className="eyebrow">Booking Page · @{handle}</span>
            <span
              className="badge"
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 12,
                background: 'rgba(16, 185, 129, 0.14)',
              }}
            >
              Free · No payment required
            </span>
          </div>

          {confirmed ? (
            <div data-testid="booking-confirmed-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <CheckCircle2 size={22} />
                <h1 style={{ margin: 0, fontSize: '1.3rem' }}>
                  Booking Confirmed
                </h1>
              </div>
              <p style={{ opacity: 0.85, marginTop: 4 }}>
                <strong>{confirmed.title}</strong> · Room{' '}
                <code>{confirmed.roomCode}</code>
              </p>
              <p style={{ opacity: 0.75, fontSize: 13 }}>
                {new Date(confirmed.startsAt).toLocaleString()} (
                {confirmed.durationMinutes} min)
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
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
            <form onSubmit={handleBook} className="profile-form">
              <h1 style={{ margin: '0 0 6px', fontSize: '1.4rem' }}>
                Book a free meeting with @{handle}
              </h1>
              <p style={{ margin: '0 0 16px', opacity: 0.75, fontSize: 14 }}>
                Pick an available time slot. Paid booking tiers are deferred —
                all bookings are free.
              </p>

              <div className="field">
                <label>Duration</label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                </select>
              </div>

              <div className="field">
                <label>Available slots</label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(145px, 1fr))',
                    gap: 8,
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
                          padding: '8px 10px',
                          fontSize: 12,
                        }}
                      >
                        <span style={{ opacity: 0.8 }}>{slot.dayLabel}</span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <Clock size={12} /> {slot.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-row-2col">
                <div className="field">
                  <label htmlFor="book-name">Your name</label>
                  <input
                    id="book-name"
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Ada Lovelace"
                  />
                </div>
                <div className="field">
                  <label htmlFor="book-email">Your email</label>
                  <input
                    id="book-email"
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="ada@example.com"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="book-topic">Topic (optional)</label>
                <input
                  id="book-topic"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Product intro or architecture sync"
                  maxLength={120}
                />
              </div>

              <div className="profile-form-footer">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={booking}
                  data-testid="booking-submit-btn"
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
