import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_REGEX,
  clientMessageSchema,
  computeBackoffMs,
  generateRoomCode,
  normalizeRoomCode,
  deviceHandoffStateSchema,
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

  it('validates Phase 10 security, privacy, and compliance schemas', async () => {
    const {
      e2eeSasVerificationSchema,
      e2eeKeyExchangePayloadSchema,
      e2eeStateSchema,
      auditLogEntrySchema,
      dataResidencyRegionSchema,
      abuseReportPayloadSchema,
      passkeyCredentialSchema,
      userSessionSchema,
      twoFactorConfigSchema,
      soc2ControlSchema,
      enterpriseSsoConfigSchema,
      scimUserSchema,
      enterpriseControlsSchema,
      vulnerabilityReportSchema,
    } = await import('./index.js');

    // E2EE SAS verification
    expect(
      e2eeSasVerificationSchema.safeParse({
        sasWords: ['ALPHA', 'FALCON', 'RIVER', 'SHIELD'],
        sasIcons: ['shield', 'zap', 'waves', 'key'],
        fingerprint: 'e3b0c44298fc1c149afbf4c8996fb924',
        epoch: 1,
      }).success,
    ).toBe(true);

    // E2EE Key exchange
    expect(
      e2eeKeyExchangePayloadSchema.safeParse({
        peerId: 'peer_123',
        epoch: 0,
        publicKey: 'pub_base64_encoded_key_material',
        algorithm: 'AES-GCM',
      }).success,
    ).toBe(true);

    // E2EE State
    expect(
      e2eeStateSchema.safeParse({
        enabled: true,
        verified: true,
        epoch: 2,
        sas: {
          sasWords: ['BRAVO', 'TIGER', 'SUMMIT', 'FLAME'],
          sasEmoji: ['💎', '🚀', '🔥', '🌟'],
          fingerprint: '4a8a08f09d37b73795649038408b5f33',
          epoch: 2,
        },
        peerFingerprints: { peer_123: '4a8a08f09d37b73795649038408b5f33' },
      }).success,
    ).toBe(true);

    // Audit Log Entry
    expect(
      auditLogEntrySchema.safeParse({
        id: 'audit_01',
        userId: 'user_456',
        action: 'room.lock',
        targetType: 'room',
        targetId: 'abc-defg-hij',
        metadata: { reason: 'Host locked meeting' },
        createdAt: Date.now(),
      }).success,
    ).toBe(true);

    // Data residency regions
    expect(dataResidencyRegionSchema.safeParse('eu-central-1').success).toBe(
      true,
    );
    expect(dataResidencyRegionSchema.safeParse('af-south-1').success).toBe(
      true,
    );
    expect(dataResidencyRegionSchema.safeParse('us-east-1').success).toBe(true);
    expect(dataResidencyRegionSchema.safeParse('ap-southeast-1').success).toBe(
      false,
    );

    // Abuse Report
    expect(
      abuseReportPayloadSchema.safeParse({
        reportedPeerId: 'troll_999',
        roomCode: 'abc-defg-hij',
        category: 'harassment',
        details: 'Disruptive audio behavior and offensive chat',
        timestamp: Date.now(),
      }).success,
    ).toBe(true);

    // Passkey Credential
    expect(
      passkeyCredentialSchema.safeParse({
        id: 'pk_123',
        name: 'MacBook Touch ID',
        credentialId: 'cred_id_base64',
        publicKey: 'pub_key_base64',
        algorithm: -7, // ES256
        createdAt: Date.now(),
      }).success,
    ).toBe(true);

    // User Session
    expect(
      userSessionSchema.safeParse({
        id: 'sess_1',
        current: true,
        browser: 'Chrome 126',
        os: 'macOS Sonoma',
        ipAddress: '197.210.54.12',
        location: 'Lagos, Nigeria',
        lastActiveAt: Date.now(),
        createdAt: Date.now() - 3600000,
      }).success,
    ).toBe(true);

    // 2FA Config
    expect(
      twoFactorConfigSchema.safeParse({
        enabled: true,
        secret: 'JBSWY3DPEHPK3PXP',
        backupCodesCount: 8,
        updatedAt: Date.now(),
      }).success,
    ).toBe(true);

    // SOC 2 Control
    expect(
      soc2ControlSchema.safeParse({
        id: 'CC6.1',
        category: 'security',
        title: 'Logical Access Controls',
        description:
          'Role-based access control and MFA enforced on critical services',
        status: 'implemented',
        evidence: 'Supabase RLS & WebAuthn 2FA',
      }).success,
    ).toBe(true);

    // Enterprise SSO
    expect(
      enterpriseSsoConfigSchema.safeParse({
        id: 'sso_okta_1',
        organizationId: 'org_acme',
        providerType: 'saml',
        idpEntityId: 'http://www.okta.com/exk123456',
        idpSsoUrl: 'https://acme.okta.com/app/meetit/sso/saml',
        idpCertificate:
          '-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz...\n-----END CERTIFICATE-----',
        enforcedDomains: ['acme.com', 'acme.org'],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }).success,
    ).toBe(true);

    // SCIM User
    expect(
      scimUserSchema.safeParse({
        id: 'user_scim_1',
        userName: 'ada.lovelace@acme.com',
        name: {
          givenName: 'Ada',
          familyName: 'Lovelace',
          formatted: 'Ada Lovelace',
        },
        emails: [{ value: 'ada.lovelace@acme.com', primary: true }],
        active: true,
        roles: ['member'],
      }).success,
    ).toBe(true);

    // Enterprise Controls
    expect(
      enterpriseControlsSchema.safeParse({
        organizationId: 'org_acme',
        capturedDomains: ['acme.com'],
        forcedWaitingRoom: true,
        requireHostPresent: true,
        preventGuestScreenshare: true,
        watermarkVideo: false,
        retentionDaysRecordings: 90,
        retentionDaysChat: 30,
        retentionDaysTranscripts: 90,
        dlpEnabled: true,
        dlpRules: [
          {
            id: 'dlp_1',
            name: 'Block Payment Cards',
            category: 'financial_cards',
            pattern: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\\b',
            action: 'block',
            enabled: true,
          },
        ],
        updatedAt: Date.now(),
      }).success,
    ).toBe(true);

    // Vulnerability Report (Bug Bounty)
    expect(
      vulnerabilityReportSchema.safeParse({
        reporterEmail: 'researcher@sec.io',
        reporterName: 'Alex Whitehat',
        targetComponent: 'signaling',
        severity: 'high',
        title: 'Improper room leave validation allows ghost participants',
        vulnerabilityDescription:
          'When socket disconnects abruptly without leave packet, participant heartbeat timer was not terminating correctly under race conditions.',
        stepsToReproduce:
          '1. Connect 2 peers. 2. Terminate socket without TCP close. 3. Observe presence status.',
        status: 'new',
        bountyAmountUsd: 1000,
        createdAt: Date.now(),
      }).success,
    ).toBe(true);
  });

  it('validates Phase 11 device handoff schemas and envelopes', () => {
    const handoffState = {
      handoffToken: 'mkt_handoff_987654321_abc',
      roomCode: 'abc-defg-hij',
      userId: 'user_123',
      displayName: 'Ada Lovelace',
      role: 'host' as const,
      sourceDevice: 'MacBook Pro (Chrome)',
      targetDevice: 'iPhone 15 Pro (Safari)',
      mediaState: {
        audio: true,
        video: false,
      },
      nonce: 'nonce_xyz_789',
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      status: 'pending' as const,
    };

    expect(deviceHandoffStateSchema.safeParse(handoffState).success).toBe(true);

    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'handoff.initiate',
        payload: {
          token: 'mkt_handoff_987654321_abc',
          handoffState,
        },
      }).success,
    ).toBe(true);

    expect(
      clientMessageSchema.safeParse({
        v: 1,
        type: 'handoff.complete',
        payload: {
          token: 'mkt_handoff_987654321_abc',
          targetDevice: 'iPhone 15 Pro (Safari)',
          completedBy: 'user_123',
        },
      }).success,
    ).toBe(true);
  });
});
