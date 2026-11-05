import { supabase, isSupabaseConfigured } from './supabase';
import { normalizeRoomCode } from '../types';
import type { MeetingHistoryItem } from './meetingsStore';

export type ActionItemPriority = 'low' | 'medium' | 'high';

export interface MeetingNoteItem {
  id: string;
  ownerId: string;
  meetingId?: string;
  roomCode: string;
  meetingTitle: string;
  meetingDate: string; // ISO string
  summary: string;
  content: string;
  attendees: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MeetingActionItem {
  id: string;
  ownerId: string;
  noteId?: string;
  roomCode: string;
  meetingTitle: string;
  text: string;
  assignee?: string;
  dueDate?: string;
  priority: ActionItemPriority;
  done: boolean;
  createdAt: string;
  completedAt?: string;
}

const NOTES_STORAGE_KEY = 'meetit_meeting_notes_v1';
const ACTION_ITEMS_STORAGE_KEY = 'meetit_action_items_v1';

function randomId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadMeetingNotes(ownerId?: string): MeetingNoteItem[] {
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MeetingNoteItem[];
    if (!Array.isArray(parsed)) return [];
    const filtered = ownerId
      ? parsed.filter((n) => !n.ownerId || n.ownerId === ownerId)
      : parsed;
    return filtered.sort(
      (a, b) =>
        new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime(),
    );
  } catch {
    return [];
  }
}

function saveLocalMeetingNotes(notes: MeetingNoteItem[]): void {
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // ignore quota error
  }
}

