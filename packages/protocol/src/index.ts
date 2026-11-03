import { z } from 'zod';

const peerStateSchema = z.object({
  audio: z.boolean(),
  video: z.boolean(),
  screen: z.boolean(),
  handRaised: z.boolean(),
});

const sdpSchema = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().optional(),
});

const iceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(1),
    id: z.string().uuid().optional(),
    ts: z.number().optional(),
    type: z.literal('join'),
    payload: z.object({
      roomCode: z.string().regex(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/),
      displayName: z.string().trim().min(1).max(80),
      token: z.string().min(1),
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
    type: z.literal('ping'),
    payload: z.object({}),
  }),
]);

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
