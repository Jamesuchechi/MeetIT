import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ROOM_CODE_REGEX,
  clientMessageSchema,
  normalizeRoomCode,
  type ErrorCode,
  type RoomPermissions,
} from '@meetit/protocol';
import {
  RoomManager,
  computeTokenFingerprint,
  type Peer,
  type Room,
} from './room.js';
import { TokenBucketRateLimiter } from './rateLimiter.js';
import { issueGuestToken, verifyJoinToken } from './auth.js';
import { SignalingPersistence } from './persistence.js';
import { RedisAdapter } from './redis.js';
import {
  issueLiveKitToken,
  isLiveKitConfigured,
  getSupportedRegions,
} from './livekit.js';
import {
  ProviderHealthTracker,
  issueRoomMediaProviders,
  parseProviderOrder,
  type MediaProviderEnvOptions,
} from './mediaProviders.js';
import {
  startRoomCompositeRecording,
  stopRoomCompositeRecording,
  handleLiveKitWebhook,
  type EgressStorageConfig,
} from './egress.js';
import {
  calculateExpiryTimestamp,
  pruneExpiredRecordings,
  type RecordingMetadata,
} from './retention.js';
import type { EgressClient } from 'livekit-server-sdk';

export interface SignalingAppOptions {
  logger?: boolean;
  authTimeoutMs?: number;
  reclaimSlotMs?: number;
  heartbeatIntervalMs?: number;
  maxPayloadBytes?: number;
  rateLimitCapacity?: number;
  rateLimitRefillPerSec?: number;
  allowedOrigins?: string[];
  autoCreateRoomOnJoin?: boolean;
  redisUrl?: string;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  livekitRegionalUrls?: Record<string, string>;
  mediaProviders?: MediaProviderEnvOptions;
  egressStorage?: EgressStorageConfig;
  egressClient?: EgressClient;
}

export interface SignalingMetrics {
  invalidFrames: number;
  rateLimitedFrames: number;
  activeConnections: number;
  totalConnections: number;
  roomsCreated: number;
  startedAt: number;
}

export interface SignalingServerInstance {
  app: FastifyInstance;
  wss: WebSocketServer;
  roomManager: RoomManager;
  persistence: SignalingPersistence;
  redis: RedisAdapter;
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