export function loadActionItems(ownerId?: string): MeetingActionItem[] {
  try {
    const raw = window.localStorage.getItem(ACTION_ITEMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MeetingActionItem[];
    if (!Array.isArray(parsed)) return [];
    const filtered = ownerId
      ? parsed.filter((t) => !t.ownerId || t.ownerId === ownerId)
      : parsed;
    return filtered.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch {
    return [];
  }
}

function saveLocalActionItems(items: MeetingActionItem[]): void {
  try {
    window.localStorage.setItem(
      ACTION_ITEMS_STORAGE_KEY,
      JSON.stringify(items),
    );
  } catch {
    // ignore quota error
  }
}

export async function saveOrUpdateMeetingNote(params: {
  id?: string;
  ownerId: string;
  meetingId?: string;
  roomCode: string;
  meetingTitle: string;
  meetingDate?: string;
  summary: string;
  content: string;
  attendees?: string[];
  tags?: string[];
}): Promise<MeetingNoteItem> {
  const all = loadMeetingNotes();
  const nowIso = new Date().toISOString();
  const normalizedCode =
    normalizeRoomCode(params.roomCode) ||
    params.roomCode.trim() ||
    'abc-defg-hij';

  const existingIdx = params.id ? all.findIndex((n) => n.id === params.id) : -1;
  const existing = existingIdx >= 0 ? all[existingIdx] : undefined;

  const note: MeetingNoteItem = {
    id: existing?.id ?? params.id ?? randomId(),
    ownerId: params.ownerId,
    ...(params.meetingId
      ? { meetingId: params.meetingId }
      : existing?.meetingId
        ? { meetingId: existing.meetingId }
        : {}),
    roomCode: normalizedCode,
    meetingTitle: params.meetingTitle.trim() || `Meeting (${normalizedCode})`,
    meetingDate: params.meetingDate || existing?.meetingDate || nowIso,
    summary: params.summary.trim(),
    content: params.content.trim(),
    attendees: params.attendees ?? existing?.attendees ?? [],
    tags: params.tags ?? existing?.tags ?? [],
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  if (existingIdx >= 0) {
    all[existingIdx] = note;
  } else {
    all.unshift(note);
  }
  saveLocalMeetingNotes(all);

  if (isSupabaseConfigured && supabase && params.ownerId) {
    try {
      await supabase.from('meeting_notes').upsert(
        {
          id: note.id,
          owner_id: note.ownerId,
          meeting_id: note.meetingId ?? null,
          room_code: note.roomCode,
          meeting_title: note.meetingTitle,
          meeting_date: note.meetingDate,
          summary: note.summary,
          content: note.content,
          attendees: note.attendees,
          tags: note.tags,
          updated_at: note.updatedAt,
        },
        { onConflict: 'id' },
      );
    } catch {
      // Non-fatal if migration 0004 hasn't been applied on remote DB yet
    }
  }

  return note;
}

export async function deleteMeetingNote(noteId: string): Promise<void> {
  const all = loadMeetingNotes().filter((n) => n.id !== noteId);
  saveLocalMeetingNotes(all);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('meeting_notes').delete().eq('id', noteId);
    } catch {
      // ignore
    }
  }
}

export async function createActionItem(params: {
  ownerId: string;
  noteId?: string;
  roomCode?: string;
  meetingTitle?: string;
  text: string;
  assignee?: string;
  dueDate?: string;
  priority?: ActionItemPriority;
}): Promise<MeetingActionItem> {
  const all = loadActionItems();
  const nowIso = new Date().toISOString();
  const item: MeetingActionItem = {
    id: randomId(),
    ownerId: params.ownerId,
    ...(params.noteId ? { noteId: params.noteId } : {}),
    roomCode: params.roomCode?.trim() || '',
    meetingTitle: params.meetingTitle?.trim() || 'General follow-up',
    text: params.text.trim(),
    ...(params.assignee?.trim() ? { assignee: params.assignee.trim() } : {}),
    ...(params.dueDate?.trim() ? { dueDate: params.dueDate.trim() } : {}),
    priority: params.priority ?? 'medium',
    done: false,
    createdAt: nowIso,
  };

  saveLocalActionItems([item, ...all]);

  if (isSupabaseConfigured && supabase && params.ownerId) {
    try {
      await supabase.from('meeting_action_items').insert({
        id: item.id,
        owner_id: item.ownerId,
        note_id: item.noteId ?? null,
        room_code: item.roomCode,
        meeting_title: item.meetingTitle,
        text: item.text,
        assignee: item.assignee ?? null,
        due_date: item.dueDate ?? null,
        priority: item.priority,
        done: item.done,
      });
    } catch {
      // Non-fatal if migration 0004 hasn't been applied on remote DB yet
    }
  }

  return item;
}

export async function toggleActionItem(
  itemId: string,
): Promise<MeetingActionItem | null> {
  const all = loadActionItems();
  const idx = all.findIndex((i) => i.id === itemId);
  if (idx < 0) return null;

  const current = all[idx]!;
  const nextDone = !current.done;
  const nowIso = new Date().toISOString();

  const updated: MeetingActionItem = {
    ...current,
    done: nextDone,
    ...(nextDone ? { completedAt: nowIso } : {}),
  };
  if (!nextDone) {
    delete updated.completedAt;
  }

  all[idx] = updated;
  saveLocalActionItems(all);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('meeting_action_items')
        .update({
          done: updated.done,
          completed_at: updated.completedAt ?? null,
        })
        .eq('id', itemId);
    } catch {
      // ignore
    }
  }

  return updated;
}

export async function deleteActionItem(itemId: string): Promise<void> {
  const all = loadActionItems().filter((i) => i.id !== itemId);
  saveLocalActionItems(all);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('meeting_action_items').delete().eq('id', itemId);
    } catch {
      // ignore
    }
  }
}

