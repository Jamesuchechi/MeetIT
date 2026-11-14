import {
  clientMessageSchema,
  computeBackoffMs,
  generateRoomCode,
  serverMessageSchema,
  type AgendaItem,
  type BreakoutState,
  type ChatAttachment,
  type ClientMessage,
  type DeviceHandoffState,
  type FormItSession,
  type HandRaiseItem,
  type HostActionPayload,
  type IceCandidatePayload,
  type IceServerConfig,
  type MeetingTimer,
  type NotesDoc,
  type PeerInfo,
  type PeerRole,
  type PeerState,
  type PollItem,
  type QaItem,
  type ReactionEmoji,
  type RoomPermissions,
  type SdpPayload,
  type ServerJoinedPayload,
  type ServerMessage,
  type SignalingChannel,
  type SignalingEvents,
  type WebinarSimulive,
  type WebinarState,
  type WebinarStreamOut,
  type WhiteboardAction,
} from '@meetit/protocol';

const DEFAULT_SIGNALING_WS_URL =
  import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8787';

function toHttpBaseUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

export function toWsUrl(url: string): string {
  let cleaned = (url || '').trim();
  if (cleaned.startsWith('https://')) {
    cleaned = 'wss://' + cleaned.slice(8);
  } else if (cleaned.startsWith('http://')) {
    cleaned = 'ws://' + cleaned.slice(7);
  } else if (!cleaned.startsWith('ws://') && !cleaned.startsWith('wss://')) {
    cleaned =
      (typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? 'wss://'
        : 'ws://') + cleaned;
  }
  return cleaned;
}

export async function createRoomViaApi(options?: {
  code?: string;
  title?: string;
  description?: string;
  passcode?: string;
  waitingRoom?: boolean;
  permissions?: Partial<RoomPermissions>;
  kind?: 'instant' | 'scheduled' | 'personal';
  ownerId?: string;
}): Promise<string> {
  const baseUrl = toHttpBaseUrl(DEFAULT_SIGNALING_WS_URL);
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`${baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options ?? {}),
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { code?: string };
      if (data.code) return data.code;
    }
  } catch {
    // Fallback to client-generated valid room code if signaling server isn't running
  }
  return options?.code ?? generateRoomCode();
}

export async function configureRoomViaApi(options: {
  code: string;
  title?: string;
  description?: string;
  passcode?: string;
  waitingRoom?: boolean;
  permissions?: Partial<RoomPermissions>;
  kind?: 'instant' | 'scheduled' | 'personal';
  ownerId?: string;
}): Promise<void> {
  await createRoomViaApi(options);
}

export async function requestGuestTokenViaApi(
  displayName: string,
): Promise<string> {
  const baseUrl = toHttpBaseUrl(DEFAULT_SIGNALING_WS_URL);
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${baseUrl}/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { token?: string };
      if (data.token) return data.token;
    }
  } catch {
    // Fallback to guest-token when signaling server is offline
  }
  return 'guest-token';
}

export async function inspectRoomViaApi(code: string): Promise<{
  exists: boolean;
  title?: string;
  description?: string;
  hasPasscode: boolean;
  locked: boolean;
  full: boolean;
  peerCount: number;
  maxPeers: number;
}> {
  const baseUrl = toHttpBaseUrl(DEFAULT_SIGNALING_WS_URL);
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${baseUrl}/rooms/${encodeURIComponent(code)}`, {
      method: 'GET',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as {
        exists?: boolean;
        title?: string;
        description?: string;
        hasPasscode?: boolean;
        locked?: boolean;
        full?: boolean;
        participantCount?: number;
        peerCount?: number;
        maxParticipants?: number;
      };
      const peerCount = data.participantCount ?? data.peerCount ?? 0;
      const maxPeers = data.maxParticipants ?? 4;
      return {
        exists: data.exists ?? true,
        ...(data.title ? { title: data.title } : {}),
        ...(data.description ? { description: data.description } : {}),
        hasPasscode: data.hasPasscode ?? false,
        locked: data.locked ?? false,
        full: data.full ?? peerCount >= maxPeers,
        peerCount,
        maxPeers,
      };
    }
  } catch {
    // Offline fallback
  }
  return {
    exists: true,
    hasPasscode: false,
    locked: false,
    full: false,
    peerCount: 0,
    maxPeers: 4,
  };
}