  const isOriginAllowed = (origin: string | undefined): boolean => {
    if (!origin) return true;
    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.includes('*') ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return true;
    }
    return allowedOrigins.some((allowed) => {
      if (allowed === origin) return true;
      if (allowed.includes('*')) {
        const pattern =
          '^' +
          allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') +
          '$';
        return new RegExp(pattern).test(origin);
      }
      return false;
    });
  };

  const roomManager = new RoomManager({ reclaimSlotMs });
  const persistence = new SignalingPersistence();
  const redis = new RedisAdapter({ redisUrl: options.redisUrl });
  const metrics: SignalingMetrics = {
    invalidFrames: 0,
    rateLimitedFrames: 0,
    activeConnections: 0,
    totalConnections: 0,
    roomsCreated: 0,
    startedAt: Date.now(),
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
    const isPublicHealth =
      request.url.startsWith('/health') ||
      request.url.startsWith('/readyz') ||
      request.url.startsWith('/metrics');

    if (origin) {
      if (isPublicHealth || isOriginAllowed(origin)) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header(
          'Access-Control-Allow-Methods',
          'GET, POST, PATCH, OPTIONS',
        );
        reply.header(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Request-Id',
        );
      }
    } else if (isPublicHealth) {
      reply.header('Access-Control-Allow-Origin', '*');
    }

    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  app.get('/health', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/healthz', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    return { status: 'ok' };
  });

  app.get('/readyz', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    return {
      status: 'ready',
      uptimeSeconds: Math.floor(process.uptime()),
      rooms: roomManager.size,
      activeConnections: metrics.activeConnections,
      totalConnections: metrics.totalConnections,
      invalidFrames: metrics.invalidFrames,
      rateLimitedFrames: metrics.rateLimitedFrames,
    };
  });

  app.get('/regions', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    return {
      regions: getSupportedRegions({
        livekitUrl: options.livekitUrl,
        regionalUrls: options.livekitRegionalUrls,
      }),
    };
  });

  app.get('/metrics', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    const memory = process.memoryUsage();
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      rooms: {
        active: roomManager.size,
        totalCreated: metrics.roomsCreated,
      },
      connections: {
        active: metrics.activeConnections,
        total: metrics.totalConnections,
      },
      frames: {
        invalid: metrics.invalidFrames,
        rateLimited: metrics.rateLimitedFrames,
      },
      memory: {
        heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
        rssMb: Number((memory.rss / 1024 / 1024).toFixed(2)),
      },
      nodeVersion: process.version,
    };
  });

  app.get('/metrics/prometheus', async (request, reply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    reply.header('Access-Control-Allow-Origin', '*');
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();

    let activeParticipants = 0;
    for (const room of roomManager.values()) {
      activeParticipants += room.participantCount;
    }

    const lines = [
      '# HELP meetit_signaling_up Process operational status',
      '# TYPE meetit_signaling_up gauge',
      'meetit_signaling_up 1',
      '',
      '# HELP meetit_signaling_uptime_seconds Process uptime in seconds',
      '# TYPE meetit_signaling_uptime_seconds gauge',
      `meetit_signaling_uptime_seconds ${Math.floor(uptime)}`,
      '',
      '# HELP meetit_signaling_rooms_active Currently active meeting rooms',
      '# TYPE meetit_signaling_rooms_active gauge',
      `meetit_signaling_rooms_active ${roomManager.size}`,
      '',
      '# HELP meetit_signaling_rooms_created_total Total meeting rooms created since startup',
      '# TYPE meetit_signaling_rooms_created_total counter',
      `meetit_signaling_rooms_created_total ${metrics.roomsCreated}`,
      '',
      '# HELP meetit_signaling_connections_active Currently active WebSocket client connections',
      '# TYPE meetit_signaling_connections_active gauge',
      `meetit_signaling_connections_active ${metrics.activeConnections}`,
      '',
      '# HELP meetit_signaling_connections_total Total WebSocket connections accepted',
      '# TYPE meetit_signaling_connections_total counter',
      `meetit_signaling_connections_total ${metrics.totalConnections}`,
      '',
      '# HELP meetit_signaling_participants_active Active participants across all rooms',
      '# TYPE meetit_signaling_participants_active gauge',
      `meetit_signaling_participants_active ${activeParticipants}`,
      '',
      '# HELP meetit_signaling_frames_invalid_total Total signaling frames rejected by schema validation',
      '# TYPE meetit_signaling_frames_invalid_total counter',
      `meetit_signaling_frames_invalid_total ${metrics.invalidFrames}`,
      '',
      '# HELP meetit_signaling_frames_ratelimited_total Total signaling frames dropped by rate limiting',
      '# TYPE meetit_signaling_frames_ratelimited_total counter',
      `meetit_signaling_frames_ratelimited_total ${metrics.rateLimitedFrames}`,
      '',
      '# HELP meetit_signaling_process_cpu_user_seconds_total Total user CPU time in seconds',
      '# TYPE meetit_signaling_process_cpu_user_seconds_total counter',
      `meetit_signaling_process_cpu_user_seconds_total ${(cpu.user / 1e6).toFixed(4)}`,
      '',
      '# HELP meetit_signaling_process_cpu_system_seconds_total Total system CPU time in seconds',
      '# TYPE meetit_signaling_process_cpu_system_seconds_total counter',
      `meetit_signaling_process_cpu_system_seconds_total ${(cpu.system / 1e6).toFixed(4)}`,
      '',
      '# HELP meetit_signaling_process_memory_rss_bytes Resident memory size in bytes',
      '# TYPE meetit_signaling_process_memory_rss_bytes gauge',
      `meetit_signaling_process_memory_rss_bytes ${memory.rss}`,
      '',
      '# HELP meetit_signaling_process_memory_heap_used_bytes Used heap memory size in bytes',
      '# TYPE meetit_signaling_process_memory_heap_used_bytes gauge',
      `meetit_signaling_process_memory_heap_used_bytes ${memory.heapUsed}`,
      '',
      '# HELP meetit_signaling_process_memory_heap_total_bytes Total allocated heap memory size in bytes',
      '# TYPE meetit_signaling_process_memory_heap_total_bytes gauge',
      `meetit_signaling_process_memory_heap_total_bytes ${memory.heapTotal}`,
      '',
    ];

    return lines.join('\n');
  });

  app.post<{ Body?: { displayName?: string } }>(
    '/auth/guest',
    async (request, reply) => {
      const displayName = (request.body?.displayName ?? '').trim();
      if (!displayName || displayName.length > 80) {
        return reply.code(400).send({
          error: 'INVALID_DISPLAY_NAME',
          message: 'Display name is required (1–80 characters).',
        });
      }
      const signed = issueGuestToken(displayName);
      return reply.code(200).send(signed);
    },
  );

  app.post<{
    Body?: {
      code?: string;
      title?: string;
      description?: string;
      passcode?: string;
      waitingRoom?: boolean;
      permissions?: Partial<RoomPermissions>;
      transport?: 'mesh' | 'sfu';
      maxParticipants?: number;
      kind?: 'instant' | 'scheduled' | 'personal';
      ownerId?: string;
    };
  }>('/rooms', async (request, reply) => {
    const body = request.body ?? {};
    const requestedCode = body.code ? normalizeRoomCode(body.code) : null;
    const room = roomManager.createRoom({
      ...(requestedCode ? { code: requestedCode } : {}),
      ...(typeof body.ownerId === 'string' && body.ownerId.trim().length > 0
        ? { ownerId: body.ownerId.trim() }
        : {}),
      ...(typeof body.title === 'string' ? { title: body.title } : {}),
      ...(typeof body.description === 'string'
        ? { description: body.description }
        : {}),
      ...(typeof body.passcode === 'string' ? { passcode: body.passcode } : {}),
      ...(typeof body.waitingRoom === 'boolean'
        ? { waitingRoom: body.waitingRoom }
        : {}),
      ...(body.permissions ? { permissions: body.permissions } : {}),
      ...(body.transport ? { transport: body.transport } : {}),
      ...(typeof body.maxParticipants === 'number'
        ? { maxParticipants: body.maxParticipants }
        : {}),
    });

    metrics.roomsCreated += 1;

    persistence.recordRoomCreated({
      code: room.code,
      ...(room.title ? { title: room.title } : {}),
      ...(room.description ? { description: room.description } : {}),
      ...(body.kind ? { kind: body.kind } : {}),
      ...(body.ownerId ? { ownerId: body.ownerId } : {}),
    });

    request.log.info({ roomCode: room.code }, 'room created');
    return reply.code(201).send({
      code: room.code,
      ...(room.title ? { title: room.title } : {}),
      ...(room.description ? { description: room.description } : {}),
      hasPasscode: room.hasPasscode,
      waitingRoom: room.permissions.waitingRoom,
      permissions: room.permissions,
      transport: room.transport,
      locked: room.locked,
      full: room.isFull,
      participantCount: room.participantCount,
      maxParticipants: room.maxParticipants,
    });
  });

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
          hasPasscode: false,
          waitingRoom: false,
          transport: 'mesh',
          locked: false,
          full: false,
          participantCount: 0,
          maxParticipants: 4,
        });
      }
      return reply.code(200).send({
        exists: true,
        code: room.code,
        ...(room.title ? { title: room.title } : {}),
        ...(room.description ? { description: room.description } : {}),
        hasPasscode: room.hasPasscode,
        waitingRoom: room.permissions.waitingRoom,
        permissions: room.permissions,
        transport: room.transport,
        locked: room.locked,
        full: room.isFull,
        participantCount: room.participantCount,
        maxParticipants: room.maxParticipants,
        ...(room.webinar.enabled ? { webinar: room.webinar } : {}),
      });
    },
  );

  app.get('/meetings/history', async () => ({
    meetings: persistence.listMeetingsHistory(50),
  }));

  // Webinar Registration & Verification Endpoints
  app.post(
    '/api/webinars/:code/register',
    async (
      request: FastifyRequest<{
        Params: { code: string };
        Body: {
          name?: string;
          email?: string;
          role?: 'panelist' | 'viewer';
          paymentProvider?: 'free' | 'stripe' | 'paystack' | 'flutterwave';
          paymentStatus?: 'free' | 'paid' | 'pending';
          ticketPrice?: number;
          currency?: 'USD' | 'NGN' | 'EUR' | 'GBP';
          transactionRef?: string;
          responses?: Record<string, string>;
        };
      }>,
      reply,
    ) => {
      reply.header('Access-Control-Allow-Origin', '*');
      const normalized = normalizeRoomCode(request.params.code);
      if (!normalized) {
        return reply.code(400).send({ error: 'Invalid room code' });
      }
      const room = autoCreateRoomOnJoin
        ? roomManager.getOrCreateRoom(normalized)
        : roomManager.getRoom(normalized);

      if (!room) {
        return reply.code(404).send({ error: 'Webinar not found' });
      }

      if (!room.webinar.enabled) {
        room.enableWebinar();
      }

      const body = request.body || {};
      const reg = room.registerAttendee({
        roomCode: normalized,
        name: body.name || 'Attendee',
        email: body.email || 'attendee@example.com',
        role: body.role ?? 'viewer',
        customAnswers: body.responses ?? {},
        status: 'approved',
        paid: body.paymentStatus === 'paid',
        ticketPriceCents: (body.ticketPrice ?? 0) * 100,
        currency: body.currency ?? 'USD',
        paymentProvider: body.paymentProvider ?? 'free',
        engagementScore: 0,
      });

      return reply.code(200).send({
        success: true,
        registration: reg,
        joinToken: reg.joinToken,
        webinar: room.webinar,
      });
    },
  );

  app.get(
    '/api/webinars/:code/registrations',
    async (request: FastifyRequest<{ Params: { code: string } }>, reply) => {
      reply.header('Access-Control-Allow-Origin', '*');
      const normalized = normalizeRoomCode(request.params.code);
      if (!normalized) {
        return reply.code(400).send({ error: 'Invalid room code' });
      }
      const room = roomManager.getRoom(normalized);
      if (!room) {
        return reply.code(404).send({ error: 'Webinar not found' });
      }
      return reply.code(200).send({
        registrations: room.listRegistrations(),
      });
    },
  );

  app.post(
    '/api/webinars/:code/registrations/:id/approve',
    async (
      request: FastifyRequest<{ Params: { code: string; id: string } }>,
      reply,
    ) => {
      reply.header('Access-Control-Allow-Origin', '*');
      const normalized = normalizeRoomCode(request.params.code);
      if (!normalized) {
        return reply.code(400).send({ error: 'Invalid room code' });
      }
      const room = roomManager.getRoom(normalized);
      if (!room) {
        return reply.code(404).send({ error: 'Webinar not found' });
      }
      const reg = room.approveRegistration(request.params.id);
      if (!reg) {
        return reply.code(404).send({ error: 'Registration not found' });
      }
      return reply.code(200).send({ registration: reg });
    },
  );

  app.get(
    '/api/webinars/:code/verify',
    async (
      request: FastifyRequest<{
        Params: { code: string };
        Querystring: { token?: string };
      }>,
      reply,
    ) => {
      reply.header('Access-Control-Allow-Origin', '*');
      const normalized = normalizeRoomCode(request.params.code);
      if (!normalized) {
        return reply.code(400).send({ error: 'Invalid room code' });
      }
      const room = roomManager.getRoom(normalized);
      if (!room) {
        return reply.code(404).send({ error: 'Webinar not found' });
      }
      const token = request.query.token;
      if (!token) {
        return reply.code(200).send({
          valid: false,
          webinar: room.webinar,
        });
      }
      const reg = room.getRegistrationByToken(token);
      return reply.code(200).send({
        valid: Boolean(reg && reg.status === 'approved'),
        registration: reg,
        webinar: room.webinar,
      });
    },
  );

  app.get(
    '/api/webinars/:code/analytics',
    async (request: FastifyRequest<{ Params: { code: string } }>, reply) => {
      reply.header('Access-Control-Allow-Origin', '*');
      const normalized = normalizeRoomCode(request.params.code);
      if (!normalized) {
        return reply.code(400).send({ error: 'Invalid room code' });
      }
      const room = roomManager.getRoom(normalized);
      if (!room) {
        return reply.code(404).send({ error: 'Webinar not found' });
      }
      return reply.code(200).send({
        report: room.getAttendeeAnalyticsReport(),
        peakViewers: room.peakViewers,
      });
    },
  );

  app.post('/webhooks/livekit', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    const authHeader = request.headers.authorization;
    const rawBody =
      typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);
    const key = options.livekitApiKey ?? process.env.LIVEKIT_API_KEY ?? '';
    const secret =
      options.livekitApiSecret ?? process.env.LIVEKIT_API_SECRET ?? '';

    if (!key || !secret) {
      return reply.code(501).send({ error: 'LiveKit webhooks not configured' });
    }

    const event = await handleLiveKitWebhook(rawBody, authHeader, key, secret);
    if (!event) {
      return reply.code(401).send({ error: 'Unauthorized webhook' });
    }

    app.log.info({ event: event.event }, 'Received LiveKit webhook event');
    return reply.code(200).send({ received: true });
  });

  app.post('/maintenance/cleanup-recordings', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    const authHeader = request.headers.authorization;
    const adminKey =
      process.env.ADMIN_API_KEY || process.env.LIVEKIT_API_SECRET;

    if (adminKey && authHeader !== `Bearer ${adminKey}`) {
      return reply.code(401).send({ error: 'Unauthorized maintenance call' });
    }

    const payload = request.body as
      { recordings?: RecordingMetadata[] } | undefined;
    const toPrune = payload?.recordings ?? [];

    const result = await pruneExpiredRecordings(toPrune, {
      storage: options.egressStorage,
    });

    app.log.info(result, 'Executed scheduled recording retention cleanup');
    return reply.code(200).send(result);
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: maxPayloadBytes,
  });

  app.server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    if (!isOriginAllowed(origin)) {
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
    waitingPeerId: string | null;
    explicitlyLeft: boolean;
    authTimer: ReturnType<typeof setTimeout> | null;
  }

  const socketContexts = new Map<WebSocket, SocketContext>();
  const providerHealth = new ProviderHealthTracker();
  const providerOrder = parseProviderOrder();
  const mediaEnvOptions: MediaProviderEnvOptions = {
    livekitUrl: options.livekitUrl,
    livekitApiKey: options.livekitApiKey,
    livekitApiSecret: options.livekitApiSecret,
    livekitRegionalUrls: options.livekitRegionalUrls,
    ...options.mediaProviders,
    providerOrder: options.mediaProviders?.providerOrder ?? providerOrder,
  };

  const sendJoinedPayloadToPeer = async (
    room: Room,
    peer: Peer,
    requestMsgId?: string,
    lastChatSeq?: number,
    preferredRegion?: string,
  ): Promise<void> => {
    const iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }> = [];
    const chatBackfill = room.getChatBackfill(lastChatSeq ?? 0);
    const issuedMedia = await issueRoomMediaProviders({
      roomCode: room.code,
      identity: peer.id,
      displayName: peer.displayName,
      role: peer.role,
      preferredRegion,
      preferredActiveProvider: room.activeProvider,
      failedProviders: room.failedProviders,
      healthTracker: providerHealth,
      options: mediaEnvOptions,
    });

    if (issuedMedia.activeProvider && !room.activeProvider) {
      room.activeProvider = issuedMedia.activeProvider;
    }

    const livekitConfig = issuedMedia.livekit;

    peer.send({
      v: 1,
      ...(requestMsgId ? { id: requestMsgId } : {}),
      ts: Date.now(),
      type: 'joined',
      payload: {
        selfId: peer.id,
        role: peer.role,
        peers: room.listOtherPeerInfos(peer.id),
        iceServers,
        transport: room.transport,
        ...(issuedMedia.activeProvider
          ? { activeProvider: issuedMedia.activeProvider }
          : {}),
        ...(issuedMedia.providers.length > 0
          ? { providers: issuedMedia.providers }
          : {}),
        ...(livekitConfig
          ? { livekit: livekitConfig, region: livekitConfig.region }
          : {}),
        roomState: {
          locked: room.locked,
          hostId: room.hostId,
          ...(room.title ? { title: room.title } : {}),
          ...(room.description ? { description: room.description } : {}),
          permissions: { ...room.permissions },
          ...(peer.role === 'host' || peer.role === 'cohost'
            ? { waitingPeers: room.listWaitingPeerInfos() }
            : {}),
          ...(chatBackfill.length > 0 ? { chatHistory: chatBackfill } : {}),
          recording: room.isRecording,
          ...(room.recordingStartedAt
            ? { recordingStartedAt: room.recordingStartedAt }
            : {}),
          breakout: room.breakout,
          polls: room.listPolls(),
          qa: room.listQa(),
          formit: room.formit,
          handRaiseQueue: room.handRaiseQueue,
          whiteboardHistory: room.whiteboardHistory,
          notes: room.notesDoc,
          timer: room.meetingTimer,
          ...(room.webinar.enabled ? { webinar: room.webinar } : {}),
          ...(room.webinar.enabled
            ? { moderatedQa: room.listWebinarQa(peer.role) }
            : {}),
        },
      },
    });
  };

  const finalizeWaitingPeerAdmission = (
    room: Room,
    admittedPeer: Peer,
  ): void => {
    if (admittedPeer.socket) {
      const wCtx = socketContexts.get(admittedPeer.socket);
      if (wCtx) {
        wCtx.peer = admittedPeer;
        wCtx.waitingPeerId = null;
        wCtx.room = room;
      }
    }
    persistence.recordPeerJoined({
      roomCode: room.code,
      ...(room.title ? { roomTitle: room.title } : {}),
      peerId: admittedPeer.id,
      ...(admittedPeer.userId ? { userId: admittedPeer.userId } : {}),
      displayName: admittedPeer.displayName,
      role: admittedPeer.role,
      currentParticipantCount: room.participantCount,
    });
    void sendJoinedPayloadToPeer(room, admittedPeer);
  };

  wss.on('connection', (ws: WebSocket) => {
    metrics.activeConnections += 1;
    metrics.totalConnections += 1;
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
      waitingPeerId: null,
      explicitlyLeft: false,
      authTimer: setTimeout(() => {
        if (!ctx.peer && !ctx.waitingPeerId) {
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

    ws.on('message', async (rawData) => {
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

        const {
          roomCode,
          displayName,
          token,
          passcode,
          selfId,
          lastChatSeq,
          state,
          preferredRegion,
        } = msg.payload;
        const verifiedCaller = verifyJoinToken(token);
        if (!verifiedCaller) {
          sendError(
            ws,
            'UNAUTHORIZED',
            'Invalid or expired authentication token.',
          );
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

        if (
          room.participantCount >= 4 &&
          room.transport === 'mesh' &&
          isLiveKitConfigured(options)
        ) {
          room.promoteToSfu();
          for (const p of room.listActivePeers()) {
            void (async () => {
              const lk = await issueLiveKitToken({
                livekitUrl: options.livekitUrl,
                regionalUrls: options.livekitRegionalUrls,
                region: preferredRegion,
                apiKey: options.livekitApiKey,
                apiSecret: options.livekitApiSecret,
                roomCode: room.code,
                identity: p.id,
                displayName: p.displayName,
                role: p.role,
              });
              if (lk) {
                p.send({
                  v: 1,
                  ts: Date.now(),
                  type: 'transport.promoted',
                  payload: {
                    livekit: lk,
                    region: lk.region,
                  },
                });
              }
            })();
          }
        }

        const tokenFingerprint = computeTokenFingerprint(token);

        const joinRes = room.joinPeer({
          socket: ws,
          displayName,
          ...(selfId !== undefined ? { requestedSelfId: selfId } : {}),
          ...(verifiedCaller.userId !== undefined
            ? { userId: verifiedCaller.userId }
            : {}),
          tokenFingerprint,
          ...(state !== undefined ? { initialState: state } : {}),
          ...(passcode !== undefined ? { passcode } : {}),
          isAuthenticatedUser: verifiedCaller.verified,
          ...(msg.payload.requestedRole !== undefined
            ? { requestedRole: msg.payload.requestedRole }
            : {}),
          ...(msg.payload.webinarToken !== undefined
            ? { webinarToken: msg.payload.webinarToken }
            : {}),
        });

        if (!joinRes.ok) {
          sendError(ws, joinRes.code, joinRes.message);
          return;
        }

        ctx.room = room;

        if (joinRes.status === 'waiting') {
          ctx.waitingPeerId = joinRes.waiting.id;
          if (ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                v: 1,
                ...(msg.id ? { id: msg.id } : {}),
                ts: Date.now(),
                type: 'waiting.room',
                payload: {
                  roomCode: room.code,
                  ...(room.title ? { title: room.title } : {}),
                  message:
                    'Waiting room is enabled. The host will let you in shortly.',
                },
              }),
            );
          }
          return;
        }

        ctx.peer = joinRes.peer;
        ctx.waitingPeerId = null;

        persistence.recordPeerJoined({
          roomCode: room.code,
          ...(room.title ? { roomTitle: room.title } : {}),
          peerId: joinRes.peer.id,
          ...(joinRes.peer.userId ? { userId: joinRes.peer.userId } : {}),
          displayName: joinRes.peer.displayName,
          role: joinRes.peer.role,
          currentParticipantCount: room.participantCount,
        });

        app.log.info(
          {
            traceId: ctx.traceId,
            roomId: room.code,
            peerId: joinRes.peer.id,
            reclaimed: joinRes.reclaimed,
          },
          'peer joined room',
        );

        void sendJoinedPayloadToPeer(
          room,
          joinRes.peer,
          msg.id,
          lastChatSeq,
          preferredRegion,
        );
        return;
      }

      // Allow waiting peer to leave gracefully
      if (msg.type === 'leave' && ctx.room && ctx.waitingPeerId && !ctx.peer) {
        ctx.explicitlyLeft = true;
        ctx.room.removeWaitingSocket(ws);
        ctx.room = null;
        ctx.waitingPeerId = null;
        return;
      }

      // All subsequent message types require an active room & admitted peer
      if (!ctx.room || !ctx.peer) {
        sendError(ws, 'UNAUTHORIZED', 'Must join a room before signaling.');
        return;
      }

      const { room, peer } = ctx;

      switch (msg.type) {
        case 'leave': {
          ctx.explicitlyLeft = true;
          room.leavePeer(peer.id, 'left');
          persistence.recordPeerLeft({
            roomCode: room.code,
            peerId: peer.id,
            remainingParticipants: room.participantCount,
          });
          app.log.info(
            { traceId: ctx.traceId, roomId: room.code, peerId: peer.id },
            'peer left room gracefully',
          );
          ctx.room = null;
          ctx.peer = null;
          break;
        }

        case 'transport.failed': {
          const failedProvider = msg.payload.provider;
          providerHealth.markUnhealthy(failedProvider);
          const nextProvider = room.advanceMediaProvider(
            failedProvider,
            mediaEnvOptions.providerOrder ?? providerOrder,
          );
          if (!nextProvider) {
            sendError(
              ws,
              'INVALID_MESSAGE',
              'All configured media providers failed.',
            );
            break;
          }
          app.log.warn(
            {
              traceId: ctx.traceId,
              roomId: room.code,
              peerId: peer.id,
              failedProvider,
              nextProvider,
              reason: msg.payload.reason,
            },
            'switching room media provider after failure',
          );
          for (const activePeer of room.listActivePeers()) {
            void (async () => {
              const issued = await issueRoomMediaProviders({
                roomCode: room.code,
                identity: activePeer.id,
                displayName: activePeer.displayName,
                role: activePeer.role,
                preferredActiveProvider: nextProvider,
                failedProviders: room.failedProviders,
                healthTracker: providerHealth,
                options: mediaEnvOptions,
              });
              const chosen = issued.activeProvider ?? nextProvider;
              activePeer.send({
                v: 1,
                ts: Date.now(),
                type: 'transport.switched',
                payload: {
                  provider: chosen,
                  ...(msg.payload.reason ? { reason: msg.payload.reason } : {}),
                  ...(chosen === 'livekit' && issued.livekit
                    ? { livekit: issued.livekit }
                    : {}),
                  ...(chosen === 'jitsi' && issued.jitsi
                    ? { jitsi: issued.jitsi }
                    : {}),
                  ...(chosen === 'agora' && issued.agora
                    ? { agora: issued.agora }
                    : {}),
                },
              });
            })();
          }
          break;
        }

        case 'signal.offer':
        case 'signal.answer': {
          const target = room.getPeer(msg.payload.to);
          if (target) {
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
          const nextState = { ...msg.payload };
          if (peer.role === 'viewer') {
            nextState.audio = false;
            nextState.video = false;
            nextState.screen = false;
          }
          if (
            peer.role === 'guest' &&
            nextState.screen &&
            !room.permissions.allowGuestScreenShare
          ) {
            nextState.screen = false;
            sendError(
              ws,
              'FORBIDDEN',
              'Screen sharing is disabled for guests in this room.',
            );
          }

          const handChanged = peer.state.handRaised !== nextState.handRaised;
          peer.state = nextState;
          if (handChanged) {
            room.updateHandRaise(
              peer.id,
              peer.displayName,
              nextState.handRaised,
            );
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'handraise.updated',
              payload: { queue: room.handRaiseQueue },
            });
          }

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
          if (peer.role === 'guest' && !room.permissions.allowGuestChat) {
            sendError(
              ws,
              'FORBIDDEN',
              'Chat is disabled for guests in this room.',
            );
            break;
          }

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
              ...(msg.payload.replyToId
                ? { replyToId: msg.payload.replyToId }
                : {}),
              ...(msg.payload.mentions
                ? { mentions: msg.payload.mentions }
                : {}),
              ...(msg.payload.file ? { file: msg.payload.file } : {}),
            },
          };
          if (msg.payload.to) {
            const target = room.getPeer(msg.payload.to);
            target?.send(chatMsg);
            peer.send(chatMsg);
          } else {
            room.recordChatMessage(chatMsg.payload);
            room.broadcast(chatMsg);
          }
          break;
        }

        case 'reaction.send': {
          if (peer.role === 'guest' && !room.permissions.allowGuestReactions) {
            sendError(
              ws,
              'FORBIDDEN',
              'Reactions are disabled for guests in this room.',
            );
            break;
          }

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

        case 'caption.send': {
          const now = Date.now();
          const cuePayload = {
            id: msg.payload.cueId || randomUUID(),
            from: peer.id,
            displayName: peer.displayName,
            text: msg.payload.text,
            ts: now,
            isFinal: msg.payload.isFinal,
            ...(msg.payload.language ? { language: msg.payload.language } : {}),
          };
          room.broadcast({
            v: 1,
            ts: now,
            type: 'caption.cue',
            payload: cuePayload,
          });
          break;
        }

        case 'chat.reaction': {
          const rx = room.addChatReaction(
            msg.payload.messageId,
            msg.payload.emoji,
            peer.id,
          );
          if (rx) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'chat.reaction.updated',
              payload: {
                messageId: msg.payload.messageId,
                reactions: rx,
              },
            });
          }
          break;
        }

        case 'poll.create': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can create polls.',
            );
            break;
          }
          const poll = room.createPoll({
            ...msg.payload,
            createdBy: peer.id,
            creatorName: peer.displayName,
          });
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'poll.updated',
            payload: { poll },
          });
          break;
        }

        case 'poll.vote': {
          const poll = room.votePoll(
            msg.payload.pollId,
            peer.id,
            msg.payload.optionIndices,
          );
          if (poll) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'poll.updated',
              payload: { poll },
            });
          }
          break;
        }

        case 'poll.close': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can close polls.',
            );
            break;
          }
          const poll = room.closePoll(msg.payload.pollId);
          if (poll) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'poll.updated',
              payload: { poll },
            });
          }
          break;
        }

        case 'poll.delete': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can delete polls.',
            );
            break;
          }
          const deleted = room.deletePoll(msg.payload.pollId);
          if (deleted) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'poll.deleted',
              payload: { pollId: msg.payload.pollId },
            });
          }
          break;
        }

        case 'formit.launch': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can launch FormIT surveys.',
            );
            break;
          }
          const session = room.launchFormIt(
            msg.payload.formUrl,
            msg.payload.title,
          );
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'formit.updated',
            payload: session,
          });
          break;
        }

        case 'formit.submit': {
          const session = room.recordFormItSubmission(
            peer.id,
            peer.displayName,
            msg.payload.editKey,
          );
          if (session) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'formit.updated',
              payload: session,
            });
          }
          break;
        }

        case 'formit.close': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can close FormIT surveys.',
            );
            break;
          }
          const session = room.closeFormIt();
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'formit.updated',
            payload: session,
          });
          break;
        }

        case 'qa.ask': {
          const question = room.askQuestion(
            peer.id,
            peer.displayName,
            msg.payload.question,
          );
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'qa.updated',
            payload: { question },
          });
          break;
        }

        case 'qa.upvote': {
          const question = room.upvoteQuestion(msg.payload.questionId, peer.id);
          if (question) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'qa.updated',
              payload: { question },
            });
          }
          break;
        }

        case 'qa.answer': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can answer questions.',
            );
            break;
          }
          const question = room.answerQuestion(
            msg.payload.questionId,
            msg.payload.answered,
          );
          if (question) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'qa.updated',
              payload: { question },
            });
          }
          break;
        }

        case 'qa.dismiss': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can dismiss questions.',
            );
            break;
          }
          const question = room.dismissQuestion(
            msg.payload.questionId,
            msg.payload.dismissed,
          );
          if (question) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'qa.updated',
              payload: { question },
            });
          }
          break;
        }

        case 'qa.delete': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can delete questions.',
            );
            break;
          }
          const deleted = room.deleteQuestion(msg.payload.questionId);
          if (deleted) {
            room.broadcast({
              v: 1,
              ts: Date.now(),
              type: 'qa.deleted',
              payload: { questionId: msg.payload.questionId },
            });
          }
          break;
        }

        case 'whiteboard.action': {
          room.recordWhiteboardAction(msg.payload);
          room.broadcast(
            {
              v: 1,
              ts: Date.now(),
              type: 'whiteboard.action',
              payload: msg.payload,
            },
            peer.id,
          );
          break;
        }

        case 'notes.update': {
          const doc = room.updateNotes(
            msg.payload.content,
            msg.payload.version,
            peer.displayName,
          );
          room.broadcast(
            {
              v: 1,
              ts: Date.now(),
              type: 'notes.updated',
              payload: doc,
            },
            peer.id,
          );
          break;
        }

        case 'timer.action': {
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can control meeting timers.',
            );
            break;
          }
          const t = room.updateMeetingTimer(msg.payload);
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'timer.updated',
            payload: t,
          });
          break;
        }

        case 'presentation.cursor': {
          room.broadcast(
            {
              v: 1,
              ts: Date.now(),
              type: 'presentation.cursor',
              payload: {
                peerId: peer.id,
                displayName: peer.displayName,
                x: msg.payload.x,
                y: msg.payload.y,
                active: msg.payload.active,
              },
            },
            peer.id,
          );
          break;
        }

        case 'breakout.join': {
          room.assignBreakoutPeer(msg.payload.roomId, peer.id);
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'breakout.updated',
            payload: room.breakout,
          });
          break;
        }

        case 'breakout.leave': {
          room.assignBreakoutPeer('', peer.id);
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'breakout.updated',
            payload: room.breakout,
          });
          break;
        }

        case 'webinar.qa_ask': {
          room.addWebinarQuestion(
            peer.id,
            peer.displayName,
            msg.payload.question,
          );
          break;
        }

        case 'webinar.qa_upvote': {
          room.upvoteWebinarQuestion(peer.id, msg.payload.questionId);
          break;
        }

        case 'host.action': {
          const actionPayload = msg.payload;
          if (!room.canModerate(peer.id)) {
            sendError(
              ws,
              'FORBIDDEN',
              'Only hosts and cohosts can perform moderation actions.',
            );
            break;
          }

          switch (actionPayload.action) {
            case 'mute': {
              const target = room.getPeer(actionPayload.targetPeerId);
              if (!target) break;
              target.state = { ...target.state, audio: false };
              target.send({
                v: 1,
                ts: Date.now(),
                type: 'host.command',
                payload: {
                  command: 'mute',
                  byPeerId: peer.id,
                  byDisplayName: peer.displayName,
                },
              });
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'state.updated',
                payload: {
                  peerId: target.id,
                  state: target.state,
                },
              });
              break;
            }

            case 'mute_all': {
              for (const other of room.listActivePeers()) {
                if (other.id === peer.id) continue;
                other.state = { ...other.state, audio: false };
                other.send({
                  v: 1,
                  ts: Date.now(),
                  type: 'host.command',
                  payload: {
                    command: 'mute',
                    byPeerId: peer.id,
                    byDisplayName: peer.displayName,
                  },
                });
                room.broadcast({
                  v: 1,
                  ts: Date.now(),
                  type: 'state.updated',
                  payload: {
                    peerId: other.id,
                    state: other.state,
                  },
                });
              }
              break;
            }

            case 'ask_unmute': {
              const target = room.getPeer(actionPayload.targetPeerId);
              if (!target) break;
              target.send({
                v: 1,
                ts: Date.now(),
                type: 'host.command',
                payload: {
                  command: 'ask_unmute',
                  byPeerId: peer.id,
                  byDisplayName: peer.displayName,
                },
              });
              break;
            }

            case 'remove': {
              const target = room.getPeer(actionPayload.targetPeerId);
              if (!target || target.id === peer.id) break;
              if (target.role === 'host' && !room.isHost(peer.id)) {
                sendError(ws, 'FORBIDDEN', 'Cohosts cannot remove the host.');
                break;
              }
              const shouldBlock = Boolean(actionPayload.block);
              if (shouldBlock) {
                room.blockParticipant(target.userId, target.tokenFingerprint);
              }
              target.send({
                v: 1,
                ts: Date.now(),
                type: 'host.command',
                payload: {
                  command: 'removed',
                  byPeerId: peer.id,
                  byDisplayName: peer.displayName,
                  blocked: shouldBlock,
                },
              });
              if (target.socket) {
                const targetCtx = socketContexts.get(target.socket);
                if (targetCtx) {
                  targetCtx.explicitlyLeft = true;
                  targetCtx.room = null;
                  targetCtx.peer = null;
                }
              }
              room.leavePeer(
                target.id,
                shouldBlock ? 'blocked' : 'removed_by_host',
              );
              persistence.recordPeerLeft({
                roomCode: room.code,
                peerId: target.id,
                remainingParticipants: room.participantCount,
              });
              break;
            }

            case 'set_role': {
              if (!room.isHost(peer.id)) {
                sendError(
                  ws,
                  'FORBIDDEN',
                  'Only the meeting host can change participant roles.',
                );
                break;
              }
              room.setPeerRole(actionPayload.targetPeerId, actionPayload.role);
              break;
            }

            case 'set_locked': {
              room.setLocked(actionPayload.locked);
              break;
            }

            case 'set_permissions': {
              room.updatePermissions(actionPayload.permissions);
              break;
            }

            case 'admit': {
              const admitted = room.admitWaitingPeer(
                actionPayload.targetPeerId,
              );
              if (admitted) {
                finalizeWaitingPeerAdmission(room, admitted);
              }
              break;
            }

            case 'deny': {
              room.denyWaitingPeer(actionPayload.targetPeerId);
              break;
            }

            case 'admit_all': {
              const admittedList = room.admitAllWaitingPeers();
              for (const admitted of admittedList) {
                finalizeWaitingPeerAdmission(room, admitted);
              }
              break;
            }

            case 'end_meeting': {
              if (!room.isHost(peer.id)) {
                sendError(
                  ws,
                  'FORBIDDEN',
                  'Only the host can end the meeting for everyone.',
                );
                break;
              }
              for (const activePeer of room.listActivePeers()) {
                if (activePeer.socket) {
                  const pCtx = socketContexts.get(activePeer.socket);
                  if (pCtx) {
                    pCtx.explicitlyLeft = true;
                    pCtx.room = null;
                    pCtx.peer = null;
                  }
                }
              }
              room.endMeetingForAll({
                id: peer.id,
                displayName: peer.displayName,
              });
              persistence.recordPeerLeft({
                roomCode: room.code,
                peerId: peer.id,
                remainingParticipants: 0,
              });
              break;
            }

            case 'start_recording': {
              const recLayout =
                'layout' in actionPayload &&
                (actionPayload.layout === 'grid' ||
                  actionPayload.layout === 'speaker')
                  ? actionPayload.layout
                  : undefined;
              const recAudioOnly =
                'audioOnly' in actionPayload &&
                typeof actionPayload.audioOnly === 'boolean'
                  ? actionPayload.audioOnly
                  : undefined;

              const recIsoTracks =
                'isoTracks' in actionPayload &&
                typeof actionPayload.isoTracks === 'boolean'
                  ? actionPayload.isoTracks
                  : undefined;
              const recRetentionDays =
                'retentionDays' in actionPayload &&
                typeof actionPayload.retentionDays === 'number'
                  ? actionPayload.retentionDays
                  : 30;

              let egressResult: {
                egressId: string;
                filepath: string;
              } | null = null;
              try {
                egressResult = await startRoomCompositeRecording({
                  roomCode: room.code,
                  ...(recLayout ? { layout: recLayout } : {}),
                  ...(recAudioOnly !== undefined
                    ? { audioOnly: recAudioOnly }
                    : {}),
                  ...(recIsoTracks !== undefined
                    ? { isoTracks: recIsoTracks }
                    : {}),
                  livekitUrl: options.livekitUrl,
                  apiKey: options.livekitApiKey,
                  apiSecret: options.livekitApiSecret,
                  storage: options.egressStorage,
                  client: options.egressClient,
                });
              } catch (err) {
                app.log.warn(
                  { err, roomCode: room.code },
                  'Failed to start LiveKit composite egress recording',
                );
              }

              const started = room.startRecording(
                peer.id,
                egressResult?.egressId,
                egressResult?.filepath,
              );
              if (started && room.recordingStartedAt) {
                const expiresAt = calculateExpiryTimestamp(
                  room.recordingStartedAt,
                  recRetentionDays,
                );

                room.broadcast({
                  v: 1,
                  ts: Date.now(),
                  type: 'recording.started',
                  payload: {
                    startedAt: room.recordingStartedAt,
                    byPeerId: peer.id,
                    byDisplayName: peer.displayName,
                    ...(egressResult?.egressId
                      ? { egressId: egressResult.egressId }
                      : {}),
                    ...(recIsoTracks !== undefined
                      ? { isoTracks: recIsoTracks }
                      : {}),
                    retentionDays: recRetentionDays,
                    ...(expiresAt !== null ? { expiresAt } : {}),
                  },
                });
              }
              break;
            }

            case 'stop_recording': {
              const active = room.stopRecording();
              if (active) {
                if (active.egressId) {
                  try {
                    await stopRoomCompositeRecording({
                      egressId: active.egressId,
                      livekitUrl: options.livekitUrl,
                      apiKey: options.livekitApiKey,
                      apiSecret: options.livekitApiSecret,
                      client: options.egressClient,
                    });
                  } catch (err) {
                    app.log.warn(
                      { err, egressId: active.egressId },
                      'Failed to stop LiveKit composite egress',
                    );
                  }
                }

                room.broadcast({
                  v: 1,
                  ts: Date.now(),
                  type: 'recording.stopped',
                  payload: {
                    stoppedAt: Date.now(),
                    byPeerId: peer.id,
                    byDisplayName: peer.displayName,
                    ...(active.egressId ? { egressId: active.egressId } : {}),
                    ...(active.storagePath
                      ? { storagePath: active.storagePath }
                      : {}),
                  },
                });
              }
              break;
            }

            case 'breakout_create': {
              const state = room.createBreakoutRooms(
                actionPayload.rooms,
                actionPayload.durationMinutes,
              );
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'breakout.updated',
                payload: state,
              });
              break;
            }

            case 'breakout_assign': {
              const state = room.assignBreakoutPeer(
                actionPayload.roomId,
                actionPayload.peerId,
              );
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'breakout.updated',
                payload: state,
              });
              break;
            }

            case 'breakout_start': {
              const state = room.startBreakout();
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'breakout.updated',
                payload: state,
              });
              break;
            }

            case 'breakout_broadcast': {
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'breakout.broadcast',
                payload: {
                  message: actionPayload.message,
                  from: peer.displayName,
                  ts: Date.now(),
                },
              });
              break;
            }

            case 'breakout_recall': {
              const state = room.recallBreakout(actionPayload.noticeSeconds);
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'breakout.updated',
                payload: state,
              });
              break;
            }

            case 'breakout_end': {
              const state = room.endBreakout();
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'breakout.updated',
                payload: state,
              });
              break;
            }

            case 'lower_hand': {
              const queue = room.lowerHand(actionPayload.targetPeerId);
              room.broadcast({
                v: 1,
                ts: Date.now(),
                type: 'handraise.updated',
                payload: { queue },
              });
              if (actionPayload.targetPeerId) {
                const target = room.getPeer(actionPayload.targetPeerId);
                if (target) {
                  room.broadcast({
                    v: 1,
                    ts: Date.now(),
                    type: 'state.updated',
                    payload: { peerId: target.id, state: target.state },
                  });
                }
              } else {
                for (const p of room.listActivePeers()) {
                  room.broadcast({
                    v: 1,
                    ts: Date.now(),
                    type: 'state.updated',
                    payload: { peerId: p.id, state: p.state },
                  });
                }
              }
              break;
            }

            case 'webinar_go_live': {
              room.goLiveWebinar(peer.id);
              break;
            }

            case 'webinar_end_live': {
              room.endLiveWebinar(peer.id);
              break;
            }

            case 'webinar_config_update': {
              room.updateWebinarConfig(actionPayload.config);
              break;
            }

            case 'webinar_stream_start': {
              room.startWebinarStream({
                ...(actionPayload.rtmpUrl !== undefined
                  ? { rtmpUrl: actionPayload.rtmpUrl }
                  : {}),
                ...(actionPayload.streamKey !== undefined
                  ? { streamKey: actionPayload.streamKey }
                  : {}),
                ...(actionPayload.hlsUrl !== undefined
                  ? { hlsUrl: actionPayload.hlsUrl }
                  : {}),
              });
              break;
            }

            case 'webinar_stream_stop': {
              room.stopWebinarStream();
              break;
            }

            case 'webinar_simulive_sync': {
              room.syncWebinarSimulive({
                positionSec: actionPayload.positionSec,
                playing: actionPayload.playing,
              });
              break;
            }

            case 'webinar_qa_moderate': {
              room.moderateWebinarQuestion(
                actionPayload.questionId,
                actionPayload.status,
                actionPayload.answer,
                peer.displayName,
              );
              break;
            }

            case 'webinar_role_change': {
              room.setPeerRole(actionPayload.peerId, actionPayload.role);
              break;
            }
          }
          break;
        }

        case 'handoff.initiate': {
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'handoff.offered',
            payload: {
              token: msg.payload.token,
              handoffState: msg.payload.handoffState,
            },
          });
          break;
        }

        case 'handoff.claim': {
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'handoff.claimed',
            payload: {
              token: msg.payload.token,
              targetDevice: msg.payload.targetDevice,
            },
          });
          break;
        }

        case 'handoff.complete': {
          room.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'handoff.transferred',
            payload: {
              token: msg.payload.token,
              targetDevice: msg.payload.targetDevice,
              message: `Call seamlessly transferred to ${msg.payload.targetDevice}`,
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
      if (ctx.room && ctx.waitingPeerId && !ctx.peer) {
        ctx.room.removeWaitingSocket(ws);
      } else if (ctx.room && ctx.peer && !ctx.explicitlyLeft) {
        const roomRef = ctx.room;
        // Hold slot for 30s so peer can reclaim with same selfId
        roomRef.detachSocket(ctx.peer.id, ws, (reapedPeerId) => {
          persistence.recordPeerLeft({
            roomCode: roomRef.code,
            peerId: reapedPeerId,
            remainingParticipants: roomRef.participantCount,
          });
        });
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
    for (const [ws, ctx] of socketContexts) {
      if (ctx.authTimer) clearTimeout(ctx.authTimer);
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    }
    socketContexts.clear();
    roomManager.clear();
    await redis.close();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    await app.close();
  };

  return {
    app,
    wss,
    roomManager,
    persistence,
    redis,
    metrics,
    close,
  };
}
