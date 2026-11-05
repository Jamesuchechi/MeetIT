import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  personalRoomCodeForUser,
} from './types';
import { classifyMediaError } from './lib/devices';
import { computeLayout } from './lib/layout';
import { ActiveSpeakerSelector } from './lib/activeSpeaker';
import { formatRecurrenceLabel, generateIcsContent } from './lib/meetingsStore';
import {
  formatAllNotesAsMarkdown,
  formatNoteAsMarkdown,
  type MeetingActionItem,
  type MeetingNoteItem,
} from './lib/notesStore';

describe('Room Code Utilities', () => {
  it('generates a 3-4-3 room code with hyphen separators', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });

  it('normalizes formatted room codes and links correctly', () => {
    expect(normalizeRoomCode('abc-defg-hij')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('ABC-DEFG-HIJ')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('abcdefghij')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('https://meetit.app/m/kpt-wnrb-hxe')).toBe(
      'kpt-wnrb-hxe',
    );
  });

  it('rejects invalid room codes', () => {
    expect(normalizeRoomCode('short')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('1234-5678-901')).toBeNull();
  });
});

describe('Device Error Classification', () => {
  it('classifies NotAllowedError as permission_denied with recovery steps', () => {
    const res = classifyMediaError({ name: 'NotAllowedError' });
    expect(res.errorKind).toBe('permission_denied');
    expect(res.recoverySteps.length).toBeGreaterThan(0);
  });

  it('classifies NotFoundError as no_device', () => {
    const res = classifyMediaError({ name: 'NotFoundError' });
    expect(res.errorKind).toBe('no_device');
    expect(res.recoverySteps.length).toBeGreaterThan(0);
  });

  it('classifies NotReadableError as hardware_in_use', () => {
    const res = classifyMediaError({ name: 'NotReadableError' });
    expect(res.errorKind).toBe('hardware_in_use');
  });
});

describe('computeLayout (1 to 4 mesh participants)', () => {
  it('computes solo, pair, trio, and quad desktop layouts accurately', () => {
    const solo = computeLayout(1);
    expect(solo.mode).toBe('solo');
    expect(solo.columns).toBe(1);
    expect(solo.rows).toBe(1);
    expect(solo.isRoomFull).toBe(false);

    const pair = computeLayout(2);
    expect(pair.mode).toBe('pair');
    expect(pair.columns).toBe(2);
    expect(pair.rows).toBe(1);
    expect(pair.isRoomFull).toBe(false);

    const trio = computeLayout(3);
    expect(trio.mode).toBe('trio');
    expect(trio.columns).toBe(2);
    expect(trio.rows).toBe(2);
    expect(trio.isRoomFull).toBe(false);

    const quad = computeLayout(4);
    expect(quad.mode).toBe('quad');
    expect(quad.columns).toBe(2);
    expect(quad.rows).toBe(2);
    expect(quad.isRoomFull).toBe(true);
  });

  it('computes spotlight and mobile portrait layouts accurately', () => {
    const portraitPair = computeLayout(2, { isPortrait: true });
    expect(portraitPair.columns).toBe(1);
    expect(portraitPair.rows).toBe(2);

    const spotlight = computeLayout(3, { hasSpotlight: true });
    expect(spotlight.mode).toBe('spotlight');
    expect(spotlight.filmstripCount).toBe(3);
  });
});

describe('ActiveSpeakerSelector with hysteresis', () => {
  it('selects active speaker above threshold and holds during brief pauses', () => {
    const selector = new ActiveSpeakerSelector({
      speakingThreshold: 15,
      switchMargin: 10,
      holdMs: 800,
    });

    // t=1000: peer-a speaks
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 35 },
          { peerId: 'peer-b', level: 5 },
        ],
        1000,
      ),
    ).toBe('peer-a');

    // t=1400: peer-a briefly pauses (level 0), still within 800ms hold window
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 0 },
          { peerId: 'peer-b', level: 5 },
        ],
        1400,
      ),
    ).toBe('peer-a');

    // t=1600: peer-b speaks clearly above threshold + switchMargin -> immediate takeover
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 0 },
          { peerId: 'peer-b', level: 30 },
        ],
        1600,
      ),
    ).toBe('peer-b');

    // t=2600: silence after holdMs expires -> clears active speaker
    expect(
      selector.evaluate(
        [
          { peerId: 'peer-a', level: 0 },
          { peerId: 'peer-b', level: 0 },
        ],
        2600,
      ),
    ).toBeNull();
  });
});

