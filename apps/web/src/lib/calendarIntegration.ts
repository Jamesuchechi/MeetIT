/**
 * Calendar Integration Service (Phase 9)
 * - Google Calendar & Outlook direct deep links
 * - Universal RFC 5545 iCalendar (.ics) generation
 * - Two-way sync state management
 */

export interface CalendarMeetingEvent {
  title: string;
  roomCode: string;
  roomUrl: string;
  startTime: Date | number;
  durationMinutes: number;
  description?: string | undefined;
  hostName?: string | undefined;
  attendees?: string[] | undefined;
}

const CALENDAR_SYNC_STORAGE_KEY = 'meetit_calendar_syncs_v1';

export function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Generates RFC 5545 standard .ics calendar string.
 */
export function generateIcsFile(event: CalendarMeetingEvent): string {
  const start = new Date(event.startTime);
  const end = new Date(start.getTime() + event.durationMinutes * 60000);
  const now = new Date();
  const uid = `meetit-${event.roomCode}-${start.getTime()}@meetit.app`;

  const descriptionLines = [
    event.description || 'MeetIT Video Conference',
    '',
    `Join Meeting: ${event.roomUrl}`,
    `Room Code: ${event.roomCode}`,
    event.hostName ? `Host: ${event.hostName}` : '',
  ]
    .filter(Boolean)
    .join('\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MeetIT//MeetIT Video Conferencing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDateTime(now)}`,
    `DTSTART:${formatIcsDateTime(start)}`,
    `DTEND:${formatIcsDateTime(end)}`,
    `SUMMARY:${event.title.replace(/[,;]/g, ' ')}`,
    `DESCRIPTION:${descriptionLines}`,
    `LOCATION:${event.roomUrl}`,
    `URL:${event.roomUrl}`,
    `X-MEETIT-ROOM-CODE:${event.roomCode}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder: MeetIT meeting starting in 10 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/**
 * Builds direct Google Calendar "Add Event" URL template.
 */
export function buildGoogleCalendarUri(event: CalendarMeetingEvent): string {
  const start = new Date(event.startTime);
  const end = new Date(start.getTime() + event.durationMinutes * 60000);

  const formatUtc = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const details = `${event.description || 'MeetIT Meeting'}\n\nJoin Video Call: ${event.roomUrl}\nRoom Code: ${event.roomCode}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatUtc(start)}/${formatUtc(end)}`,
    details,
    location: event.roomUrl,
  });

  if (event.attendees && event.attendees.length > 0) {
    params.set('add', event.attendees.join(','));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds direct Outlook Web / Live Calendar deep link.
 */
export function buildOutlookCalendarUri(
  event: CalendarMeetingEvent,
  isOffice365 = false,
): string {
  const start = new Date(event.startTime);
  const end = new Date(start.getTime() + event.durationMinutes * 60000);

  const base = isOffice365
    ? 'https://outlook.office.com/calendar/0/deeplink/compose'
    : 'https://outlook.live.com/calendar/0/deeplink/compose';

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: `${event.description || ''}\n\nJoin Call: ${event.roomUrl}`,
    location: event.roomUrl,
  });

  return `${base}?${params.toString()}`;
}

/**
 * Tracks two-way calendar sync state.
 */
export class CalendarSyncStore {
  public static getSyncRecords(): Array<{
    roomCode: string;
    provider: 'google' | 'outlook' | 'ics';
    syncedAt: number;
    externalEventId?: string;
  }> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem(CALENDAR_SYNC_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public static recordSync(
    roomCode: string,
    provider: 'google' | 'outlook' | 'ics',
    externalEventId?: string,
  ): void {
    const list = this.getSyncRecords();
    const existing = list.findIndex((r) => r.roomCode === roomCode);
    const item = {
      roomCode,
      provider,
      syncedAt: Date.now(),
      ...(externalEventId ? { externalEventId } : {}),
    };
    if (existing >= 0) {
      list[existing] = item;
    } else {
      list.push(item);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        CALENDAR_SYNC_STORAGE_KEY,
        JSON.stringify(list),
      );
    }
  }
}
