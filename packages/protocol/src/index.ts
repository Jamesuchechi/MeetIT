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

export const peerRoleSchema = z.enum(['host', 'cohost', 'attendee', 'guest']);
export type PeerRole = z.infer<typeof peerRoleSchema>;

export const reactionEmojiSchema = z.enum(['👍', '👏', '❤️', '🎉', '😂', '😮']);
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
      state: peerStateSchema.optional(),
      capabilities: z.array(z.string()).default([]),
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
      text: z.string().trim().min(1).max(4000),
      to: z.string().uuid().optional(),
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
    type: z.literal('ping'),
    payload: z.object({}),
  }),
]);

export const serverJoinedPayloadSchema = z.object({
  selfId: z.string().uuid(),
  role: peerRoleSchema,
  peers: z.array(peerInfoSchema),
  iceServers: z.array(iceServerSchema),
  transport: z.enum(['mesh', 'sfu']),
  roomState: z.object({
    locked: z.boolean(),
    hostId: z.string().uuid().nullable(),
    title: z.string().optional(),
    description: z.string().optional(),
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

export interface SignalingEvents {
  joined: ServerJoinedPayload;
  'peer.joined': { peer: PeerInfo };
  'peer.left': { peerId: string; reason: string };
  'signal.offer': { from: string; to: string; sdp: SdpPayload };
  'signal.answer': { from: string; to: string; sdp: SdpPayload };
  'signal.ice': { from: string; to: string; candidate: IceCandidatePayload };
  'state.updated': { peerId: string; state: PeerState };
  'chat.message': {
    id: string;
    seq?: number;
    from: string;
    displayName: string;
    text: string;
    ts: number;
  };
  'reaction.received': {
    id: string;
    from: string;
    displayName: string;
    emoji: ReactionEmoji;
    ts: number;
  };
  'room.updated': { locked: boolean; hostId: string | null };
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
