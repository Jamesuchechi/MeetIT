import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateIcsFile,
  buildGoogleCalendarUri,
  buildOutlookCalendarUri,
  CalendarSyncStore,
} from './calendarIntegration';

describe('CalendarIntegration', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    globalThis.window = {
      localStorage: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          mockStorage = {};
        },
        length: 0,
        key: () => null,
      } as Storage,
    } as unknown as Window & typeof globalThis;
  });

  const sampleEvent = {
    title: 'Executive Architecture Review',
    roomCode: 'gzh-kfwu-wqt',
    roomUrl: 'https://meetit.app/m/gzh-kfwu-wqt',
    startTime: new Date('2026-11-15T14:00:00Z'),
    durationMinutes: 45,
    description:
      'Quarterly review of platform architecture and scaling roadmap',
    hostName: 'Ada Lovelace',
    attendees: ['charles@example.com', 'grace@example.com'],
  };

  it('generates valid RFC 5545 iCalendar (.ics) format string', () => {
    const ics = generateIcsFile(sampleEvent);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('SUMMARY:Executive Architecture Review');
    expect(ics).toContain('LOCATION:https://meetit.app/m/gzh-kfwu-wqt');
    expect(ics).toContain('X-MEETIT-ROOM-CODE:gzh-kfwu-wqt');
    expect(ics).toContain('DTSTART:20261115T140000Z');
    expect(ics).toContain('DTEND:20261115T144500Z');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('builds direct Google Calendar creation URI with pre-filled details', () => {
    const uri = buildGoogleCalendarUri(sampleEvent);
    expect(uri).toContain(
      'https://calendar.google.com/calendar/render?action=TEMPLATE',
    );

    const parsed = new URL(uri);
    expect(parsed.searchParams.get('text')).toBe(
      'Executive Architecture Review',
    );
    expect(parsed.searchParams.get('location')).toBe(
      'https://meetit.app/m/gzh-kfwu-wqt',
    );
    expect(parsed.searchParams.get('dates')).toBe(
      '20261115T140000Z/20261115T144500Z',
    );
    expect(parsed.searchParams.get('add')).toContain('charles@example.com');
  });

  it('builds Outlook Live and Office 365 calendar deep links', () => {
    const liveUri = buildOutlookCalendarUri(sampleEvent, false);
    expect(liveUri).toContain(
      'https://outlook.live.com/calendar/0/deeplink/compose',
    );

    const o365Uri = buildOutlookCalendarUri(sampleEvent, true);
    expect(o365Uri).toContain(
      'https://outlook.office.com/calendar/0/deeplink/compose',
    );

    const parsed = new URL(o365Uri);
    expect(parsed.searchParams.get('subject')).toBe(
      'Executive Architecture Review',
    );
    expect(parsed.searchParams.get('location')).toBe(
      'https://meetit.app/m/gzh-kfwu-wqt',
    );
  });

  it('records and retrieves calendar sync state', () => {
    CalendarSyncStore.recordSync('gzh-kfwu-wqt', 'google', 'gcal-event-999');
    const records = CalendarSyncStore.getSyncRecords();
    const match = records.find((r) => r.roomCode === 'gzh-kfwu-wqt');

    expect(match).toBeDefined();
    expect(match?.provider).toBe('google');
    expect(match?.externalEventId).toBe('gcal-event-999');
  });
});
