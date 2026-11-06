import {
  clientMessageSchema,
  computeBackoffMs,
  generateRoomCode,
  serverMessageSchema,
  type ClientMessage,
  type HostActionPayload,
  type IceCandidatePayload,
  type IceServerConfig,
  type PeerInfo,
  type PeerState,
  type ReactionEmoji,
  type RoomPermissions,
  type SdpPayload,
  type ServerJoinedPayload,
  type ServerMessage,
  type SignalingChannel,
  type SignalingEvents,
} from '@meetit/protocol';

const DEFAULT_SIGNALING_WS_URL =
  import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8787';

function toHttpBaseUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
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
  private currentState: PeerState;
  private selfId: string;
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
    'room.updated': new Set(),
    'host.command': new Set(),
    error: new Set(),
    pong: new Set(),
  };

  constructor(options: SignalingClientOptions) {
    this.url = options.url ?? DEFAULT_SIGNALING_WS_URL;
    this.roomCode = options.roomCode;
    this.displayName = options.displayName;
    this.token = options.token ?? 'guest-token';
    this.passcode = options.passcode;
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
          (msg as unknown as { emoji?: ReactionEmoji }).emoji ?? '👍';
        this.emit('reaction.received', {
          id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: msg.senderId,
          displayName: msg.displayName,
          emoji,
          ts: Date.now(),
        });
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
      case 'host.command':
        this.emit(
          'host.command',
          msg.payload as SignalingEvents['host.command'],
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

  sendHostAction(payload: HostActionPayload): void {
    this.send({
      v: 1,
      type: 'host.action',
      payload,
    });
  }

  updateState(partialState: Partial<PeerState>): void {
    this.currentState = { ...this.currentState, ...partialState };
    this.send({
      v: 1,
      type: 'state.update',
      payload: this.currentState,
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
