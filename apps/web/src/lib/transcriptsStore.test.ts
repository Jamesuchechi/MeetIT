import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatMsToTimecode,
  formatMsToClock,
  exportTranscriptAsTxt,
  exportTranscriptAsSrt,
  exportTranscriptAsVtt,
  exportTranscriptAsDocx,
  loadLocalTranscripts,
  saveLocalTranscripts,
  appendLocalTranscript,
  deleteTranscript,
  type MeetingTranscript,
} from './transcriptsStore';

describe('transcriptsStore and subtitle exporters suite', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    };

    globalThis.window = {
      localStorage: mockStorage as Storage,
    } as unknown as Window & typeof globalThis;
  });

  const sampleTranscript: MeetingTranscript = {
    id: 'tr-test-001',
    roomCode: 'abc-defg-hij',
    roomTitle: 'Architecture Review',
    startedAt: '2026-11-07T14:00:00.000Z',
    durationSeconds: 120,
    cues: [
      {
        id: 'c1',
        speakerName: 'Alice',
        text: 'Welcome everyone to the review.',
        startMs: 1500,
        endMs: 4500,
        cueOrder: 0,
      },
      {
        id: 'c2',
        speakerName: 'Bob',
        text: 'Glad to be here. Let us examine the STT latency.',
        startMs: 5000,
        endMs: 9200,
        cueOrder: 1,
      },
    ],
  };

  it('formats milliseconds to accurate SRT and VTT timecodes', () => {
    // 1 minute 5 seconds 250 milliseconds = 65,250 ms
    expect(formatMsToTimecode(65250, ',')).toBe('00:01:05,250');
    expect(formatMsToTimecode(65250, '.')).toBe('00:01:05.250');
    // 1 hour 2 minutes 3 seconds = 3723000 ms
    expect(formatMsToTimecode(3723000, ',')).toBe('01:02:03,000');
  });

  it('formats milliseconds to human clock format', () => {
    expect(formatMsToClock(45000)).toBe('0:45');
    expect(formatMsToClock(75000)).toBe('1:15');
    expect(formatMsToClock(3665000)).toBe('1:01:05');
  });

  it('exports transcript cleanly to plain text format', () => {
    const txt = exportTranscriptAsTxt(sampleTranscript);
    expect(txt).toContain('MEETIT TRANSCRIPT: ARCHITECTURE REVIEW');
    expect(txt).toContain('Room Code: abc-defg-hij');
    expect(txt).toContain('[0:01] Alice: Welcome everyone to the review.');
    expect(txt).toContain('[0:05] Bob: Glad to be here.');
  });

  it('exports transcript to SubRip (.srt) subtitle standard', () => {
    const srt = exportTranscriptAsSrt(sampleTranscript);
    expect(srt).toContain(
      '1\n00:00:01,500 --> 00:00:04,500\nAlice: Welcome everyone to the review.',
    );
    expect(srt).toContain(
      '2\n00:00:05,000 --> 00:00:09,200\nBob: Glad to be here.',
    );
  });

  it('exports transcript to WebVTT (.vtt) format with voice tags', () => {
    const vtt = exportTranscriptAsVtt(sampleTranscript);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:01.500 --> 00:00:04.500');
    expect(vtt).toContain('<v Alice>Welcome everyone to the review.</v>');
  });

  it('exports transcript to formatted docx markdown', () => {
    const doc = exportTranscriptAsDocx(sampleTranscript);
    expect(doc).toContain('# Meeting Transcript: Architecture Review');
    expect(doc).toContain('> **Alice**');
    expect(doc).toContain('Welcome everyone to the review.');
  });

  it('persists and deletes transcripts in local storage', async () => {
    expect(loadLocalTranscripts()).toEqual([]);
    saveLocalTranscripts([sampleTranscript]);
    expect(loadLocalTranscripts().length).toBe(1);

    const updated: MeetingTranscript = {
      ...sampleTranscript,
      roomTitle: 'Updated Title',
    };
    appendLocalTranscript(updated);
    expect(loadLocalTranscripts()[0]!.roomTitle).toBe('Updated Title');

    const deleted = await deleteTranscript('tr-test-001');
    expect(deleted).toBe(true);
    expect(loadLocalTranscripts()).toEqual([]);
  });
});
