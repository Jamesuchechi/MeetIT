import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_REGEX,
  clientMessageSchema,
  computeBackoffMs,
  generateRoomCode,
  normalizeRoomCode,
} from './index.js';

describe('protocol schemas and utilities', () => {
  it('accepts a join envelope with a valid room code and optional selfId', () => {
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'join',
        payload: {
          roomCode: 'abc-defg-hij',
          displayName: 'Ada',
          token: 'guest-token',
          selfId: '550e8400-e29b-41d4-a716-446655440000',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects malformed room codes and unknown message types', () => {
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'join',
        payload: { roomCode: 'bad', displayName: 'Ada', token: 'x' },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ v: 1, type: 'unknown', payload: {} })
        .success,
    ).toBe(false);
  });

  it('generates and normalizes valid room codes', () => {
    const code = generateRoomCode();
    expect(ROOM_CODE_REGEX.test(code)).toBe(true);
    expect(normalizeRoomCode('  ABCDEfghij ')).toBe('abc-defg-hij');
    expect(normalizeRoomCode('https://meetit.app/m/kbt-mpxw-nqy')).toBe(
      'kbt-mpxw-nqy',
    );
    expect(normalizeRoomCode('123')).toBeNull();
  });

  it('computes exponential backoff with bounds and optional jitter', () => {
    expect(computeBackoffMs(0, { baseMs: 500, jitter: false })).toBe(500);
    expect(computeBackoffMs(1, { baseMs: 500, jitter: false })).toBe(1000);
    expect(computeBackoffMs(2, { baseMs: 500, jitter: false })).toBe(2000);
    expect(
      computeBackoffMs(10, { baseMs: 500, maxMs: 10000, jitter: false }),
    ).toBe(10000);

    const jittered = computeBackoffMs(2, {
      baseMs: 1000,
      jitter: true,
      randomFn: () => 0.5,
    });
    expect(jittered).toBe(4000);
  });

  it('validates Phase 6 collaboration client messages', () => {
    // Poll creation
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'poll.create',
        payload: {
          question: 'What is your favorite feature?',
          options: [
            'Breakout rooms',
            'FormIT integration',
            'Shared whiteboard',
          ],
          isQuiz: false,
        },
      }).success,
    ).toBe(true);

    // FormIT launch
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'formit.launch',
        payload: {
          formUrl: 'https://form-it-sandy.vercel.app/f/team-feedback',
          title: 'Team Feedback Form',
        },
      }).success,
    ).toBe(true);

    // Breakout action
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'breakout_create',
          rooms: [
            { name: 'Room Alpha', peerIds: [] },
            { name: 'Room Beta', peerIds: [] },
          ],
          durationMinutes: 15,
        },
      }).success,
    ).toBe(true);

    // Q&A
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'qa.ask',
        payload: {
          question: 'Will recordings include breakout room transcripts?',
        },
      }).success,
    ).toBe(true);

    // Whiteboard action
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'whiteboard.action',
        payload: {
          id: 'stroke-1',
          type: 'stroke',
          color: '#3b82f6',
          size: 3,
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
          peerId: '550e8400-e29b-41d4-a716-446655440000',
          ts: Date.now(),
        },
      }).success,
    ).toBe(true);
  });

  it('validates Phase 7 webinar and broadcast schemas', () => {
    // Webinar Go Live & Stream Start
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_go_live',
        },
      }).success,
    ).toBe(true);

    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_stream_start',
          rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: 'xxxx-xxxx-xxxx-xxxx',
          hlsUrl: 'https://live.meetit.app/hls/test-room.m3u8',
        },
      }).success,
    ).toBe(true);

    // Webinar role change (promoting a viewer to panelist)
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_role_change',
          peerId: '550e8400-e29b-41d4-a716-446655440000',
          role: 'panelist',
        },
      }).success,
    ).toBe(true);

    // Moderated Q&A ask & moderate
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'webinar.qa_ask',
        payload: {
          question: 'What is the pricing model for global enterprise tiers?',
        },
      }).success,
    ).toBe(true);

    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_qa_moderate',
          questionId: 'qa-999',
          status: 'approved',
        },
      }).success,
    ).toBe(true);

    // Simulive synchronization
    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'host.action',
        payload: {
          action: 'webinar_simulive_sync',
          positionSec: 125.5,
          playing: true,
        },
      }).success,
    ).toBe(true);
  });

  it('validates Phase 9 developer platform and webhook schemas', async () => {
    const {
      apiKeySchema,
      createRoomApiRequestSchema,
      createRoomApiResponseSchema,
      webhookSubscriptionSchema,
      webhookPayloadSchema,
    } = await import('./index.js');

    // API Key schema
    expect(
      apiKeySchema.safeParse({
        id: 'key_123',
        name: 'Production Backend Key',
        keyPrefix: 'mkit_live_9f8e',
        hashedSecret:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        scopes: ['rooms:read', 'rooms:write', 'recordings:read'],
        createdAt: Date.now(),
      }).success,
    ).toBe(true);

    // Create Room API Request & Response
    expect(
      createRoomApiRequestSchema.safeParse({
        title: 'Board Meeting Q4',
        maxParticipants: 50,
        features: {
          recording: true,
          transcription: true,
          breakout: true,
        },
        expiresInHours: 24,
      }).success,
    ).toBe(true);

    expect(
      createRoomApiResponseSchema.safeParse({
        roomCode: 'abc-defg-hij',
        roomUrl: 'https://meetit.app/m/abc-defg-hij',
        hostUrl: 'https://meetit.app/m/abc-defg-hij?token=host-token-123',
        hostToken: 'host-token-123',
        guestToken: 'guest-token-456',
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      }).success,
    ).toBe(true);

    // Webhook Subscription & Payload
    expect(
      webhookSubscriptionSchema.safeParse({
        id: 'wh_sub_001',
        url: 'https://api.example.com/webhooks/meetit',
        secret: 'whsec_abcdef1234567890',
        events: ['meeting.started', 'recording.ready'],
        active: true,
        createdAt: Date.now(),
      }).success,
    ).toBe(true);

    expect(
      webhookPayloadSchema.safeParse({
        id: 'evt_999',
        event: 'recording.ready',
        timestamp: Date.now(),
        data: {
          roomCode: 'abc-defg-hij',
          recordingUrl: 'https://cdn.meetit.app/recordings/abc.mp4',
          durationSeconds: 1840,
        },
        attempt: 1,
      }).success,
    ).toBe(true);
  });
});