export function ensureNoteForCompletedMeeting(params: {
  ownerId: string;
  historyItem: MeetingHistoryItem;
  chatTranscript?: { displayName: string; text: string; ts: number }[];
}): MeetingNoteItem {
  const all = loadMeetingNotes();
  const existing = all.find((n) => n.meetingId === params.historyItem.id);
  if (existing) return existing;

  const attendeeNames = params.historyItem.attendees.map((a) => a.displayName);
  const chatLines =
    params.chatTranscript && params.chatTranscript.length > 0
      ? params.chatTranscript
          .map(
            (m) =>
              `- **${m.displayName}** (${new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}): ${m.text}`,
          )
          .join('\n')
      : '';

  const defaultSummary = `Completed ${params.historyItem.durationMinutes}-minute session in room ${params.historyItem.roomCode} with ${attendeeNames.length || 1} participant${attendeeNames.length === 1 ? '' : 's'}.`;
  const defaultContent = chatLines
    ? `### In-Call Chat Highlights\n${chatLines}\n\n### Key Decisions & Notes\n- Add meeting takeaways here.`
    : `### Key Discussion Points\n- Session recorded on ${new Date(params.historyItem.startedAt).toLocaleString()}.\n- Add key decisions and follow-ups below.`;

  const created: MeetingNoteItem = {
    id: randomId(),
    ownerId: params.ownerId,
    meetingId: params.historyItem.id,
    roomCode: params.historyItem.roomCode,
    meetingTitle: params.historyItem.roomTitle,
    meetingDate: params.historyItem.startedAt,
    summary: defaultSummary,
    content: defaultContent,
    attendees: attendeeNames,
    tags: ['call-summary'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveLocalMeetingNotes([created, ...all]);
  return created;
}

export function formatNoteAsMarkdown(
  note: MeetingNoteItem,
  actionItems: MeetingActionItem[] = [],
): string {
  const linkedTasks = actionItems.filter(
    (t) => t.noteId === note.id || (!t.noteId && t.roomCode === note.roomCode),
  );
  const dateStr = new Date(note.meetingDate).toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const lines: string[] = [
    `# ${note.meetingTitle}`,
    '',
    `- **Date:** ${dateStr}`,
    `- **Room Code:** \`${note.roomCode}\``,
  ];

  if (note.attendees.length > 0) {
    lines.push(`- **Attendees:** ${note.attendees.join(', ')}`);
  }
  if (note.tags.length > 0) {
    lines.push(`- **Tags:** ${note.tags.map((t) => `#${t}`).join(' ')}`);
  }

  lines.push(
    '',
    '## Executive Summary',
    '',
    note.summary || '_No summary provided._',
  );

  lines.push(
    '',
    '## Discussion & Detailed Notes',
    '',
    note.content || '_No detailed notes recorded._',
  );

  lines.push('', '## Action Items', '');
  if (linkedTasks.length === 0) {
    lines.push('_No action items assigned for this meeting._');
  } else {
    for (const task of linkedTasks) {
      const box = task.done ? '[x]' : '[ ]';
      const meta: string[] = [];
      if (task.assignee) meta.push(`@${task.assignee}`);
      if (task.priority !== 'medium') meta.push(`priority:${task.priority}`);
      if (task.dueDate) meta.push(`due:${task.dueDate}`);
      const suffix = meta.length > 0 ? ` _(${meta.join(' · ')})_` : '';
      lines.push(`- ${box} ${task.text}${suffix}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatAllNotesAsMarkdown(
  notes: MeetingNoteItem[],
  actionItems: MeetingActionItem[],
): string {
  if (notes.length === 0) {
    const lines = [
      '# MeetIT — Action Items & Notes Export',
      '',
      '## Open & Completed Action Items',
      '',
    ];
    if (actionItems.length === 0) {
      lines.push('_No notes or action items recorded yet._');
    } else {
      for (const task of actionItems) {
        const box = task.done ? '[x]' : '[ ]';
        lines.push(
          `- ${box} **${task.meetingTitle}**: ${task.text}${task.assignee ? ` (@${task.assignee})` : ''}`,
        );
      }
    }
    return lines.join('\n');
  }

  return notes
    .map((n) => formatNoteAsMarkdown(n, actionItems))
    .join('\n---\n\n');
}

export function downloadMarkdownFile(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName =
    filename
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'meeting-notes';
  a.href = url;
  a.download = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
