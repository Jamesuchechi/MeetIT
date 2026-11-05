import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ROOM_CODE_REGEX,
  clientMessageSchema,
  normalizeRoomCode,
  type ErrorCode,
} from '@meetit/protocol';
import { RoomManager, type Peer, type Room } from './room.js';
import { TokenBucketRateLimiter } from './rateLimiter.js';
import { buildIceServers, type IceServerEnvConfig } from './turn.js';

export interface SignalingAppOptions {
  logger?: boolean;
  authTimeoutMs?: number;
  reclaimSlotMs?: number;
  heartbeatIntervalMs?: number;
  maxPayloadBytes?: number;
  rateLimitCapacity?: number;
  rateLimitRefillPerSec?: number;
  allowedOrigins?: string[];
  iceConfig?: IceServerEnvConfig;
  autoCreateRoomOnJoin?: boolean;
}

export interface SignalingMetrics {
  invalidFrames: number;
  rateLimitedFrames: number;
  activeConnections: number;
}

export interface SignalingServerInstance {
  app: FastifyInstance;
  wss: WebSocketServer;
  roomManager: RoomManager;
  metrics: SignalingMetrics;
  close: () => Promise<void>;
}

export function buildSignalingApp(
  options: SignalingAppOptions = {},
): SignalingServerInstance {
  const authTimeoutMs = options.authTimeoutMs ?? 5000;
  const reclaimSlotMs = options.reclaimSlotMs ?? 30_000;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  const maxPayloadBytes = options.maxPayloadBytes ?? 64 * 1024;
  const autoCreateRoomOnJoin = options.autoCreateRoomOnJoin ?? true;

  const allowedOrigins =
    options.allowedOrigins ??
    (process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []);

  const iceConfig: IceServerEnvConfig = options.iceConfig ?? {
    stunUrls: process.env.STUN_URLS
      ? process.env.STUN_URLS.split(',').map((s) => s.trim())
      : ['stun:stun.l.google.com:19302'],
    ...(process.env.TURN_URLS
      ? { turnUrls: process.env.TURN_URLS.split(',').map((s) => s.trim()) }
      : {}),
    ...(process.env.TURN_SHARED_SECRET
      ? { turnSecret: process.env.TURN_SHARED_SECRET }
      : {}),
    ttlSeconds: Number(process.env.TURN_CREDENTIAL_TTL_SECONDS ?? 3600),
  };

  const roomManager = new RoomManager({ reclaimSlotMs });
  const metrics: SignalingMetrics = {
    invalidFrames: 0,
    rateLimitedFrames: 0,
    activeConnections: 0,
  };

  const app = Fastify({
    logger:
      options.logger !== undefined
        ? options.logger
        : {
            level: process.env.LOG_LEVEL ?? 'info',
            redact: [
              'req.headers.authorization',
              'payload.sdp',
              'payload.candidate',
              'sdp',
              'candidate',
            ],
          },
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0) return header;
      return randomUUID();
    },
  });

  // Basic CORS handling for web client
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin)
      ) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        reply.header(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Request-Id',
        );
      }
    }
    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async () => ({
    status: 'ready',
    rooms: roomManager.size,
    activeConnections: metrics.activeConnections,
    invalidFrames: metrics.invalidFrames,
  }));

  app.post<{ Body?: { title?: string; maxParticipants?: number } }>(
    '/rooms',
    async (request, reply) => {
      const body = request.body ?? {};
      const room = roomManager.createRoom({
        ...(typeof body.title === 'string' ? { title: body.title } : {}),
        ...(typeof body.maxParticipants === 'number'
          ? { maxParticipants: body.maxParticipants }
          : {}),
      });
      request.log.info({ roomCode: room.code }, 'room created');
      return reply.code(201).send({
        code: room.code,
        locked: room.locked,
        full: room.isFull,
        participantCount: room.participantCount,
        maxParticipants: room.maxParticipants,
      });
    },
  );

  app.get<{ Params: { code: string } }>(
    '/rooms/:code',
    async (request, reply) => {
      const normalized = normalizeRoomCode(request.params.code);
      if (!normalized || !ROOM_CODE_REGEX.test(normalized)) {
        return reply.code(400).send({
          error: 'INVALID_ROOM_CODE',
          message: 'Room code must match xxx-xxxx-xxx format.',
        });
      }
      const room = roomManager.getRoom(normalized);
      if (!room) {
        return reply.code(200).send({
          exists: false,
          code: normalized,
          locked: false,
          full: false,
          participantCount: 0,
          maxParticipants: 4,
        });
      }
      return reply.code(200).send({
        exists: true,
        code: room.code,
        locked: room.locked,
        full: room.isFull,
        participantCount: room.participantCount,
        maxParticipants: room.maxParticipants,
      });
    },
  );

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: maxPayloadBytes,
  });

  app.server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    if (
      allowedOrigins.length > 0 &&
      !allowedOrigins.includes('*') &&
      origin &&
      !allowedOrigins.includes(origin)
    ) {
      app.log.warn({ origin }, 'rejected websocket upgrade due to origin');
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  const sendError = (ws: WebSocket, code: ErrorCode, message: string): void => {
    if (ws.readyState !== 1) return;
    try {
      ws.send(
        JSON.stringify({
          v: 1,
          ts: Date.now(),
          type: 'error',
          payload: { code, message },
        }),
      );
    } catch {
      // ignore
    }
  };

  interface SocketContext {
    traceId: string;
    isAlive: boolean;
    rateLimiter: TokenBucketRateLimiter;
    violations: number;
    room: Room | null;
    peer: Peer | null;
    explicitlyLeft: boolean;
    authTimer: ReturnType<typeof setTimeout> | null;
  }

  const socketContexts = new Map<WebSocket, SocketContext>();

  wss.on('connection', (ws: WebSocket) => {
    metrics.activeConnections += 1;
    const ctx: SocketContext = {
      traceId: randomUUID(),
      isAlive: true,
      rateLimiter: new TokenBucketRateLimiter({
        capacity: options.rateLimitCapacity ?? 60,
        refillPerSecond: options.rateLimitRefillPerSec ?? 30,
      }),
      violations: 0,
      room: null,
      peer: null,
      explicitlyLeft: false,
      authTimer: setTimeout(() => {
        if (!ctx.peer) {
          sendError(
            ws,
            'UNAUTHORIZED',
            'Authentication / join timed out after 5 seconds.',
          );
          ws.close(4401, 'Join timeout');
        }
      }, authTimeoutMs),
    };
    socketContexts.set(ws, ctx);

    ws.on('pong', () => {
      ctx.isAlive = true;
      if (ctx.peer) {
        ctx.peer.isAlive = true;
      }
    });

    ws.on('message', (rawData) => {
      ctx.isAlive = true;
      if (ctx.peer) {
        ctx.peer.isAlive = true;
      }

      if (!ctx.rateLimiter.tryConsume(1)) {
        metrics.rateLimitedFrames += 1;
        ctx.violations += 1;
        sendError(ws, 'RATE_LIMITED', 'Message rate limit exceeded.');
        if (ctx.violations >= 5) {
          ws.close(4429, 'Rate limit exceeded');
        }
        return;
      }

      let parsedJson: unknown;
      try {
        const text =
          typeof rawData === 'string'
            ? rawData
            : Buffer.isBuffer(rawData)
              ? rawData.toString('utf8')
              : Array.isArray(rawData)
                ? Buffer.concat(rawData).toString('utf8')
                : Buffer.from(rawData).toString('utf8');
        parsedJson = JSON.parse(text);
      } catch {
        metrics.invalidFrames += 1;
        sendError(ws, 'INVALID_MESSAGE', 'Frame is not valid JSON.');
        return;
      }

      if (
        typeof parsedJson === 'object' &&
        parsedJson !== null &&
        'v' in parsedJson &&
        (parsedJson as { v: unknown }).v !== 1
      ) {
        metrics.invalidFrames += 1;
        sendError(ws, 'PROTOCOL_VERSION', 'Unsupported protocol version.');
        return;
      }

      const validation = clientMessageSchema.safeParse(parsedJson);
      if (!validation.success) {
        metrics.invalidFrames += 1;
        app.log.warn(
          { traceId: ctx.traceId, issues: validation.error.issues.length },
          'dropped invalid signaling frame',
        );
        sendError(ws, 'INVALID_MESSAGE', 'Frame failed schema validation.');
        return;
      }

      const msg = validation.data;

      if (msg.type === 'ping') {
        if (ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              v: 1,
              ...(msg.id ? { id: msg.id } : {}),
              ts: Date.now(),
              type: 'pong',
              payload: {},
            }),
          );
        }
        return;
      }

      if (msg.type === 'join') {
        if (ctx.authTimer) {
          clearTimeout(ctx.authTimer);
          ctx.authTimer = null;
        }

        const { roomCode, displayName, token, selfId, state } = msg.payload;
        if (!token || token.trim().length === 0) {
          sendError(ws, 'UNAUTHORIZED', 'Missing authentication token.');
          ws.close(4401, 'Unauthorized');
          return;
        }

        const room = autoCreateRoomOnJoin
          ? roomManager.getOrCreateRoom(roomCode)
          : roomManager.getRoom(roomCode);

        if (!room) {
          sendError(ws, 'ROOM_NOT_FOUND', `Room ${roomCode} does not exist.`);
          return;
        }

        const joinRes = room.joinPeer({
          socket: ws,
          displayName,
          ...(selfId !== undefined ? { requestedSelfId: selfId } : {}),
          ...(state !== undefined ? { initialState: state } : {}),
          isAuthenticatedUser: token !== 'guest-token',
        });

        if (!joinRes.ok) {
          sendError(ws, joinRes.code, joinRes.message);
          return;
        }

        ctx.room = room;
        ctx.peer = joinRes.peer;

        const iceServers = buildIceServers(joinRes.peer.id, iceConfig);
        app.log.info(
          {
            traceId: ctx.traceId,
            roomId: room.code,
            peerId: joinRes.peer.id,
            reclaimed: joinRes.reclaimed,
          },
          'peer joined room',
        );

        joinRes.peer.send({
          v: 1,
          ...(msg.id ? { id: msg.id } : {}),
          ts: Date.now(),
          type: 'joined',
          payload: {
            selfId: joinRes.peer.id,
            role: joinRes.peer.role,
            peers: room.listOtherPeerInfos(joinRes.peer.id),
            iceServers,
            transport: 'mesh',
            roomState: {
              locked: room.locked,
              hostId: room.hostId,
            },
          },
        });
        return;
      }

      // All subsequent message types require an active room & peer
      if (!ctx.room || !ctx.peer) {
        sendError(ws, 'UNAUTHORIZED', 'Must join a room before signaling.');
        return;
      }

      const { room, peer } = ctx;

      switch (msg.type) {
        case 'leave': {
          ctx.explicitlyLeft = true;
          room.leavePeer(peer.id, 'left');
          app.log.info(
            { traceId: ctx.traceId, roomId: room.code, peerId: peer.id },
            'peer left room gracefully',
          );
          ctx.room = null;
          ctx.peer = null;
          break;
        }

        case 'signal.offer':
        case 'signal.answer': {
          const target = room.getPeer(msg.payload.to);
          if (target) {
            // Note: never log SDP contents
            app.log.debug(
              {
                traceId: ctx.traceId,
                roomId: room.code,
                from: peer.id,
                to: target.id,
                signalType: msg.type,
              },
              'relaying sdp signal',
            );
            target.send({
              v: 1,
              ts: Date.now(),
              type: msg.type,
              payload: {
                from: peer.id,
                to: target.id,
                sdp: msg.payload.sdp,
              },
            });
          }
          break;
        }

        case 'signal.ice': {
          const target = room.getPeer(msg.payload.to);
          if (target) {
            target.send({
              v: 1,
              ts: Date.now(),
              type: 'signal.ice',
              payload: {
                from: peer.id,
                to: target.id,
                candidate: msg.payload.candidate,
              },
            });
          }
          break;
        }

        case 'state.update': {
          peer.state = { ...msg.payload };
          room.broadcast(
            {
              v: 1,
              ts: Date.now(),
              type: 'state.updated',
              payload: {
                peerId: peer.id,
                state: peer.state,
              },
            },
            peer.id,
          );
          break;
        }

        case 'chat.send': {
          const meta = room.nextChatMetadata();
          const chatMsg = {
            v: 1 as const,
            ts: meta.ts,
            type: 'chat.message',
            payload: {
              id: meta.id,
              seq: meta.seq,
              from: peer.id,
              displayName: peer.displayName,
              text: msg.payload.text,
              ts: meta.ts,
            },
          };
          if (msg.payload.to) {
            const target = room.getPeer(msg.payload.to);
            target?.send(chatMsg);
            peer.send(chatMsg);
          } else {
            room.broadcast(chatMsg);
          }
          break;
        }

        case 'reaction.send': {
          const now = Date.now();
          if (now - peer.lastReactionAt < 300) {
            sendError(
              ws,
              'RATE_LIMITED',
              'Reactions are rate-limited. Wait a moment.',
            );
            break;
          }
          peer.lastReactionAt = now;
          room.broadcast({
            v: 1,
            ts: now,
            type: 'reaction.received',
            payload: {
              id: randomUUID(),
              from: peer.id,
              displayName: peer.displayName,
              emoji: msg.payload.emoji,
              ts: now,
            },
          });
          break;
        }
      }
    });

    ws.on('close', () => {
      metrics.activeConnections = Math.max(0, metrics.activeConnections - 1);
      if (ctx.authTimer) {
        clearTimeout(ctx.authTimer);
        ctx.authTimer = null;
      }
      if (ctx.room && ctx.peer && !ctx.explicitlyLeft) {
        // Hold slot for 30s so peer can reclaim with same selfId
        ctx.room.detachSocket(ctx.peer.id, ws);
      }
      socketContexts.delete(ws);
    });
  });

  const heartbeatTimer = setInterval(() => {
    for (const [ws, ctx] of socketContexts.entries()) {
      if (!ctx.isAlive) {
        ws.terminate();
        continue;
      }
      ctx.isAlive = false;
      try {
        ws.ping();
      } catch {
        // ignore
      }
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const close = async (): Promise<void> => {
    clearInterval(heartbeatTimer);
    for (const [, ctx] of socketContexts) {
      if (ctx.authTimer) clearTimeout(ctx.authTimer);
    }
    roomManager.clear();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    await app.close();
  };

  return {
    app,
    wss,
    roomManager,
    metrics,
    close,
  };
}
