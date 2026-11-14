import { z } from 'zod';

export const ROOM_CODE_REGEX = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const ROOM_CODE_CHARSET = 'abcdefghjkmnpqrstuvwxyz';

export function generateRoomCode(randomFn: () => number = Math.random): string {
  const pick = (length: number): string => {
    let out = '';
    for (let i = 0; i < length; i++) {
      const idx = Math.floor(randomFn() * ROOM_CODE_CHARSET.length);
      out += ROOM_CODE_CHARSET[idx] ?? 'a';
    }
    return out;
  };
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

export function normalizeRoomCode(input: string): string | null {
  const cleaned = String(input).toLowerCase().trim();
  const match = cleaned.match(/[a-z]{3}-?[a-z]{4}-?[a-z]{3}/);
  if (!match) return null;
  const raw = match[0].replace(/-/g, '');
  return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7)}`;
}

export function computeBackoffMs(
  attempt: number,
  options: {
    baseMs?: number;
    maxMs?: number;
    jitter?: boolean;
    randomFn?: () => number;
  } = {},
): number {
  const baseMs = options.baseMs ?? 500;
  const maxMs = options.maxMs ?? 15000;
  const jitter = options.jitter ?? true;
  const randomFn = options.randomFn ?? Math.random;

  const clampedAttempt = Math.max(0, Math.min(attempt, 10));
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, clampedAttempt));
  if (!jitter) {
    return exponential;
  }
  const jitterOffset = exponential * 0.25 * (randomFn() * 2 - 1);
  return Math.max(100, Math.round(exponential + jitterOffset));
}

export const peerRoleSchema = z.enum([
  'host',
  'cohost',
  'attendee',
  'guest',
  'panelist',
  'viewer',
]);
export type PeerRole = z.infer<typeof peerRoleSchema>;

export const reactionEmojiSchema = z.string().min(1).max(32);
export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;

export const peerStateSchema = z.object({
  audio: z.boolean(),
  video: z.boolean(),
  screen: z.boolean(),
  handRaised: z.boolean(),
});
export type PeerState = z.infer<typeof peerStateSchema>;

export const peerInfoSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  role: peerRoleSchema,
  verified: z.boolean().optional(),
  state: peerStateSchema,
});
export type PeerInfo = z.infer<typeof peerInfoSchema>;

export const roomPermissionsSchema = z.object({
  waitingRoom: z.boolean(),
  allowGuestChat: z.boolean(),
  allowGuestScreenShare: z.boolean(),
  allowGuestReactions: z.boolean(),
});
export type RoomPermissions = z.infer<typeof roomPermissionsSchema>;

export const waitingPeerSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  role: peerRoleSchema,
  verified: z.boolean().optional(),
  requestedAt: z.number(),
});
export type WaitingPeer = z.infer<typeof waitingPeerSchema>;

export const chatAttachmentSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(0),
  url: z.string(),
  mime: z.string().max(100),
});
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().optional(),
  from: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  text: z.string().max(4000),
  ts: z.number(),
  replyToId: z.string().optional(),
  mentions: z.array(z.string()).optional(),
  file: chatAttachmentSchema.optional(),
  reactions: z.record(z.string(), z.array(z.string())).optional(),
});
export type ChatMessagePayload = z.infer<typeof chatMessageSchema>;

// Breakout rooms
export const breakoutRoomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  peerIds: z.array(z.string().uuid()).default([]),
});
export type BreakoutRoom = z.infer<typeof breakoutRoomSchema>;

export const breakoutStateSchema = z.object({
  active: z.boolean(),
  rooms: z.array(breakoutRoomSchema),
  timerEndsAt: z.number().optional(),
  returnNoticeSeconds: z.number().optional(),
});
export type BreakoutState = z.infer<typeof breakoutStateSchema>;

// Polls & Quizzes
export const pollItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(10),
  isQuiz: z.boolean().optional(),
  correctOptionIndex: z.number().int().min(0).max(9).optional(),
  allowMultiple: z.boolean().optional(),
  createdBy: z.string().uuid(),
  creatorName: z.string().min(1).max(80),
  createdAt: z.number(),
  closed: z.boolean(),
  votes: z.record(z.string().uuid(), z.array(z.number().int())),
});
export type PollItem = z.infer<typeof pollItemSchema>;

// FormIT Integration
export const formItSessionSchema = z.object({
  id: z.string().min(1),
  formUrl: z.string().url(),
  slug: z.string().min(1),
  title: z.string().optional(),
  active: z.boolean(),
  launchedAt: z.number(),
  submissionsCount: z.number().int().min(0),
  responses: z
    .array(
      z.object({
        peerId: z.string().uuid().optional(),
        displayName: z.string().optional(),
        submittedAt: z.number(),
        editKey: z.string().nullable().optional(),
      }),
    )
    .default([]),
});
export type FormItSession = z.infer<typeof formItSessionSchema>;

// Q&A
export const qaItemSchema = z.object({
  id: z.string().min(1),
  peerId: z.string().uuid(),
  displayName: z.string().min(1).max(80),
  question: z.string().min(1).max(1000),
  ts: z.number(),
  upvotes: z.array(z.string().uuid()).default([]),
  answered: z.boolean(),
  answeredAt: z.number().optional(),
  dismissed: z.boolean().optional(),
});
export type QaItem = z.infer<typeof qaItemSchema>;

// Hand Raise Queue
export const handRaiseItemSchema = z.object({
  peerId: z.string().uuid(),
  displayName: z.string().min(1).max(80),
  raisedAt: z.number(),
});
export type HandRaiseItem = z.infer<typeof handRaiseItemSchema>;

// Shared Whiteboard
export const whiteboardActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['stroke', 'rect', 'circle', 'text', 'clear']),
  color: z.string().min(1).max(32),
  size: z.number().min(1).max(50),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  text: z.string().max(500).optional(),
  peerId: z.string().uuid(),
  ts: z.number(),
});
export type WhiteboardAction = z.infer<typeof whiteboardActionSchema>;

// Shared Collaborative Notes
export const notesDocSchema = z.object({
  content: z.string().max(50000),
  version: z.number().int().min(0),
  lastUpdatedBy: z.string().optional(),
  lastUpdatedAt: z.number(),
});
export type NotesDoc = z.infer<typeof notesDocSchema>;

// Agenda & Timers
export const agendaItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  durationMinutes: z.number().min(1).max(180),
  completed: z.boolean(),
});
export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const meetingTimerSchema = z.object({
  type: z.enum(['stopwatch', 'countdown']),
  running: z.boolean(),
  durationSeconds: z.number().int().min(0),
  startedAt: z.number().optional(),
  remainingSeconds: z.number().int().min(0).optional(),
  agenda: z.array(agendaItemSchema).default([]),
  activeAgendaIndex: z.number().int().min(0).optional(),
});
export type MeetingTimer = z.infer<typeof meetingTimerSchema>;

// Phase 7: Webinar and Broadcast
export const webinarSpeakerBioSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  company: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(1000).optional(),
});
export type WebinarSpeakerBio = z.infer<typeof webinarSpeakerBioSchema>;

export const webinarBrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  primaryColor: z.string().max(32).optional(),
  backgroundColor: z.string().max(32).optional(),
  headline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  speakerBios: z.array(webinarSpeakerBioSchema).default([]),
});
export type WebinarBranding = z.infer<typeof webinarBrandingSchema>;

export const webinarStreamOutSchema = z.object({
  enabled: z.boolean().default(false),
  rtmpUrl: z.string().max(500).optional(),
  streamKey: z.string().max(500).optional(),
  hlsUrl: z.string().max(500).optional(),
  status: z.enum(['idle', 'starting', 'live', 'error']).default('idle'),
  error: z.string().optional(),
  viewersCount: z.number().int().min(0).default(0),
});
export type WebinarStreamOut = z.infer<typeof webinarStreamOutSchema>;

export const webinarSimuliveSchema = z.object({
  enabled: z.boolean().default(false),
  videoUrl: z.string().optional(),
  title: z.string().max(200).optional(),
  durationSeconds: z.number().min(0).default(0),
  currentPositionSec: z.number().min(0).default(0),
  playing: z.boolean().default(false),
  startedAtMs: z.number().optional(),
});
export type WebinarSimulive = z.infer<typeof webinarSimuliveSchema>;

export const webinarRegistrationFieldSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'email', 'select', 'checkbox']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
});
export type WebinarRegistrationField = z.infer<
  typeof webinarRegistrationFieldSchema
>;

export const webinarRegistrationSchema = z.object({
  id: z.string().min(1),
  roomCode: z.string(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['panelist', 'viewer']).default('viewer'),
  customAnswers: z
    .record(z.string(), z.union([z.string(), z.boolean()]))
    .default({}),
  status: z.enum(['pending', 'approved', 'rejected']).default('approved'),
  joinToken: z.string().min(8),
  paid: z.boolean().default(false),
  ticketPriceCents: z.number().int().min(0).default(0),
  currency: z.enum(['USD', 'NGN', 'EUR', 'GBP']).default('USD'),
  paymentProvider: z
    .enum(['free', 'stripe', 'paystack', 'flutterwave'])
    .default('free'),
  registeredAt: z.number(),
  joinedAt: z.number().optional(),
  leaveAt: z.number().optional(),
  engagementScore: z.number().min(0).max(100).default(0),
});
export type WebinarRegistration = z.infer<typeof webinarRegistrationSchema>;

export const webinarStateSchema = z.object({
  enabled: z.boolean().default(false),
  practiceMode: z.boolean().default(true),
  isLive: z.boolean().default(false),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  maxViewers: z.number().int().default(5000),
  viewerCount: z.number().int().default(0),
  peakViewers: z.number().int().default(0),
  branding: webinarBrandingSchema.optional(),
  streamOut: webinarStreamOutSchema.optional(),
  simulive: webinarSimuliveSchema.optional(),
  requireRegistration: z.boolean().default(false),
  autoApproveRegistrations: z.boolean().default(true),
  ticketPriceCents: z.number().int().default(0),
  currency: z.enum(['USD', 'NGN', 'EUR', 'GBP']).default('USD'),
  paymentProvider: z
    .enum(['free', 'stripe', 'paystack', 'flutterwave'])
    .default('free'),
  customFields: z.array(webinarRegistrationFieldSchema).default([]),
});
export type WebinarState = z.infer<typeof webinarStateSchema>;

export const webinarQaItemSchema = z.object({
  id: z.string().min(1),
  authorPeerId: z.string(),
  authorName: z.string().min(1).max(80),
  question: z.string().min(1).max(1000),
  createdAt: z.number(),
  upvotes: z.array(z.string()).default([]),
  status: z
    .enum(['pending', 'approved', 'dismissed', 'answered'])
    .default('pending'),
  answeredBy: z.string().optional(),
  answer: z.string().optional(),
  answeredAt: z.number().optional(),
});
export type WebinarQaItem = z.infer<typeof webinarQaItemSchema>;

export const captionCueSchema = z.object({
  id: z.string().min(1),
  from: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  text: z.string().min(1).max(2000),
  ts: z.number(),
  isFinal: z.boolean(),
  language: z.string().max(16).optional(),
});
export type CaptionCuePayload = z.infer<typeof captionCueSchema>;

export const customVocabularyItemSchema = z.object({
  id: z.string().optional(),
  term: z.string().min(1).max(100),
  soundsLike: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
});
export type CustomVocabularyItem = z.infer<typeof customVocabularyItemSchema>;

export const sdpSchema = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().optional(),
});
export type SdpPayload = z.infer<typeof sdpSchema>;

export const iceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});
export type IceCandidatePayload = z.infer<typeof iceCandidateSchema>;

export const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServerConfig = z.infer<typeof iceServerSchema>;

export const errorCodeSchema = z.enum([
  'ROOM_NOT_FOUND',
  'ROOM_LOCKED',
  'ROOM_FULL',
  'NOT_ADMITTED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'INVALID_MESSAGE',
  'PROTOCOL_VERSION',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const hostActionPayloadSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mute'),
    targetPeerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('mute_all'),
  }),
  z.object({
    action: z.literal('ask_unmute'),
    targetPeerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('remove'),
    targetPeerId: z.string().uuid(),
    block: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('set_role'),
    targetPeerId: z.string().uuid(),
    role: z.enum(['host', 'cohost', 'attendee']),
  }),
  z.object({
    action: z.literal('set_locked'),
    locked: z.boolean(),
  }),
  z.object({
    action: z.literal('set_permissions'),
    permissions: roomPermissionsSchema.partial(),
  }),
  z.object({
    action: z.literal('admit'),
    targetPeerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('deny'),
    targetPeerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('admit_all'),
  }),
  z.object({
    action: z.literal('end_meeting'),
  }),
  z.object({
    action: z.literal('start_recording'),
    layout: z.enum(['grid', 'speaker']).optional(),
    audioOnly: z.boolean().optional(),
    isoTracks: z.boolean().optional(),
    retentionDays: z.number().int().min(1).max(3650).optional(),
  }),
  z.object({
    action: z.literal('stop_recording'),
  }),
  z.object({
    action: z.literal('breakout_create'),
    rooms: z
      .array(
        z.object({
          name: z.string().min(1).max(50),
          peerIds: z.array(z.string().uuid()).default([]),
        }),
      )
      .min(1)
      .max(50),
    durationMinutes: z.number().int().min(1).max(180).optional(),
  }),
  z.object({
    action: z.literal('breakout_assign'),
    roomId: z.string().min(1),
    peerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('breakout_start'),
  }),
  z.object({
    action: z.literal('breakout_broadcast'),
    message: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal('breakout_recall'),
    noticeSeconds: z.number().int().min(0).max(120).default(30),
  }),
  z.object({
    action: z.literal('breakout_end'),
  }),
  z.object({
    action: z.literal('lower_hand'),
    targetPeerId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('webinar_go_live'),
  }),
  z.object({
    action: z.literal('webinar_end_live'),
  }),
  z.object({
    action: z.literal('webinar_stream_start'),
    rtmpUrl: z.string().optional(),
    streamKey: z.string().optional(),
    hlsUrl: z.string().optional(),
  }),
  z.object({
    action: z.literal('webinar_stream_stop'),
  }),
  z.object({
    action: z.literal('webinar_simulive_sync'),
    positionSec: z.number().min(0),
    playing: z.boolean(),
  }),
  z.object({
    action: z.literal('webinar_qa_moderate'),
    questionId: z.string(),
    status: z.enum(['pending', 'approved', 'dismissed', 'answered']),
    answer: z.string().optional(),
  }),
  z.object({
    action: z.literal('webinar_role_change'),
    peerId: z.string().uuid(),
    role: z.enum(['panelist', 'viewer', 'cohost', 'host', 'attendee']),
  }),
  z.object({
    action: z.literal('webinar_config_update'),
    config: webinarStateSchema.partial(),
  }),
]);
export type HostActionPayload = z.infer<typeof hostActionPayloadSchema>;

export const deviceHandoffStatusSchema = z.enum([
  'pending',
  'claimed',
  'completed',
  'expired',
]);

export const deviceHandoffStateSchema = z.object({
  handoffToken: z.string().min(1),
  roomCode: z.string().regex(ROOM_CODE_REGEX),
  userId: z.string().min(1),
  displayName: z.string().min(1).max(80),
  role: peerRoleSchema.default('guest'),
  sourceDevice: z.string().min(1).max(120),
  targetDevice: z.string().max(120).optional(),
  mediaState: z.object({
    audio: z.boolean(),
    video: z.boolean(),
    screen: z.boolean().optional(),
  }),
  nonce: z.string().min(1),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  status: deviceHandoffStatusSchema.default('pending'),
});

export type DeviceHandoffStatus = z.infer<typeof deviceHandoffStatusSchema>;
export type DeviceHandoffState = z.infer<typeof deviceHandoffStateSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('join'),
    payload: z.object({
      roomCode: z.string().regex(ROOM_CODE_REGEX),
      displayName: z.string().trim().min(1).max(80),
      token: z.string().min(1),
      passcode: z.string().max(64).optional(),
      selfId: z.string().uuid().optional(),
      lastChatSeq: z.number().int().min(0).optional(),
      state: peerStateSchema.optional(),
      capabilities: z.array(z.string()).default([]),
      preferredRegion: z.string().optional(),
      requestedRole: peerRoleSchema.optional(),
      webinarToken: z.string().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('leave'),
    payload: z.object({}),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.enum(['signal.offer', 'signal.answer']),
    payload: z.object({ to: z.string().uuid(), sdp: sdpSchema }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('signal.ice'),
    payload: z.object({ to: z.string().uuid(), candidate: iceCandidateSchema }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('state.update'),
    payload: peerStateSchema,
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('chat.send'),
    payload: z.object({
      text: z.string().max(4000).default(''),
      to: z.string().uuid().optional(),
      replyToId: z.string().optional(),
      mentions: z.array(z.string()).optional(),
      file: chatAttachmentSchema.optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('chat.reaction'),
    payload: z.object({
      messageId: z.string().min(1),
      emoji: reactionEmojiSchema,
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('poll.create'),
    payload: z.object({
      question: z.string().min(1).max(500),
      options: z.array(z.string().min(1).max(200)).min(2).max(10),
      isQuiz: z.boolean().optional(),
      correctOptionIndex: z.number().int().min(0).max(9).optional(),
      allowMultiple: z.boolean().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('poll.vote'),
    payload: z.object({
      pollId: z.string().min(1),
      optionIndices: z.array(z.number().int().min(0).max(9)).min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('poll.close'),
    payload: z.object({
      pollId: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('poll.delete'),
    payload: z.object({
      pollId: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('formit.launch'),
    payload: z.object({
      formUrl: z.string().url(),
      title: z.string().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('formit.close'),
    payload: z.object({
      id: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('formit.submit'),
    payload: z.object({
      id: z.string().min(1),
      editKey: z.string().nullable().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('qa.ask'),
    payload: z.object({
      question: z.string().min(1).max(1000),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('qa.upvote'),
    payload: z.object({
      questionId: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('qa.answer'),
    payload: z.object({
      questionId: z.string().min(1),
      answered: z.boolean(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('qa.dismiss'),
    payload: z.object({
      questionId: z.string().min(1),
      dismissed: z.boolean(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('qa.delete'),
    payload: z.object({
      questionId: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('whiteboard.action'),
    payload: whiteboardActionSchema,
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('notes.update'),
    payload: z.object({
      content: z.string().max(50000),
      version: z.number().int().min(0),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('timer.action'),
    payload: z.object({
      action: z.enum([
        'start',
        'pause',
        'reset',
        'set_countdown',
        'next_agenda',
        'set_agenda',
      ]),
      durationSeconds: z.number().int().min(0).optional(),
      agenda: z.array(agendaItemSchema).optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('breakout.join'),
    payload: z.object({
      roomId: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('breakout.leave'),
    payload: z.object({}),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('presentation.cursor'),
    payload: z.object({
      x: z.number(),
      y: z.number(),
      active: z.boolean(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('reaction.send'),
    payload: z.object({
      emoji: reactionEmojiSchema,
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('webinar.qa_ask'),
    payload: z.object({
      question: z.string().min(1).max(1000),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('webinar.qa_upvote'),
    payload: z.object({
      questionId: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('caption.send'),
    payload: z.object({
      text: z.string().trim().min(1).max(2000),
      isFinal: z.boolean(),
      language: z.string().max(16).optional(),
      cueId: z.string().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('host.action'),
    payload: hostActionPayloadSchema,
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('handoff.initiate'),
    payload: z.object({
      token: z.string().min(1),
      handoffState: deviceHandoffStateSchema,
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('handoff.claim'),
    payload: z.object({
      token: z.string().min(1),
      targetDevice: z.string().min(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('handoff.complete'),
    payload: z.object({
      token: z.string().min(1),
      targetDevice: z.string().min(1),
      completedBy: z.string().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('transport.failed'),
    payload: z.object({
      provider: z.enum(['livekit', 'jitsi', 'agora']),
      reason: z.string().max(500).optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('moderator.configure'),
    payload: z.object({
      enabled: z.boolean(),
      talkTimeThresholdPct: z.number().min(50).max(95).optional(),
      toxicityCheck: z.boolean().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('agenda.park_tangent'),
    payload: z.object({
      text: z.string().trim().min(1).max(1000),
      agendaItemId: z.string().optional(),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('space.move'),
    payload: z.object({
      x: z.number().min(0).max(2000),
      y: z.number().min(0).max(2000),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('avatar.landmarks'),
    payload: z.object({
      yaw: z.number().min(-180).max(180),
      pitch: z.number().min(-180).max(180),
      roll: z.number().min(-180).max(180),
      mouthOpen: z.number().min(0).max(1),
      blinkLeft: z.number().min(0).max(1),
      blinkRight: z.number().min(0).max(1),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('xr.pose'),
    payload: z.object({
      position: z.tuple([z.number(), z.number(), z.number()]),
      quaternion: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    }),
  }),
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('ping'),
    payload: z.object({}),
  }),
]);

export const mediaProviderNameSchema = z.enum(['livekit', 'jitsi', 'agora']);
export type MediaProviderName = z.infer<typeof mediaProviderNameSchema>;

export const liveKitRegionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pingUrl: z.string().min(1),
  isDefault: z.boolean().optional(),
  cascadesTo: z.array(z.string()).optional(),
  country: z.string().optional(),
});
export type LiveKitRegion = z.infer<typeof liveKitRegionSchema>;

export const livekitConfigSchema = z.object({
  url: z.string().min(1),
  token: z.string().min(1),
  region: z.string().optional(),
});
export type LivekitConfig = z.infer<typeof livekitConfigSchema>;

export const jitsiConfigSchema = z.object({
  domain: z.string().min(1),
  roomName: z.string().min(1),
  jwt: z.string().optional(),
  mucDomain: z.string().optional(),
  serviceUrl: z.string().optional(),
});
export type JitsiConfig = z.infer<typeof jitsiConfigSchema>;

export const agoraConfigSchema = z.object({
  appId: z.string().min(1),
  channel: z.string().min(1),
  token: z.string().min(1),
  uid: z.string().min(1),
});
export type AgoraConfig = z.infer<typeof agoraConfigSchema>;

export const mediaProviderConfigSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('livekit'),
    url: z.string().min(1),
    token: z.string().min(1),
    region: z.string().optional(),
  }),
  z.object({
    provider: z.literal('jitsi'),
    domain: z.string().min(1),
    roomName: z.string().min(1),
    jwt: z.string().optional(),
    mucDomain: z.string().optional(),
    serviceUrl: z.string().optional(),
  }),
  z.object({
    provider: z.literal('agora'),
    appId: z.string().min(1),
    channel: z.string().min(1),
    token: z.string().min(1),
    uid: z.string().min(1),
  }),
]);
export type MediaProviderConfig = z.infer<typeof mediaProviderConfigSchema>;

export const serverJoinedPayloadSchema = z.object({
  selfId: z.string().uuid(),
  role: peerRoleSchema,
  peers: z.array(peerInfoSchema),
  iceServers: z.array(iceServerSchema),
  transport: z.enum(['mesh', 'sfu']),
  activeProvider: mediaProviderNameSchema.optional(),
  providers: z.array(mediaProviderConfigSchema).optional(),
  livekit: livekitConfigSchema.optional(),
  region: z.string().optional(),
  roomState: z.object({
    locked: z.boolean(),
    hostId: z.string().uuid().nullable(),
    title: z.string().optional(),
    description: z.string().optional(),
    permissions: roomPermissionsSchema.optional(),
    waitingPeers: z.array(waitingPeerSchema).optional(),
    chatHistory: z.array(chatMessageSchema).optional(),
    recording: z.boolean().optional(),
    recordingStartedAt: z.number().optional(),
    breakout: breakoutStateSchema.optional(),
    polls: z.array(pollItemSchema).optional(),
    qa: z.array(qaItemSchema).optional(),
    formit: formItSessionSchema.nullable().optional(),
    handRaiseQueue: z.array(handRaiseItemSchema).optional(),
    whiteboardHistory: z.array(whiteboardActionSchema).optional(),
    notes: notesDocSchema.optional(),
    timer: meetingTimerSchema.optional(),
    webinar: webinarStateSchema.optional(),
    moderatedQa: z.array(webinarQaItemSchema).optional(),
  }),
});

export type ServerJoinedPayload = z.infer<typeof serverJoinedPayloadSchema>;

export const serverMessageSchema = z.object({
  v: z.literal(1),
  id: z.string().uuid().optional(),
  ts: z.number().optional(),
  type: z.string().min(1),
  payload: z.unknown(),
});

export const envelopeSchema = serverMessageSchema;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;

export interface HostCommandEvent {
  command: 'mute' | 'ask_unmute' | 'removed' | 'meeting_ended';
  byPeerId: string;
  byDisplayName: string;
  blocked?: boolean;
}

export interface SignalingEvents {
  joined: ServerJoinedPayload;
  'waiting.room': {
    roomCode: string;
    title?: string;
    message: string;
  };
  'waiting.updated': {
    waitingPeers: WaitingPeer[];
  };
  'peer.joined': { peer: PeerInfo };
  'peer.left': { peerId: string; reason: string };
  'peer.role.updated': {
    peerId: string;
    role: PeerRole;
    hostId: string | null;
  };
  'signal.offer': { from: string; to: string; sdp: SdpPayload };
  'signal.answer': { from: string; to: string; sdp: SdpPayload };
  'signal.ice': { from: string; to: string; candidate: IceCandidatePayload };
  'state.updated': { peerId: string; state: PeerState };
  'chat.message': ChatMessagePayload;
  'chat.reaction.updated': {
    messageId: string;
    reactions: Record<string, string[]>;
  };
  'breakout.updated': BreakoutState;
  'breakout.broadcast': {
    message: string;
    from: string;
    ts: number;
  };
  'poll.updated': {
    poll: PollItem;
  };
  'poll.deleted': {
    pollId: string;
  };
  'formit.updated': FormItSession | null;
  'qa.updated': {
    question: QaItem;
  };
  'qa.deleted': {
    questionId: string;
  };
  'handraise.updated': {
    queue: HandRaiseItem[];
  };
  'whiteboard.action': WhiteboardAction;
  'notes.updated': NotesDoc;
  'timer.updated': MeetingTimer;
  'presentation.cursor': {
    peerId: string;
    displayName: string;
    x: number;
    y: number;
    active: boolean;
  };
  'reaction.received': {
    id: string;
    from: string;
    displayName: string;
    emoji: ReactionEmoji;
    ts: number;
  };
  'caption.cue': {
    id: string;
    from: string;
    displayName: string;
    text: string;
    ts: number;
    isFinal: boolean;
    language?: string | undefined;
  };
  'room.updated': {
    locked: boolean;
    hostId: string | null;
    permissions?: RoomPermissions;
  };
  'transport.promoted': {
    transport: 'sfu';
    livekit: LivekitConfig;
  };
  'transport.switched': {
    provider: MediaProviderName;
    reason?: string;
    livekit?: LivekitConfig;
    jitsi?: JitsiConfig;
    agora?: AgoraConfig;
  };
  'moderator.nudge': {
    id: string;
    kind: 'talk_imbalance' | 'toxicity' | 'agenda_overrun' | 'agenda_drift';
    message: string;
    ts: number;
    targetPeerId?: string;
    suggestedAction?:
      'invite_quiet' | 'mute' | 'park_tangent' | 'advance_agenda';
  };
  'moderator.stats': {
    enabled: boolean;
    talkTimeByPeer: Record<
      string,
      { displayName: string; seconds: number; sharePct: number }
    >;
  };
  'space.positions': {
    positions: Record<string, { x: number; y: number }>;
  };
  'avatar.landmarks': {
    peerId: string;
    yaw: number;
    pitch: number;
    roll: number;
    mouthOpen: number;
    blinkLeft: number;
    blinkRight: number;
  };
  'xr.pose': {
    peerId: string;
    position: [number, number, number];
    quaternion: [number, number, number, number];
  };
  'recording.started': {
    startedAt: number;
    byPeerId: string;
    byDisplayName: string;
    egressId?: string;
    isoTracks?: boolean;
    retentionDays?: number;
    expiresAt?: number;
  };
  'recording.stopped': {
    stoppedAt: number;
    byPeerId: string;
    byDisplayName: string;
    egressId?: string;
    storagePath?: string;
  };
  'host.command': HostCommandEvent;
  'webinar.state': WebinarState;
  'webinar.qa_updated': {
    question: WebinarQaItem;
  };
  'webinar.qa_deleted': {
    questionId: string;
  };
  'webinar.stream_updated': WebinarStreamOut;
  'webinar.simulive_updated': WebinarSimulive;
  'webinar.analytics_updated': {
    viewerCount: number;
    peakViewers: number;
  };
  'handoff.offered': {
    token: string;
    handoffState: DeviceHandoffState;
  };
  'handoff.claimed': {
    token: string;
    targetDevice: string;
  };
  'handoff.transferred': {
    token: string;
    targetDevice: string;
    message: string;
  };
  error: { code: ErrorCode; message: string };
  pong: Record<string, never>;
}

export interface SignalingChannel {
  send(message: ClientMessage): void;
  on<K extends keyof SignalingEvents>(
    type: K,
    handler: (payload: SignalingEvents[K]) => void,
  ): () => void;
}

// ==========================================
// Phase 9: Developer Platform & Webhooks
// ==========================================

export const apiKeyScopeSchema = z.enum([
  'rooms:read',
  'rooms:write',
  'meetings:read',
  'recordings:read',
  'transcripts:read',
  'webhooks:manage',
]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const apiKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  keyPrefix: z.string().min(8),
  hashedSecret: z.string().min(16),
  scopes: z.array(apiKeyScopeSchema),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().optional(),
  expiresAt: z.number().int().optional(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

export const createRoomApiRequestSchema = z.object({
  title: z.string().max(120).optional(),
  maxParticipants: z.number().int().min(2).max(1000).optional(),
  passcode: z.string().max(64).optional(),
  features: z
    .object({
      breakout: z.boolean().optional(),
      recording: z.boolean().optional(),
      transcription: z.boolean().optional(),
      webinar: z.boolean().optional(),
      e2ee: z.boolean().optional(),
    })
    .optional(),
  webhookUrl: z.string().url().optional(),
  expiresInHours: z.number().min(1).max(168).optional(),
});
export type CreateRoomApiRequest = z.infer<typeof createRoomApiRequestSchema>;

export const createRoomApiResponseSchema = z.object({
  roomCode: z.string().regex(ROOM_CODE_REGEX),
  roomUrl: z.string().url(),
  hostUrl: z.string().url(),
  hostToken: z.string().min(1),
  guestToken: z.string().min(1),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
});
export type CreateRoomApiResponse = z.infer<typeof createRoomApiResponseSchema>;

export const webhookEventTypeSchema = z.enum([
  'meeting.started',
  'meeting.ended',
  'participant.joined',
  'participant.left',
  'recording.ready',
  'transcript.ready',
]);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const webhookSubscriptionSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  secret: z.string().min(16),
  events: z.array(webhookEventTypeSchema),
  active: z.boolean(),
  createdAt: z.number().int(),
});
export type WebhookSubscription = z.infer<typeof webhookSubscriptionSchema>;

export const webhookPayloadSchema = z.object({
  id: z.string().min(1),
  event: webhookEventTypeSchema,
  timestamp: z.number().int(),
  data: z.record(z.string(), z.unknown()),
  attempt: z.number().int().min(1).default(1),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// ============================================================================
// Phase 10: Security, Privacy, and Compliance Protocols
// ============================================================================

export const e2eeSasVerificationSchema = z.object({
  sasWords: z.array(z.string()).length(4),
  sasIcons: z.array(z.string()).length(4).optional(),
  sasEmoji: z.array(z.string()).length(4).optional(),
  fingerprint: z.string().min(8),
  epoch: z.number().int().min(0),
  keyId: z.string().optional(),
});
export type E2eeSasVerification = z.infer<typeof e2eeSasVerificationSchema>;

export const e2eeKeyExchangePayloadSchema = z.object({
  peerId: z.string(),
  epoch: z.number().int().min(0),
  publicKey: z.string(),
  algorithm: z.enum(['AES-GCM', 'SFrame', 'ECDH-P256']).default('AES-GCM'),
  ivPrefix: z.string().optional(),
});
export type E2eeKeyExchangePayload = z.infer<
  typeof e2eeKeyExchangePayloadSchema
>;

export const e2eeStateSchema = z.object({
  enabled: z.boolean(),
  verified: z.boolean(),
  epoch: z.number().int().min(0),
  sas: e2eeSasVerificationSchema.optional(),
  peerFingerprints: z.record(z.string(), z.string()).default({}),
});
export type E2eeState = z.infer<typeof e2eeStateSchema>;

export const auditActionSchema = z.enum([
  'room.create',
  'room.destroy',
  'room.lock',
  'room.unlock',
  'recording.start',
  'recording.stop',
  'participant.kick',
  'participant.ban',
  'participant.mute_all',
  'apikey.create',
  'apikey.revoke',
  'compliance.export',
  'compliance.delete',
  'security.2fa_enable',
  'security.2fa_disable',
  'security.passkey_add',
  'security.passkey_remove',
  'security.session_revoke',
  'privacy.relay_mode_toggle',
  'settings.update',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  action: auditActionSchema,
  targetType: z.string(),
  targetId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  createdAt: z.number().int(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const dataResidencyRegionSchema = z.enum([
  'eu-central-1', // Frankfurt, Germany (EU GDPR)
  'af-south-1', // Cape Town / Johannesburg, South Africa (NDPR/POPIA)
  'us-east-1', // N. Virginia, United States (CCPA/SOC2)
]);
export type DataResidencyRegion = z.infer<typeof dataResidencyRegionSchema>;

export const abuseReportCategorySchema = z.enum([
  'harassment',
  'hate_speech',
  'inappropriate_video',
  'spam_impersonation',
  'other',
]);
export type AbuseReportCategory = z.infer<typeof abuseReportCategorySchema>;

export const abuseReportPayloadSchema = z.object({
  reportedPeerId: z.string().min(1),
  roomCode: z.string().regex(ROOM_CODE_REGEX),
  category: abuseReportCategorySchema,
  details: z.string().max(2000).optional(),
  timestamp: z.number().int(),
});
export type AbuseReportPayload = z.infer<typeof abuseReportPayloadSchema>;

export const passkeyCredentialSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  credentialId: z.string(),
  publicKey: z.string(),
  algorithm: z.number(),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().optional(),
});
export type PasskeyCredential = z.infer<typeof passkeyCredentialSchema>;

export const userSessionSchema = z.object({
  id: z.string(),
  current: z.boolean(),
  browser: z.string(),
  os: z.string(),
  ipAddress: z.string(),
  location: z.string(),
  lastActiveAt: z.number().int(),
  createdAt: z.number().int(),
});
export type UserSession = z.infer<typeof userSessionSchema>;

export const twoFactorConfigSchema = z.object({
  enabled: z.boolean(),
  secret: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  backupCodesCount: z.number().int().default(0),
  updatedAt: z.number().int(),
});
export type TwoFactorConfig = z.infer<typeof twoFactorConfigSchema>;

export const soc2CategorySchema = z.enum([
  'security',
  'availability',
  'processing_integrity',
  'confidentiality',
  'privacy',
]);
export type Soc2Category = z.infer<typeof soc2CategorySchema>;

export const soc2ControlSchema = z.object({
  id: z.string(),
  category: soc2CategorySchema,
  title: z.string(),
  description: z.string(),
  status: z.enum(['implemented', 'in_progress', 'planned']),
  evidence: z.string().optional(),
});
export type Soc2Control = z.infer<typeof soc2ControlSchema>;

export const subprocessorInfoSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  dataLocation: z.string(),
  privacyUrl: z.string().url(),
  dpaSigned: z.boolean(),
});
export type SubprocessorInfo = z.infer<typeof subprocessorInfoSchema>;

// ============================================================================
// Phase 10 (Enterprise & Security P2): SSO (SAML/OIDC), SCIM, Controls & Bug Bounty
// ============================================================================

export const ssoProviderTypeSchema = z.enum(['saml', 'oidc']);
export type SsoProviderType = z.infer<typeof ssoProviderTypeSchema>;

export const enterpriseSsoConfigSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerType: ssoProviderTypeSchema,
  idpEntityId: z.string().min(1),
  idpSsoUrl: z.string().url(),
  idpCertificate: z.string().optional(),
  metadataUrl: z.string().url().optional(),
  enforcedDomains: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type EnterpriseSsoConfig = z.infer<typeof enterpriseSsoConfigSchema>;

export const scimUserSchema = z.object({
  schemas: z
    .array(z.string())
    .default(['urn:ietf:params:scim:schemas:core:2.0:User']),
  id: z.string(),
  userName: z.string().email(),
  name: z
    .object({
      formatted: z.string().optional(),
      familyName: z.string().optional(),
      givenName: z.string().optional(),
    })
    .optional(),
  emails: z.array(
    z.object({
      value: z.string().email(),
      primary: z.boolean().optional(),
      type: z.string().optional(),
    }),
  ),
  active: z.boolean(),
  roles: z.array(z.string()).optional(),
});
export type ScimUser = z.infer<typeof scimUserSchema>;

export const dlpActionSchema = z.enum(['flag', 'redact', 'block']);
export type DlpAction = z.infer<typeof dlpActionSchema>;

export const dlpRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    'financial_cards',
    'national_id',
    'api_secrets',
    'confidential_keywords',
  ]),
  pattern: z.string(),
  action: dlpActionSchema,
  enabled: z.boolean(),
});
export type DlpRule = z.infer<typeof dlpRuleSchema>;

export const enterpriseControlsSchema = z.object({
  organizationId: z.string(),
  capturedDomains: z.array(z.string()),
  domainVerificationTokens: z.record(z.string(), z.string()).optional(),
  forcedWaitingRoom: z.boolean(),
  requireHostPresent: z.boolean(),
  preventGuestScreenshare: z.boolean(),
  watermarkVideo: z.boolean(),
  retentionDaysRecordings: z.number().int().min(1).max(3650).nullable(),
  retentionDaysChat: z.number().int().min(1).max(3650).nullable(),
  retentionDaysTranscripts: z.number().int().min(1).max(3650).nullable(),
  dlpEnabled: z.boolean(),
  dlpRules: z.array(dlpRuleSchema),
  updatedAt: z.number().int(),
});
export type EnterpriseControls = z.infer<typeof enterpriseControlsSchema>;

export const vulnerabilityReportSchema = z.object({
  id: z.string().optional(),
  reporterEmail: z.string().email(),
  reporterName: z.string().optional(),
  pgpKeyFingerprint: z.string().optional(),
  targetComponent: z.enum([
    'signaling',
    'e2ee',
    'media',
    'auth',
    'api',
    'web',
    'other',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(5).max(200),
  vulnerabilityDescription: z.string().min(20).max(5000),
  stepsToReproduce: z.string().min(20).max(5000),
  impactAssessment: z.string().max(2000).optional(),
  status: z
    .enum(['new', 'triaged', 'bounty_awarded', 'resolved', 'closed'])
    .default('new'),
  bountyAmountUsd: z.number().int().min(0).default(0),
  createdAt: z.number().int(),
});
export type VulnerabilityReport = z.infer<typeof vulnerabilityReportSchema>;
