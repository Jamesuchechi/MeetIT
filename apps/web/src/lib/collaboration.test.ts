import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ensureNoteForCompletedMeeting, loadMeetingNotes } from './notesStore';
import { SignalingClient } from './signalingClient';

describe('Collaboration Features & FormIT Integration', () => {
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
      location: { protocol: 'http:', host: 'localhost:5173' } as Location,
    } as unknown as Window & typeof globalThis;
  });

  it('attaches FormIT survey, poll results, and collaborative notes to completed meeting notes', () => {
    const historyItem = {
      id: 'session-collab-1',
      roomCode: 'ABCD-EFGH',
      roomTitle: 'Product Design Sync',
      startedAt: '2026-11-09T09:00:00Z',
      endedAt: '2026-11-09T09:45:00Z',
      durationMinutes: 45,
      peakParticipants: 2,
      attendees: [
        { id: 'u1', displayName: 'Alice', role: 'host' as const },
        { id: 'u2', displayName: 'Bob', role: 'attendee' as const },
      ],
    };

    const note = ensureNoteForCompletedMeeting({
      ownerId: 'u1',
      historyItem,
      chatTranscript: [
        { displayName: 'Alice', text: 'Welcome everyone', ts: 1731142800000 },
      ],
      formItSurvey: {
        formUrl: 'https://form-it-sandy.vercel.app/f/meetit-feedback',
        slug: 'meetit-feedback',
        title: 'Meeting Feedback Form',
        submissionsCount: 5,
      },
      pollResults: [
        {
          question: 'Should we launch next week?',
          options: ['Yes', 'No'],
          results: { Yes: 4, No: 1 },
        },
      ],
      collaborativeNotes: 'Action item: Deploy to staging before Thursday.',
    });

    expect(note).toBeDefined();
    expect(note.formItSurvey).toEqual({
      formUrl: 'https://form-it-sandy.vercel.app/f/meetit-feedback',
      slug: 'meetit-feedback',
      title: 'Meeting Feedback Form',
      submissionsCount: 5,
    });
    expect(note.pollResults).toHaveLength(1);
    expect(note.pollResults?.[0]?.question).toBe('Should we launch next week?');
    expect(note.collaborativeNotes).toBe(
      'Action item: Deploy to staging before Thursday.',
    );
  });

  it('SignalingClient exposes collaboration methods and sends structured payloads', () => {
    const client = new SignalingClient({
      roomCode: 'TEST-ROOM',
      displayName: 'Alice',
      url: 'ws://localhost:8787',
    });

    const sentMessages: unknown[] = [];
    // Mock the send method to verify message structure
    vi.spyOn(client, 'send').mockImplementation((msg) => {
      sentMessages.push(msg);
    });

    // 1. Breakout methods
    client.createBreakoutRooms(
      [
        { name: 'Room 1', peerIds: ['p1'] },
        { name: 'Room 2', peerIds: ['p2'] },
      ],
      15,
    );
    expect(sentMessages[0]).toMatchObject({
      type: 'host.action',
      payload: {
        action: 'breakout_create',
        rooms: [
          { name: 'Room 1', peerIds: ['p1'] },
          { name: 'Room 2', peerIds: ['p2'] },
        ],
        durationMinutes: 15,
      },
    });

    client.startBreakout();
    expect(sentMessages[1]).toMatchObject({
      type: 'host.action',
      payload: { action: 'breakout_start' },
    });

    client.broadcastBreakout('5 minutes remaining!');
    expect(sentMessages[2]).toMatchObject({
      type: 'host.action',
      payload: {
        action: 'breakout_broadcast',
        message: '5 minutes remaining!',
      },
    });

    client.recallBreakout(30);
    expect(sentMessages[3]).toMatchObject({
      type: 'host.action',
      payload: { action: 'breakout_recall', noticeSeconds: 30 },
    });

    client.endBreakout();
    expect(sentMessages[4]).toMatchObject({
      type: 'host.action',
      payload: { action: 'breakout_end' },
    });

    // 2. Poll methods
    client.createPoll({
      question: 'Which framework?',
      options: ['React', 'Vue'],
      isQuiz: false,
    });
    expect(sentMessages[5]).toMatchObject({
      type: 'poll.create',
      payload: {
        question: 'Which framework?',
        options: ['React', 'Vue'],
      },
    });

    client.votePoll('poll-123', [0]);
    expect(sentMessages[6]).toMatchObject({
      type: 'poll.vote',
      payload: { pollId: 'poll-123', optionIndices: [0] },
    });

    client.closePoll('poll-123');
    expect(sentMessages[7]).toMatchObject({
      type: 'poll.close',
      payload: { pollId: 'poll-123' },
    });

    // 3. FormIT methods
    client.launchFormIt(
      'https://form-it-sandy.vercel.app/f/my-survey',
      'Survey',
    );
    expect(sentMessages[8]).toMatchObject({
      type: 'formit.launch',
      payload: {
        formUrl: 'https://form-it-sandy.vercel.app/f/my-survey',
        title: 'Survey',
      },
    });

    client.submitFormIt('formit-session-1', 'edit-key-abc');
    expect(sentMessages[9]).toMatchObject({
      type: 'formit.submit',
      payload: { id: 'formit-session-1', editKey: 'edit-key-abc' },
    });

    client.closeFormIt('formit-session-1');
    expect(sentMessages[10]).toMatchObject({
      type: 'formit.close',
      payload: { id: 'formit-session-1' },
    });

    // 4. Q&A methods
    client.askQuestion('Can we share slides?');
    expect(sentMessages[11]).toMatchObject({
      type: 'qa.ask',
      payload: { question: 'Can we share slides?' },
    });

    client.upvoteQuestion('qa-1');
    expect(sentMessages[12]).toMatchObject({
      type: 'qa.upvote',
      payload: { questionId: 'qa-1' },
    });

    client.answerQuestion('qa-1', true);
    expect(sentMessages[13]).toMatchObject({
      type: 'qa.answer',
      payload: { questionId: 'qa-1', answered: true },
    });

    // 5. Whiteboard, Notes, Timer
    client.sendWhiteboardAction({
      id: 'act-clear',
      peerId: 'p1',
      type: 'clear',
      color: '#fff',
      size: 2,
      points: [],
      ts: 1731142800000,
    });
    expect(sentMessages[14]).toMatchObject({
      type: 'whiteboard.action',
      payload: { type: 'clear' },
    });

    client.updateSharedNotes('Updated notes content', 2);
    expect(sentMessages[15]).toMatchObject({
      type: 'notes.update',
      payload: { content: 'Updated notes content', version: 2 },
    });

    client.sendTimerAction({ action: 'start', durationSeconds: 300 });
    expect(sentMessages[16]).toMatchObject({
      type: 'timer.action',
      payload: { action: 'start', durationSeconds: 300 },
    });

    // 6. Enhanced Chat with attachments & reactions
    client.sendChatMessage({
      text: 'Check this diagram',
      replyToId: 'msg-0',
      mentions: ['Bob'],
      file: {
        name: 'spec.pdf',
        size: 1024,
        url: 'data:application/pdf;base64,...',
        mime: 'application/pdf',
      },
    });
    expect(sentMessages[17]).toMatchObject({
      type: 'chat.send',
      payload: {
        text: 'Check this diagram',
        replyToId: 'msg-0',
        mentions: ['Bob'],
        file: { name: 'spec.pdf', size: 1024 },
      },
    });

    client.sendChatReaction('msg-0', '🚀');
    expect(sentMessages[18]).toMatchObject({
      type: 'chat.reaction',
      payload: { messageId: 'msg-0', emoji: '🚀' },
    });

    client.lowerHand('peer-99');
    expect(sentMessages[19]).toMatchObject({
      type: 'host.action',
      payload: { action: 'lower_hand', targetPeerId: 'peer-99' },
    });
  });
});
