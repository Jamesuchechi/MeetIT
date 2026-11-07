import { supabase, isSupabaseConfigured } from './supabase';
import { normalizeRoomCode } from '../types';

export interface TranscriptCue {
  id: string;
  transcriptId?: string | undefined;
  speakerId?: string | undefined;
  speakerName: string;
  text: string;
  startMs: number;
  endMs?: number | undefined;
  cueOrder: number;
  language?: string | undefined;
}

export interface MeetingTranscript {
  id: string;
  meetingId?: string | undefined;
  roomId?: string | undefined;
  roomCode: string;
  roomTitle: string;
  startedAt: string; // ISO
  endedAt?: string | undefined;
  durationSeconds: number;
  createdBy?: string | undefined;
  cues: TranscriptCue[];
}

const TRANSCRIPTS_STORAGE_KEY = 'meetit_transcripts_v1';

export function loadLocalTranscripts(ownerId?: string): MeetingTranscript[] {
  try {
    const raw = window.localStorage.getItem(TRANSCRIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MeetingTranscript[];
    if (!Array.isArray(parsed)) return [];
    const filtered = ownerId
      ? parsed.filter((t) => !t.createdBy || t.createdBy === ownerId)
      : parsed;
    return filtered.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  } catch {
    return [];
  }
}

export function saveLocalTranscripts(transcripts: MeetingTranscript[]): void {
  try {
    window.localStorage.setItem(
      TRANSCRIPTS_STORAGE_KEY,
      JSON.stringify(transcripts),
    );
  } catch {
    // ignore
  }
}

export function appendLocalTranscript(transcript: MeetingTranscript): void {
  const existing = loadLocalTranscripts();
  const index = existing.findIndex((t) => t.id === transcript.id);
  if (index >= 0) {
    existing[index] = transcript;
  } else {
    existing.unshift(transcript);
  }
  saveLocalTranscripts(existing);
}

export async function fetchTranscripts(
  ownerId?: string,
): Promise<MeetingTranscript[]> {
  const local = loadLocalTranscripts(ownerId);
  if (!isSupabaseConfigured || !supabase) {
    return local;
  }

  try {
    let query = supabase
      .from('transcripts')
      .select('*, transcript_cues(*)')
      .order('started_at', { ascending: false });

    if (ownerId) {
      query = query.eq('created_by', ownerId);
    }

    const { data, error } = await query;
    if (error || !data) {
      return local;
    }

    const remoteRecords: MeetingTranscript[] = data.map((row) => {
      const code =
        normalizeRoomCode(String(row.room_code || '')) || 'meetit-room';
      const rawCues =
        (row.transcript_cues as Array<Record<string, unknown>>) || [];
      const cues: TranscriptCue[] = (Array.isArray(rawCues) ? rawCues : []).map(
        (c, idx: number) => ({
          id: String(c['id'] || `cue-${idx}`),
          transcriptId: String(row.id),
          speakerName: String(c['speaker_name'] || 'Speaker'),
          text: String(c['text'] || ''),
          startMs: Number(c['start_ms'] || 0),
          endMs: c['end_ms'] ? Number(c['end_ms']) : undefined,
          cueOrder: Number(c['cue_order'] ?? idx),
          language: c['language'] ? String(c['language']) : undefined,
        }),
      );

      cues.sort((a, b) => a.cueOrder - b.cueOrder);

      return {
        id: String(row.id),
        roomCode: code,
        roomTitle: (row.room_title as string) || `Room ${code}`,
        startedAt: (row.started_at as string) || new Date().toISOString(),
        ...(row.ended_at ? { endedAt: row.ended_at as string } : {}),
        durationSeconds: (row.duration_seconds as number) || 0,
        ...(row.created_by ? { createdBy: row.created_by as string } : {}),
        cues,
      };
    });

    if (remoteRecords.length > 0) {
      saveLocalTranscripts(remoteRecords);
      return remoteRecords;
    }
    return local;
  } catch {
    return local;
  }
}

export async function persistTranscript(
  transcript: MeetingTranscript,
): Promise<boolean> {
  appendLocalTranscript(transcript);

  if (!isSupabaseConfigured || !supabase) {
    return true;
  }

  try {
    const { error: tError } = await supabase.from('transcripts').upsert({
      id: transcript.id,
      room_code: transcript.roomCode,
      room_title: transcript.roomTitle,
      started_at: transcript.startedAt,
      ended_at: transcript.endedAt || new Date().toISOString(),
      duration_seconds: transcript.durationSeconds,
      ...(transcript.createdBy ? { created_by: transcript.createdBy } : {}),
    });

    if (tError) {
      return false;
    }

    if (transcript.cues.length > 0) {
      const cuesPayload = transcript.cues.map((c, idx) => ({
        id: c.id,
        transcript_id: transcript.id,
        speaker_name: c.speakerName,
        text: c.text,
        start_ms: c.startMs,
        ...(c.endMs ? { end_ms: c.endMs } : {}),
        cue_order: c.cueOrder ?? idx,
        language: c.language || 'en-US',
      }));

      await supabase.from('transcript_cues').upsert(cuesPayload);
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteTranscript(id: string): Promise<boolean> {
  try {
    const existing = loadLocalTranscripts();
    const updated = existing.filter((t) => t.id !== id);
    saveLocalTranscripts(updated);

    if (isSupabaseConfigured && supabase) {
      await supabase.from('transcripts').delete().eq('id', id);
    }
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                               EXPORTERS                                    */
/* -------------------------------------------------------------------------- */

export function formatMsToTimecode(
  totalMs: number,
  separator: ',' | '.' = ',',
): string {
  const ms = Math.floor(totalMs % 1000);
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');

  return `${hh}:${mm}:${ss}${separator}${mmm}`;
}

export function formatMsToClock(totalMs: number): string {
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Export as Plain Text (.txt)
 */
export function exportTranscriptAsTxt(transcript: MeetingTranscript): string {
  const lines: string[] = [
    `MEETIT TRANSCRIPT: ${transcript.roomTitle.toUpperCase()}`,
    `Room Code: ${transcript.roomCode}`,
    `Date: ${new Date(transcript.startedAt).toLocaleString()}`,
    `Duration: ${Math.floor(transcript.durationSeconds / 60)} minutes`,
    '--------------------------------------------------------------------------------',
    '',
  ];

  for (const cue of transcript.cues) {
    const time = formatMsToClock(cue.startMs);
    lines.push(`[${time}] ${cue.speakerName}: ${cue.text}`);
  }

  return lines.join('\n');
}

/**
 * Export as SubRip Subtitles (.srt)
 */
export function exportTranscriptAsSrt(transcript: MeetingTranscript): string {
  const blocks: string[] = [];

  transcript.cues.forEach((cue, index) => {
    const start = formatMsToTimecode(cue.startMs, ',');
    // Default 3 second length if endMs is not specified
    const endMs = cue.endMs ?? cue.startMs + 3000;
    const end = formatMsToTimecode(endMs, ',');

    blocks.push(
      `${index + 1}\n${start} --> ${end}\n${cue.speakerName}: ${cue.text}\n`,
    );
  });

  return blocks.join('\n');
}

/**
 * Export as WebVTT Subtitles (.vtt)
 */
export function exportTranscriptAsVtt(transcript: MeetingTranscript): string {
  const blocks: string[] = ['WEBVTT', ''];

  transcript.cues.forEach((cue, index) => {
    const start = formatMsToTimecode(cue.startMs, '.');
    const endMs = cue.endMs ?? cue.startMs + 3000;
    const end = formatMsToTimecode(endMs, '.');

    blocks.push(
      `${index + 1}\n${start} --> ${end}\n<v ${cue.speakerName}>${cue.text}</v>\n`,
    );
  });

  return blocks.join('\n');
}

/**
 * Export as Document / Rich Text Markdown (.docx compliant markdown)
 */
export function exportTranscriptAsDocx(transcript: MeetingTranscript): string {
  const lines: string[] = [
    `# Meeting Transcript: ${transcript.roomTitle}`,
    '',
    `- **Meeting Code:** \`${transcript.roomCode}\``,
    `- **Session Date:** ${new Date(transcript.startedAt).toLocaleString()}`,
    `- **Total Duration:** ${Math.floor(transcript.durationSeconds / 60)}m ${transcript.durationSeconds % 60}s`,
    `- **Total Dialogue Lines:** ${transcript.cues.length}`,
    '',
    '---',
    '',
    '## Dialogue Log',
    '',
  ];

  for (const cue of transcript.cues) {
    const time = formatMsToClock(cue.startMs);
    lines.push(`> **${cue.speakerName}** _(${time})_  \n> ${cue.text}\n`);
  }

  return lines.join('\n');
}

/**
 * Trigger browser file download
 */
export function downloadTranscriptFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
