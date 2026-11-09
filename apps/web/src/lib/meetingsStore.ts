import { supabase, isSupabaseConfigured } from './supabase';
import {
  generateRoomCode,
  normalizeRoomCode,
  personalRoomCodeForUser,
} from '../types';
import { configureRoomViaApi } from './signalingClient';

export type RecurrenceRule =
  '' | 'FREQ=DAILY' | 'FREQ=WEEKLY' | 'FREQ=WEEKLY;INTERVAL=2' | 'FREQ=MONTHLY';

export interface SavedRoom {
  id: string;
  code: string;
  ownerId: string;
  kind: 'instant' | 'scheduled' | 'personal';
  title: string;
  description: string;
  passcode?: string;
  waitingRoom: boolean;
  createdAt: string;
}

export interface MeetingAttendeeRecord {
  id: string;
  displayName: string;
  role:
    | 'host'
    | 'cohost'
    | 'attendee'
    | 'guest'
    | 'panelist'
    | 'viewer'
    | 'speaker';
  verified?: boolean;
}

export interface MeetingHistoryItem {
  id: string;
  roomCode: string;
  roomTitle: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  peakParticipants: number;
  attendees: MeetingAttendeeRecord[];
}

export interface ScheduledMeetingItem {
  id: string;
  roomCode: string;
  title: string;
  description: string;
  startsAt: string; // ISO string
  durationMinutes: number;
  rrule: RecurrenceRule;
  passcode?: string;
  invitees: string[];
  createdAt: string;
}

const ROOMS_STORAGE_KEY = 'meetit_rooms_v1';
const HISTORY_STORAGE_KEY = 'meetit_meeting_history_v1';
const SCHEDULED_STORAGE_KEY = 'meetit_scheduled_meetings_v1';

function randomId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadLocalRooms(userId?: string): SavedRoom[] {
  try {
    const raw = window.localStorage.getItem(ROOMS_STORAGE_KEY);
    const list: SavedRoom[] = raw ? (JSON.parse(raw) as SavedRoom[]) : [];
    return userId ? list.filter((r) => r.ownerId === userId) : list;
  } catch {
    return [];
  }
}

function saveLocalRooms(rooms: SavedRoom[]): void {
  try {
    window.localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(rooms));
  } catch {
    // ignore quota error
  }
}

export function findRoomMetadataByCode(code: string): SavedRoom | null {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return null;
  const all = loadLocalRooms();
  return all.find((r) => r.code === normalized) ?? null;
}

export function ensurePersonalRoomForUser(user: {
  id: string;
  displayName: string;
}): SavedRoom {
  const all = loadLocalRooms();
  const code = personalRoomCodeForUser(user.id);
  const existing = all.find(
    (r) => r.code === code || (r.ownerId === user.id && r.kind === 'personal'),
  );
  if (existing) {
    return existing;
  }

  const firstName = user.displayName.split(' ')[0] || 'Host';
  const created: SavedRoom = {
    id: randomId(),
    code,
    ownerId: user.id,
    kind: 'personal',
    title: `${firstName}'s Personal Room`,
    description: `Permanent audio-first meeting room hosted by ${user.displayName}.`,
    waitingRoom: false,
    createdAt: new Date().toISOString(),
  };

  saveLocalRooms([created, ...all]);
  void configureRoomViaApi({
    code: created.code,
    title: created.title,
    description: created.description,
    kind: 'personal',
    ownerId: user.id,
  });

  if (isSupabaseConfigured && supabase) {
    void supabase.from('rooms').upsert(
      {
        code: created.code,
        owner_id: user.id,
        kind: 'personal',
        title: created.title,
        description: created.description,
      },
      { onConflict: 'code' },
    );
  }

  return created;
}

export async function saveOrUpdateRoom(params: {
  ownerId: string;
  code?: string;
  kind?: 'instant' | 'scheduled' | 'personal';
  title: string;
  description: string;
  passcode?: string;
  waitingRoom?: boolean;
}): Promise<SavedRoom> {
  const all = loadLocalRooms();
  const code =
    (params.code ? normalizeRoomCode(params.code) : null) || generateRoomCode();
  const idx = all.findIndex((r) => r.code === code);
  const trimmedPasscode = params.passcode?.trim() || undefined;

  const existing = idx >= 0 ? all[idx] : undefined;
  const updated: SavedRoom = {
    id: existing?.id ?? randomId(),
    code,
    ownerId: params.ownerId,
    kind: params.kind ?? existing?.kind ?? 'instant',
    title: params.title.trim() || `Room ${code}`,
    description: params.description.trim(),
    ...(trimmedPasscode ? { passcode: trimmedPasscode } : {}),
    waitingRoom: params.waitingRoom ?? existing?.waitingRoom ?? false,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.unshift(updated);
  }
  saveLocalRooms(all);

  await configureRoomViaApi({
    code: updated.code,
    title: updated.title,
    description: updated.description,
    ...(updated.passcode ? { passcode: updated.passcode } : {}),
    waitingRoom: updated.waitingRoom,
    kind: updated.kind,
    ownerId: updated.ownerId,
  });

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('rooms').upsert(
        {
          code: updated.code,
          owner_id: updated.ownerId,
          kind: updated.kind,
          title: updated.title,
          description: updated.description,
          settings: {
            waiting_room: updated.waitingRoom,
            locked: false,
            allow_guests: true,
            chat_enabled: true,
            screen_share: 'everyone',
            max_participants: 4,
            has_passcode: Boolean(updated.passcode),
          },
        },
        { onConflict: 'code' },
      );
    } catch {
      // Non-fatal if migration 0003 hasn't been applied on remote DB yet
    }
  }

  return updated;
}