function generateUuidV4(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateTabSelfId(roomCode: string): string {
  const key = `meetit_self_id_${roomCode}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = generateUuidV4();
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return generateUuidV4();
  }
}

export interface SignalingClientOptions {
  url?: string;
  roomCode: string;
  displayName: string;
  token?: string;
  passcode?: string;
  initialState?: PeerState;
  preferredRegion?: string;
  requestedRole?: PeerRole;
  webinarToken?: string;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: () => void;
}

type ListenerMap = {
  [K in keyof SignalingEvents]: Set<(payload: SignalingEvents[K]) => void>;
};

export class SignalingClient implements SignalingChannel {
  private readonly url: string;
  private readonly roomCode: string;
  private readonly displayName: string;
  private readonly token: string;
  private readonly passcode: string | undefined;
  private preferredRegion: string | undefined;
  private requestedRole: PeerRole | undefined;
  private webinarToken: string | undefined;
  private currentState: PeerState;
  public selfId: string;
  private ws: WebSocket | null = null;
  private broadcast: BroadcastChannel | null = null;
  private closed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private hasJoinedOnce = false;
  private lastChatSeq = 0;
  private readonly pendingQueue: ClientMessage[] = [];
  private readonly handleWindowOnline: () => void;
  private readonly onReconnecting: ((attempt: number) => void) | undefined;
  private readonly onReconnected: (() => void) | undefined;

  private readonly listeners: ListenerMap = {
    joined: new Set(),
    'waiting.room': new Set(),
    'waiting.updated': new Set(),
    'peer.joined': new Set(),
    'peer.left': new Set(),
    'peer.role.updated': new Set(),
    'signal.offer': new Set(),
    'signal.answer': new Set(),
    'signal.ice': new Set(),
    'state.updated': new Set(),
    'chat.message': new Set(),
    'reaction.received': new Set(),
    'caption.cue': new Set(),
    'room.updated': new Set(),
    'recording.started': new Set(),
    'recording.stopped': new Set(),
    'host.command': new Set(),
    'transport.promoted': new Set(),
    'transport.switched': new Set(),
    'moderator.nudge': new Set(),
    'moderator.stats': new Set(),
    'space.positions': new Set(),
    'avatar.landmarks': new Set(),
    'xr.pose': new Set(),
    'slides.sync': new Set(),
    'chat.reaction.updated': new Set(),
    'breakout.updated': new Set(),
    'breakout.broadcast': new Set(),
    'poll.updated': new Set(),
    'poll.deleted': new Set(),
    'formit.updated': new Set(),
    'qa.updated': new Set(),
    'qa.deleted': new Set(),
    'handraise.updated': new Set(),
    'whiteboard.action': new Set(),
    'notes.updated': new Set(),
    'timer.updated': new Set(),
    'presentation.cursor': new Set(),
    'webinar.state': new Set(),
    'webinar.qa_updated': new Set(),
    'webinar.qa_deleted': new Set(),
    'webinar.stream_updated': new Set(),
    'webinar.simulive_updated': new Set(),
    'webinar.analytics_updated': new Set(),
    'handoff.offered': new Set(),
    'handoff.claimed': new Set(),
    'handoff.transferred': new Set(),
    error: new Set(),
    pong: new Set(),
  };

  constructor(options: SignalingClientOptions) {
    this.url = toWsUrl(options.url ?? DEFAULT_SIGNALING_WS_URL);
    this.roomCode = options.roomCode;
    this.displayName = options.displayName;
    this.token = options.token ?? 'guest-token';
    this.passcode = options.passcode;
    this.preferredRegion = options.preferredRegion;
    this.requestedRole = options.requestedRole;
    this.webinarToken = options.webinarToken;
    this.currentState = options.initialState ?? {
      audio: true,
      video: true,
      screen: false,
      handRaised: false,
    };
    this.selfId = getOrCreateTabSelfId(options.roomCode);
    this.onReconnecting = options.onReconnecting;
    this.onReconnected = options.onReconnected;
    this.handleWindowOnline = () => {
      if (
        !this.closed &&
        (!this.ws ||
          (this.ws.readyState !== WebSocket.OPEN &&
            this.ws.readyState !== WebSocket.CONNECTING))
      ) {
        if (this.reconnectTimer !== null) {
          window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.openWebSocket();
      }
    };
  }

  getSelfId(): string {
    return this.selfId;
  }

  getLastChatSeq(): number {
    return this.lastChatSeq;
  }

  connect(): void {
    this.closed = false;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleWindowOnline);
    }
    this.openWebSocket();
  }

  private openWebSocket(): void {
    if (this.closed) return;

    try {
      const ws = new WebSocket(`${this.url.replace(/\/$/, '')}/ws`);
      this.ws = ws;

      ws.addEventListener('open', () => {
        if (this.closed) {
          ws.close();
          return;
        }
        const wasReconnecting = this.reconnectAttempt > 0 && this.hasJoinedOnce;
        this.reconnectAttempt = 0;
        this.send({
          v: 1,
          type: 'join',
          payload: {
            roomCode: this.roomCode,
            displayName: this.displayName,
            token: this.token,
            ...(this.passcode ? { passcode: this.passcode } : {}),
            selfId: this.selfId,
            lastChatSeq: this.lastChatSeq,
            state: this.currentState,
            capabilities: ['mesh'],
            ...(this.preferredRegion
              ? { preferredRegion: this.preferredRegion }
              : {}),
            ...(this.requestedRole !== undefined
              ? { requestedRole: this.requestedRole }
              : {}),
            ...(this.webinarToken !== undefined
              ? { webinarToken: this.webinarToken }
              : {}),
          },
        });
        this.startKeepalive();
        if (wasReconnecting) {
          this.onReconnected?.();
        }
      });

      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        let rawJson: unknown;
        try {
          rawJson = JSON.parse(event.data);
        } catch {
          return;
        }

        const parsed = serverMessageSchema.safeParse(rawJson);
        if (!parsed.success) return;
        this.handleServerMessage(parsed.data);
      });

      ws.addEventListener('close', () => {
        this.stopKeepalive();
        if (this.closed) return;
        if (!this.hasJoinedOnce && this.reconnectAttempt === 0) {
          this.enableBroadcastFallback();
        }
        this.scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        // Error will be followed by close
      });
    } catch {
      this.enableBroadcastFallback();
      this.scheduleReconnect();
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ v: 1, type: 'ping', payload: {} });
      }
    }, 15_000);
  }

  private stopKeepalive(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private enableBroadcastFallback(): void {
    if (this.broadcast || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(`meetit_room_${this.roomCode}`);
    this.broadcast = channel;

    const defaultIceServers: IceServerConfig[] = [
      { urls: ['stun:stun.l.google.com:19302'] },
    ];

    channel.addEventListener('message', (ev) => {
      const msg = ev.data as {
        senderId: string;
        displayName: string;
        state: PeerState;
        type: string;
        to?: string;
        sdp?: SdpPayload;
        candidate?: IceCandidatePayload;
      };
      if (!msg || msg.senderId === this.selfId) return;

      if (msg.type === 'bc-hello') {
        const peer: PeerInfo = {
          id: msg.senderId,
          displayName: msg.displayName,
          role: 'guest',
          state: msg.state,
        };
        this.emit('peer.joined', { peer });
        channel.postMessage({
          type: 'bc-welcome',
          senderId: this.selfId,
          displayName: this.displayName,
          state: this.currentState,
          to: msg.senderId,
        });
      } else if (msg.type === 'bc-welcome' && msg.to === this.selfId) {
        const peer: PeerInfo = {
          id: msg.senderId,
          displayName: msg.displayName,
          role: 'host',
          state: msg.state,
        };
        this.emit('peer.joined', { peer });
      } else if (msg.type === 'bc-leave') {
        this.emit('peer.left', { peerId: msg.senderId, reason: 'left' });
      } else if (
        msg.type === 'signal.offer' &&
        msg.to === this.selfId &&
        msg.sdp
      ) {
        this.emit('signal.offer', {
          from: msg.senderId,
          to: this.selfId,
          sdp: msg.sdp,
        });
      } else if (
        msg.type === 'signal.answer' &&
        msg.to === this.selfId &&
        msg.sdp
      ) {
        this.emit('signal.answer', {
          from: msg.senderId,
          to: this.selfId,
          sdp: msg.sdp,
        });
      } else if (
        msg.type === 'signal.ice' &&
        msg.to === this.selfId &&
        msg.candidate
      ) {
        this.emit('signal.ice', {
          from: msg.senderId,
          to: this.selfId,
          candidate: msg.candidate,
        });
      } else if (msg.type === 'state.update') {
        this.emit('state.updated', {
          peerId: msg.senderId,
          state: msg.state,
        });
      } else if (msg.type === 'chat.send') {
        const text = (msg as unknown as { text?: string }).text ?? '';
        const id =
          (msg as unknown as { id?: string }).id ??
          `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const ts = (msg as unknown as { ts?: number }).ts ?? Date.now();
        this.emit('chat.message', {
          id,
          from: msg.senderId,
          displayName: msg.displayName,
          text,
          ts,
        });
      } else if (msg.type === 'reaction.send') {
        const emoji =
          (msg as unknown as { emoji?: ReactionEmoji }).emoji ?? 'thumbsup';
        this.emit('reaction.received', {
          id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: msg.senderId,
          displayName: msg.displayName,
          emoji,
          ts: Date.now(),
        });
      } else if (msg.type === 'caption.send') {
        const raw = msg as unknown as {
          text?: string;
          isFinal?: boolean;
          language?: string;
          cueId?: string;
        };
        const text = raw.text ?? '';
        if (text) {
          this.emit('caption.cue', {
            id:
              raw.cueId ||
              `cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            from: msg.senderId,
            displayName: msg.displayName,
            text,
            ts: Date.now(),
            isFinal: raw.isFinal ?? true,
            ...(raw.language ? { language: raw.language } : {}),
          });
        }
      }
    });

    if (!this.hasJoinedOnce) {
      this.hasJoinedOnce = true;
      window.setTimeout(() => {
        this.emit('joined', {
          selfId: this.selfId,
          role: 'host',
          peers: [],
          iceServers: defaultIceServers,
          transport: 'mesh',
          roomState: {
            locked: false,
            hostId: this.selfId,
          },
        });
        channel.postMessage({
          type: 'bc-hello',
          senderId: this.selfId,
          displayName: this.displayName,
          state: this.currentState,
        });
      }, 20);
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    const attempt = this.reconnectAttempt++;
    this.onReconnecting?.(attempt + 1);
    const delay = computeBackoffMs(attempt);
    this.reconnectTimer = window.setTimeout(() => {
      this.openWebSocket();
    }, delay);
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'joined': {
        const p = msg.payload as ServerJoinedPayload;
        this.hasJoinedOnce = true;
        this.selfId = p.selfId;
        this.emit('joined', p);

        if (p.roomState.chatHistory && p.roomState.chatHistory.length > 0) {
          for (const backfilledMsg of p.roomState.chatHistory) {
            if (
              backfilledMsg.seq !== undefined &&
              backfilledMsg.seq > this.lastChatSeq
            ) {
              this.lastChatSeq = backfilledMsg.seq;
            }
            this.emit('chat.message', {
              id: backfilledMsg.id,
              ...(backfilledMsg.seq !== undefined
                ? { seq: backfilledMsg.seq }
                : {}),
              from: backfilledMsg.from,
              displayName: backfilledMsg.displayName,
              text: backfilledMsg.text,
              ts: backfilledMsg.ts,
            });
          }
        }

        // Flush any queued chat messages that were sent during a brief disconnect
        if (
          this.pendingQueue.length > 0 &&
          this.ws &&
          this.ws.readyState === WebSocket.OPEN
        ) {
          const toFlush = this.pendingQueue.splice(0);
          for (const queued of toFlush) {
            this.ws.send(JSON.stringify(queued));
          }
        }
        break;
      }
      case 'waiting.room':
        this.emit(
          'waiting.room',
          msg.payload as SignalingEvents['waiting.room'],
        );
        break;
      case 'waiting.updated':
        this.emit(
          'waiting.updated',
          msg.payload as SignalingEvents['waiting.updated'],
        );
        break;
      case 'peer.joined':
        this.emit('peer.joined', msg.payload as SignalingEvents['peer.joined']);
        break;
      case 'peer.left':
        this.emit('peer.left', msg.payload as SignalingEvents['peer.left']);
        break;
      case 'peer.role.updated':
        this.emit(
          'peer.role.updated',
          msg.payload as SignalingEvents['peer.role.updated'],
        );
        break;
      case 'signal.offer':
        this.emit(
          'signal.offer',
          msg.payload as SignalingEvents['signal.offer'],
        );
        break;
      case 'signal.answer':
        this.emit(
          'signal.answer',
          msg.payload as SignalingEvents['signal.answer'],
        );
        break;
      case 'signal.ice':
        this.emit('signal.ice', msg.payload as SignalingEvents['signal.ice']);
        break;
      case 'state.updated':
        this.emit(
          'state.updated',
          msg.payload as SignalingEvents['state.updated'],
        );
        break;
      case 'chat.message': {
        const chatPayload = msg.payload as SignalingEvents['chat.message'];
        if (
          chatPayload.seq !== undefined &&
          chatPayload.seq > this.lastChatSeq
        ) {
          this.lastChatSeq = chatPayload.seq;
        }
        this.emit('chat.message', chatPayload);
        break;
      }
      case 'reaction.received':
        this.emit(
          'reaction.received',
          msg.payload as SignalingEvents['reaction.received'],
        );
        break;
      case 'room.updated':
        this.emit(
          'room.updated',
          msg.payload as SignalingEvents['room.updated'],
        );
        break;
      case 'recording.started':
        this.emit(
          'recording.started',
          msg.payload as SignalingEvents['recording.started'],
        );
        break;
      case 'recording.stopped':
        this.emit(
          'recording.stopped',
          msg.payload as SignalingEvents['recording.stopped'],
        );
        break;
      case 'host.command':
        this.emit(
          'host.command',
          msg.payload as SignalingEvents['host.command'],
        );
        break;
      case 'chat.reaction.updated':
        this.emit(
          'chat.reaction.updated',
          msg.payload as SignalingEvents['chat.reaction.updated'],
        );
        break;
      case 'breakout.updated':
        this.emit(
          'breakout.updated',
          msg.payload as SignalingEvents['breakout.updated'],
        );
        break;
      case 'breakout.broadcast':
        this.emit(
          'breakout.broadcast',
          msg.payload as SignalingEvents['breakout.broadcast'],
        );
        break;
      case 'poll.updated':
        this.emit(
          'poll.updated',
          msg.payload as SignalingEvents['poll.updated'],
        );
        break;
      case 'poll.deleted':
        this.emit(
          'poll.deleted',
          msg.payload as SignalingEvents['poll.deleted'],
        );
        break;
      case 'formit.updated':
        this.emit(
          'formit.updated',
          msg.payload as SignalingEvents['formit.updated'],
        );
        break;
      case 'qa.updated':
        this.emit('qa.updated', msg.payload as SignalingEvents['qa.updated']);
        break;
      case 'qa.deleted':
        this.emit('qa.deleted', msg.payload as SignalingEvents['qa.deleted']);
        break;
      case 'handraise.updated':
        this.emit(
          'handraise.updated',
          msg.payload as SignalingEvents['handraise.updated'],
        );
        break;
      case 'whiteboard.action':
        this.emit(
          'whiteboard.action',
          msg.payload as SignalingEvents['whiteboard.action'],
        );
        break;
      case 'notes.updated':
        this.emit(
          'notes.updated',
          msg.payload as SignalingEvents['notes.updated'],
        );
        break;
      case 'timer.updated':
        this.emit(
          'timer.updated',
          msg.payload as SignalingEvents['timer.updated'],
        );
        break;
      case 'presentation.cursor':
        this.emit(
          'presentation.cursor',
          msg.payload as SignalingEvents['presentation.cursor'],
        );
        break;
      case 'webinar.state':
        this.emit(
          'webinar.state',
          msg.payload as SignalingEvents['webinar.state'],
        );
        break;
      case 'webinar.qa_updated':
        this.emit(
          'webinar.qa_updated',
          msg.payload as SignalingEvents['webinar.qa_updated'],
        );
        break;
      case 'webinar.qa_deleted':
        this.emit(
          'webinar.qa_deleted',
          msg.payload as SignalingEvents['webinar.qa_deleted'],
        );
        break;
      case 'webinar.stream_updated':
        this.emit(
          'webinar.stream_updated',
          msg.payload as SignalingEvents['webinar.stream_updated'],
        );
        break;
      case 'webinar.simulive_updated':
        this.emit(
          'webinar.simulive_updated',
          msg.payload as SignalingEvents['webinar.simulive_updated'],
        );
        break;
      case 'webinar.analytics_updated':
        this.emit(
          'webinar.analytics_updated',
          msg.payload as SignalingEvents['webinar.analytics_updated'],
        );
        break;
      case 'pong':
        this.emit('pong', {});
        break;
      case 'error':
        this.emit('error', msg.payload as SignalingEvents['error']);
        break;
    }
  }

  send(message: ClientMessage): void {
    const validated = clientMessageSchema.safeParse(message);
    if (!validated.success) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(validated.data));
      return;
    }

    if (
      !this.broadcast &&
      this.hasJoinedOnce &&
      validated.data.type === 'chat.send' &&
      this.pendingQueue.length < 30
    ) {
      this.pendingQueue.push(validated.data);
      return;
    }

    if (this.broadcast) {
      const d = validated.data;
      if (d.type === 'signal.offer' || d.type === 'signal.answer') {
        this.broadcast.postMessage({
          type: d.type,
          senderId: this.selfId,
          to: d.payload.to,
          sdp: d.payload.sdp,
        });
      } else if (d.type === 'signal.ice') {
        this.broadcast.postMessage({
          type: 'signal.ice',
          senderId: this.selfId,
          to: d.payload.to,
          candidate: d.payload.candidate,
        });
      } else if (d.type === 'state.update') {
        this.broadcast.postMessage({
          type: 'state.update',
          senderId: this.selfId,
          state: d.payload,
        });
      } else if (d.type === 'chat.send') {
        const now = Date.now();
        const id = `msg-${now}-${Math.random().toString(36).slice(2, 6)}`;
        const chatPayload = {
          id,
          from: this.selfId,
          displayName: this.displayName,
          text: d.payload.text,
          ts: now,
        };
        this.emit('chat.message', chatPayload);
        this.broadcast.postMessage({
          type: 'chat.send',
          id,
          senderId: this.selfId,
          displayName: this.displayName,
          text: d.payload.text,
          ts: now,
        });
      } else if (d.type === 'reaction.send') {
        const now = Date.now();
        const rxPayload = {
          id: `rx-${now}-${Math.random().toString(36).slice(2, 6)}`,
          from: this.selfId,
          displayName: this.displayName,
          emoji: d.payload.emoji,
          ts: now,
        };
        this.emit('reaction.received', rxPayload);
        this.broadcast.postMessage({
          type: 'reaction.send',
          senderId: this.selfId,
          displayName: this.displayName,
          emoji: d.payload.emoji,
        });
      } else if (d.type === 'caption.send') {
        const now = Date.now();
        const cuePayload = {
          id:
            d.payload.cueId ||
            `cue-${now}-${Math.random().toString(36).slice(2, 6)}`,
          from: this.selfId,
          displayName: this.displayName,
          text: d.payload.text,
          ts: now,
          isFinal: d.payload.isFinal,
          ...(d.payload.language ? { language: d.payload.language } : {}),
        };
        this.emit('caption.cue', cuePayload);
        this.broadcast.postMessage({
          type: 'caption.send',
          senderId: this.selfId,
          displayName: this.displayName,
          text: d.payload.text,
          isFinal: d.payload.isFinal,
          language: d.payload.language,
          cueId: cuePayload.id,
        });
      }
    }
  }

  sendChat(text: string, to?: string): void {
    this.send({
      v: 1,
      type: 'chat.send',
      payload: {
        text,
        ...(to ? { to } : {}),
      },
    });
  }

  sendReaction(emoji: ReactionEmoji): void {
    this.send({
      v: 1,
      type: 'reaction.send',
      payload: { emoji },
    });
  }

  sendCaption(options: {
    text: string;
    isFinal: boolean;
    language?: string;
    cueId?: string;
  }): void {
    this.send({
      v: 1,
      type: 'caption.send',
      payload: options,
    });
  }

  sendHostAction(payload: HostActionPayload): void {
    this.send({
      v: 1,
      type: 'host.action',
      payload,
    });
  }

  startRecording(options?: {
    layout?: 'grid' | 'speaker';
    audioOnly?: boolean;
    isoTracks?: boolean;
    retentionDays?: number;
  }): void {
    this.sendHostAction({
      action: 'start_recording',
      ...(options?.layout ? { layout: options.layout } : {}),
      ...(options?.audioOnly !== undefined
        ? { audioOnly: options.audioOnly }
        : {}),
      ...(options?.isoTracks !== undefined
        ? { isoTracks: options.isoTracks }
        : {}),
      ...(options?.retentionDays !== undefined
        ? { retentionDays: options.retentionDays }
        : {}),
    });
  }

  stopRecording(): void {
    this.sendHostAction({ action: 'stop_recording' });
  }

  // --- Collaboration (Phase 6) methods ---

  sendChatMessage(params: {
    text: string;
    to?: string;
    replyToId?: string;
    mentions?: string[];
    file?: ChatAttachment;
  }): void {
    this.send({
      v: 1,
      type: 'chat.send',
      payload: {
        text: params.text,
        ...(params.to ? { to: params.to } : {}),
        ...(params.replyToId ? { replyToId: params.replyToId } : {}),
        ...(params.mentions ? { mentions: params.mentions } : {}),
        ...(params.file ? { file: params.file } : {}),
      },
    });
  }

  sendChatReaction(messageId: string, emoji: string): void {
    this.send({
      v: 1,
      type: 'chat.reaction',
      payload: { messageId, emoji },
    });
  }

  createPoll(params: {
    question: string;
    options: string[];
    isQuiz?: boolean;
    correctOptionIndex?: number;
    allowMultiple?: boolean;
  }): void {
    this.send({
      v: 1,
      type: 'poll.create',
      payload: params,
    });
  }

  votePoll(pollId: string, optionIndices: number[]): void {
    this.send({
      v: 1,
      type: 'poll.vote',
      payload: { pollId, optionIndices },
    });
  }

  closePoll(pollId: string): void {
    this.send({
      v: 1,
      type: 'poll.close',
      payload: { pollId },
    });
  }

  deletePoll(pollId: string): void {
    this.send({
      v: 1,
      type: 'poll.delete',
      payload: { pollId },
    });
  }

  launchFormIt(formUrl: string, title?: string): void {
    this.send({
      v: 1,
      type: 'formit.launch',
      payload: { formUrl, title },
    });
  }

  submitFormIt(id: string, editKey?: string | null): void {
    this.send({
      v: 1,
      type: 'formit.submit',
      payload: { id, editKey },
    });
  }

  closeFormIt(id: string): void {
    this.send({
      v: 1,
      type: 'formit.close',
      payload: { id },
    });
  }

  askQuestion(question: string): void {
    this.send({
      v: 1,
      type: 'qa.ask',
      payload: { question },
    });
  }

  upvoteQuestion(questionId: string): void {
    this.send({
      v: 1,
      type: 'qa.upvote',
      payload: { questionId },
    });
  }

  answerQuestion(questionId: string, answered: boolean): void {
    this.send({
      v: 1,
      type: 'qa.answer',
      payload: { questionId, answered },
    });
  }

  dismissQuestion(questionId: string, dismissed: boolean): void {
    this.send({
      v: 1,
      type: 'qa.dismiss',
      payload: { questionId, dismissed },
    });
  }

  deleteQuestion(questionId: string): void {
    this.send({
      v: 1,
      type: 'qa.delete',
      payload: { questionId },
    });
  }

  sendWhiteboardAction(action: WhiteboardAction): void {
    this.send({
      v: 1,
      type: 'whiteboard.action',
      payload: action,
    });
  }

  updateSharedNotes(content: string, version: number): void {
    this.send({
      v: 1,
      type: 'notes.update',
      payload: { content, version },
    });
  }

  sendTimerAction(params: {
    action:
      | 'start'
      | 'pause'
      | 'reset'
      | 'set_countdown'
      | 'next_agenda'
      | 'set_agenda';
    durationSeconds?: number;
    agenda?: AgendaItem[];
  }): void {
    this.send({
      v: 1,
      type: 'timer.action',
      payload: params,
    });
  }

  sendPresentationCursor(x: number, y: number, active: boolean): void {
    this.send({
      v: 1,
      type: 'presentation.cursor',
      payload: { x, y, active },
    });
  }

  createBreakoutRooms(
    rooms: Array<{ name: string; peerIds?: string[] }>,
    durationMinutes?: number,
  ): void {
    this.sendHostAction({
      action: 'breakout_create',
      rooms: rooms.map((r) => ({
        name: r.name,
        peerIds: r.peerIds ?? [],
      })),
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    });
  }

  assignBreakoutPeer(roomId: string, peerId: string): void {
    this.sendHostAction({
      action: 'breakout_assign',
      roomId,
      peerId,
    });
  }

  startBreakout(): void {
    this.sendHostAction({ action: 'breakout_start' });
  }

  broadcastBreakout(message: string): void {
    this.sendHostAction({ action: 'breakout_broadcast', message });
  }

  recallBreakout(noticeSeconds = 30): void {
    this.sendHostAction({ action: 'breakout_recall', noticeSeconds });
  }

  endBreakout(): void {
    this.sendHostAction({ action: 'breakout_end' });
  }

  joinBreakoutRoom(roomId: string): void {
    this.send({
      v: 1,
      type: 'breakout.join',
      payload: { roomId },
    });
  }

  leaveBreakoutRoom(): void {
    this.send({
      v: 1,
      type: 'breakout.leave',
      payload: {},
    });
  }

  lowerHand(targetPeerId?: string): void {
    this.sendHostAction({
      action: 'lower_hand',
      ...(targetPeerId ? { targetPeerId } : {}),
    });
  }

  goLiveWebinar(): void {
    this.sendHostAction({
      action: 'webinar_go_live',
    });
  }

  endLiveWebinar(): void {
    this.sendHostAction({
      action: 'webinar_end_live',
    });
  }

  updateWebinarConfig(config: Partial<WebinarState>): void {
    this.sendHostAction({
      action: 'webinar_config_update',
      config,
    });
  }

  startWebinarStream(params: {
    rtmpUrl?: string;
    streamKey?: string;
    hlsUrl?: string;
  }): void {
    this.sendHostAction({
      action: 'webinar_stream_start',
      ...(params.rtmpUrl ? { rtmpUrl: params.rtmpUrl } : {}),
      ...(params.streamKey ? { streamKey: params.streamKey } : {}),
      ...(params.hlsUrl ? { hlsUrl: params.hlsUrl } : {}),
    });
  }

  stopWebinarStream(): void {
    this.sendHostAction({
      action: 'webinar_stream_stop',
    });
  }

  syncWebinarSimulive(params: { positionSec: number; playing: boolean }): void {
    this.sendHostAction({
      action: 'webinar_simulive_sync',
      positionSec: params.positionSec,
      playing: params.playing,
    });
  }

  askWebinarQuestion(question: string): void {
    this.send({
      v: 1,
      type: 'webinar.qa_ask',
      payload: {
        question,
      },
    });
  }

  upvoteWebinarQuestion(questionId: string): void {
    this.send({
      v: 1,
      type: 'webinar.qa_upvote',
      payload: {
        questionId,
      },
    });
  }

  moderateWebinarQuestion(
    questionId: string,
    status: 'pending' | 'approved' | 'dismissed' | 'answered',
    answer?: string,
  ): void {
    this.sendHostAction({
      action: 'webinar_qa_moderate',
      questionId,
      status,
      ...(answer ? { answer } : {}),
    });
  }

  changeWebinarRole(
    peerId: string,
    role: 'panelist' | 'viewer' | 'cohost' | 'host' | 'attendee',
  ): void {
    this.sendHostAction({
      action: 'webinar_role_change',
      peerId,
      role,
    });
  }

  setPreferredRegion(region: string | undefined): void {
    this.preferredRegion = region;
  }

  getPreferredRegion(): string | undefined {
    return this.preferredRegion;
  }

  updateState(partialState: Partial<PeerState>): void {
    this.currentState = { ...this.currentState, ...partialState };
    this.send({
      v: 1,
      type: 'state.update',
      payload: this.currentState,
    });
  }

  sendHandoffInitiate(payload: {
    token: string;
    handoffState: DeviceHandoffState;
  }): void {
    this.send({
      v: 1,
      type: 'handoff.initiate',
      payload,
    });
  }

  sendHandoffClaim(payload: { token: string; targetDevice: string }): void {
    this.send({
      v: 1,
      type: 'handoff.claim',
      payload,
    });
  }

  sendHandoffComplete(payload: {
    token: string;
    targetDevice: string;
    completedBy?: string;
  }): void {
    this.send({
      v: 1,
      type: 'handoff.complete',
      payload,
    });
  }

  on<K extends keyof SignalingEvents>(
    event: K,
    handler: (payload: SignalingEvents[K]) => void,
  ): () => void {
    const set = this.listeners[event];
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  private emit<K extends keyof SignalingEvents>(
    event: K,
    payload: SignalingEvents[K],
  ): void {
    for (const fn of this.listeners[event]) {
      fn(payload);
    }
  }

  disconnect(): void {
    this.closed = true;
    this.pendingQueue.length = 0;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleWindowOnline);
    }
    this.stopKeepalive();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ v: 1, type: 'leave', payload: {} }));
      } catch {
        // ignore
      }
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    if (this.broadcast) {
      try {
        this.broadcast.postMessage({
          type: 'bc-leave',
          senderId: this.selfId,
        });
        this.broadcast.close();
      } catch {
        // ignore
      }
      this.broadcast = null;
    }
  }
}