describe('Personal Room & Scheduled Meetings (.ics + RRULE)', () => {
  it('generates deterministic permanent personal room codes per user ID', () => {
    const code1 = personalRoomCodeForUser('user-uuid-123');
    const code2 = personalRoomCodeForUser('user-uuid-123');
    const code3 = personalRoomCodeForUser('user-uuid-999');
    expect(code1).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(code1).toBe(code2);
    expect(code1).not.toBe(code3);
  });

  it('generates valid RFC 5545 .ics calendar content with RRULE and passcode', () => {
    const ics = generateIcsContent(
      {
        id: 'sched-001',
        roomCode: 'abc-defg-hij',
        title: 'Weekly Engineering Sync',
        description: 'Review sprint goals and blockers.',
        startsAt: '2026-11-06T14:00:00.000Z',
        durationMinutes: 45,
        rrule: 'FREQ=WEEKLY',
        passcode: '7788',
        invitees: ['mei@example.com'],
        createdAt: '2026-11-05T10:00:00.000Z',
      },
      'https://meetit.app',
    );

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Weekly Engineering Sync');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).toContain('Room passcode: 7788');
    expect(ics).toContain('ATTENDEE;CN=mei@example.com:mailto:mei@example.com');
    expect(ics).toContain('END:VCALENDAR');
    expect(formatRecurrenceLabel('FREQ=WEEKLY')).toBe('Repeats weekly');
  });
});

describe('Meeting Notes & Action Items Hub (Markdown export & task sync)', () => {
  const sampleNote: MeetingNoteItem = {
    id: 'note-101',
    ownerId: 'user-1',
    roomCode: 'abc-defg-hij',
    meetingTitle: 'Architecture Sync',
    meetingDate: '2026-11-05T15:00:00.000Z',
    summary: 'Aligned on mesh-to-SFU threshold and waiting room policies.',
    content: '- Finalized 4-peer mesh limit\n- Verified TURN fallback',
    attendees: ['James Uchechi', 'Mei Lin'],
    tags: ['architecture', 'webrtc'],
    createdAt: '2026-11-05T15:45:00.000Z',
    updatedAt: '2026-11-05T15:45:00.000Z',
  };

  const sampleTasks: MeetingActionItem[] = [
    {
      id: 'task-1',
      ownerId: 'user-1',
      noteId: 'note-101',
      roomCode: 'abc-defg-hij',
      meetingTitle: 'Architecture Sync',
      text: 'Ship waiting room admit/deny controls',
      assignee: 'James',
      priority: 'high',
      done: false,
      createdAt: '2026-11-05T15:46:00.000Z',
    },
    {
      id: 'task-2',
      ownerId: 'user-1',
      noteId: 'note-101',
      roomCode: 'abc-defg-hij',
      meetingTitle: 'Architecture Sync',
      text: 'Verify .ics RRULE export',
      priority: 'medium',
      done: true,
      createdAt: '2026-11-05T15:47:00.000Z',
      completedAt: '2026-11-05T16:00:00.000Z',
    },
  ];

  it('formats a meeting note with executive summary and action item checkboxes as Markdown', () => {
    const md = formatNoteAsMarkdown(sampleNote, sampleTasks);
    expect(md).toContain('# Architecture Sync');
    expect(md).toContain('- **Room Code:** `abc-defg-hij`');
    expect(md).toContain('- **Attendees:** James Uchechi, Mei Lin');
    expect(md).toContain('## Executive Summary');
    expect(md).toContain(
      'Aligned on mesh-to-SFU threshold and waiting room policies.',
    );
    expect(md).toContain(
      '- [ ] Ship waiting room admit/deny controls _(@James · priority:high)_',
    );
    expect(md).toContain('- [x] Verify .ics RRULE export');
  });

  it('formats multiple meeting notes into a combined Markdown document', () => {
    const combined = formatAllNotesAsMarkdown([sampleNote], sampleTasks);
    expect(combined).toContain('# Architecture Sync');
    expect(combined).toContain('## Action Items');
  });
});