export function loadMeetingHistory(): MeetingHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MeetingHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordCompletedMeetingSession(params: {
  roomCode: string;
  roomTitle?: string;
  startedAtMs: number;
  endedAtMs?: number;
  attendees: MeetingAttendeeRecord[];
}): MeetingHistoryItem {
  const endedAtMs = params.endedAtMs ?? Date.now();
  const durationSeconds = Math.max(
    1,
    Math.round((endedAtMs - params.startedAtMs) / 1000),
  );
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const roomMeta = findRoomMetadataByCode(params.roomCode);

  const item: MeetingHistoryItem = {
    id: randomId(),
    roomCode: params.roomCode,
    roomTitle:
      params.roomTitle || roomMeta?.title || `Meeting (${params.roomCode})`,
    startedAt: new Date(params.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationMinutes,
    peakParticipants: Math.max(1, params.attendees.length),
    attendees: params.attendees,
  };

  const existing = loadMeetingHistory();
  const next = [item, ...existing].slice(0, 100);
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return item;
}

export function loadScheduledMeetings(): ScheduledMeetingItem[] {
  try {
    const raw = window.localStorage.getItem(SCHEDULED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledMeetingItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  } catch {
    return [];
  }
}

function saveScheduledMeetingsList(items: ScheduledMeetingItem[]): void {
  try {
    window.localStorage.setItem(SCHEDULED_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export async function createScheduledMeeting(params: {
  ownerId: string;
  title: string;
  description: string;
  roomCode?: string;
  startsAt: string;
  durationMinutes: number;
  rrule: RecurrenceRule;
  passcode?: string;
  invitees: string[];
}): Promise<ScheduledMeetingItem> {
  const room = await saveOrUpdateRoom({
    ownerId: params.ownerId,
    ...(params.roomCode ? { code: params.roomCode } : {}),
    kind: 'scheduled',
    title: params.title.trim() || 'Scheduled Meeting',
    description: params.description.trim(),
    ...(params.passcode ? { passcode: params.passcode } : {}),
  });

  const item: ScheduledMeetingItem = {
    id: randomId(),
    roomCode: room.code,
    title: room.title,
    description: room.description,
    startsAt: new Date(params.startsAt).toISOString(),
    durationMinutes: Math.max(5, params.durationMinutes),
    rrule: params.rrule,
    ...(room.passcode ? { passcode: room.passcode } : {}),
    invitees: params.invitees.map((s) => s.trim()).filter((s) => s.length > 0),
    createdAt: new Date().toISOString(),
  };

  const list = loadScheduledMeetings();
  saveScheduledMeetingsList([...list, item]);
  return item;
}

export function deleteScheduledMeeting(id: string): ScheduledMeetingItem[] {
  const list = loadScheduledMeetings().filter((m) => m.id !== id);
  saveScheduledMeetingsList(list);
  return list;
}

export function formatRecurrenceLabel(rrule: RecurrenceRule): string {
  switch (rrule) {
    case 'FREQ=DAILY':
      return 'Repeats daily';
    case 'FREQ=WEEKLY':
      return 'Repeats weekly';
    case 'FREQ=WEEKLY;INTERVAL=2':
      return 'Repeats every 2 weeks';
    case 'FREQ=MONTHLY':
      return 'Repeats monthly';
    default:
      return 'One-time meeting';
  }
}

function toIcsUtcTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generates an RFC 5545 compliant `.ics` calendar file for a scheduled meeting,
 * including optional `RRULE` recurrence and room link/passcode details.
 */
export function generateIcsContent(
  meeting: ScheduledMeetingItem,
  originUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://meetit.app',
): string {
  const startDate = new Date(meeting.startsAt);
  const endDate = new Date(
    startDate.getTime() + meeting.durationMinutes * 60 * 1000,
  );
  const roomUrl = `${originUrl.replace(/\/$/, '')}/m/${meeting.roomCode}`;

  const descParts = [
    meeting.description || 'Join this audio-first video meeting on MeetIT.',
    '',
    `Join link: ${roomUrl}`,
    `Room code: ${meeting.roomCode}`,
  ];
  if (meeting.passcode) {
    descParts.push(`Room passcode: ${meeting.passcode}`);
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MeetIT//Audio-First Video Conferencing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${meeting.id}@meetit.app`,
    `DTSTAMP:${toIcsUtcTimestamp(new Date())}`,
    `DTSTART:${toIcsUtcTimestamp(startDate)}`,
    `DTEND:${toIcsUtcTimestamp(endDate)}`,
    `SUMMARY:${escapeIcsText(meeting.title)}`,
    `DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`,
    `LOCATION:${escapeIcsText(roomUrl)}`,
    `URL:${escapeIcsText(roomUrl)}`,
  ];

  if (meeting.rrule) {
    lines.push(`RRULE:${meeting.rrule}`);
  }

  for (const email of meeting.invitees) {
    lines.push(`ATTENDEE;CN=${escapeIcsText(email)}:mailto:${email}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcsFile(meeting: ScheduledMeetingItem): void {
  const content = generateIcsContent(meeting);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug =
    meeting.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || meeting.roomCode;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `meetit-${slug}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
