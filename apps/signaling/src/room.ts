import { createHash, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  generateRoomCode,
  type AgendaItem,
  type BreakoutRoom,
  type BreakoutState,
  type ChatMessagePayload,
  type ErrorCode,
  type FormItSession,
  type HandRaiseItem,
  type MediaProviderName,
  type MeetingTimer,
  type NotesDoc,
  type PeerInfo,
  type PeerRole,
  type PeerState,
  type PollItem,
  type QaItem,
  type RoomPermissions,
  type ServerMessage,
  type WaitingPeer,
  type WhiteboardAction,
  type WebinarBranding,
  type WebinarQaItem,
  type WebinarRegistration,
  type WebinarSimulive,
  type WebinarSpeakerBio,
  type WebinarState,
  type WebinarStreamOut,
} from '@meetit/protocol';

const DEFAULT_PEER_STATE: PeerState = {
  audio: true,
  video: true,
  screen: false,
  handRaised: false,
};

export const DEFAULT_ROOM_PERMISSIONS: RoomPermissions = {
  waitingRoom: false,
  allowGuestChat: true,
  allowGuestScreenShare: true,
  allowGuestReactions: true,
};

export function computeTokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 32);
}

export class Peer {
  readonly id: string;
  userId?: string | undefined;
  tokenFingerprint?: string | undefined;
  displayName: string;
  role: PeerRole;
  verified: boolean;
  state: PeerState;
  socket: WebSocket | null;
  isAlive = true;
  lastReactionAt = 0;
  reclaimTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(params: {
    id: string;
    userId?: string;
    tokenFingerprint?: string;
    displayName: string;
    role: PeerRole;
    verified?: boolean;
    state?: PeerState;
    socket: WebSocket;
  }) {
    this.id = params.id;
    if (params.userId !== undefined) {
      this.userId = params.userId;
    }
    if (params.tokenFingerprint !== undefined) {
      this.tokenFingerprint = params.tokenFingerprint;
    }
    this.displayName = params.displayName;
    this.role = params.role;
    this.verified = params.verified ?? false;
    this.state = params.state ? { ...params.state } : { ...DEFAULT_PEER_STATE };
    this.socket = params.socket;
  }

  send(message: ServerMessage): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // ignore socket send errors
    }
  }

  toInfo(): PeerInfo {
    return {
      id: this.id,
      displayName: this.displayName,
      role: this.role,
      verified: this.verified,
      state: { ...this.state },
    };
  }
}

export interface WaitingEntry {
  id: string;
  userId?: string | undefined;
  tokenFingerprint?: string | undefined;
  displayName: string;
  role: PeerRole;
  verified: boolean;
  state: PeerState;
  socket: WebSocket;
  requestedAt: number;
}

export type JoinResult =
  | { ok: true; status: 'joined'; peer: Peer; reclaimed: boolean }
  | { ok: true; status: 'waiting'; waiting: WaitingEntry }
  | { ok: false; code: ErrorCode; message: string };

export class Room {
  readonly code: string;
  ownerId?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  passcode?: string | undefined;
  locked = false;
  hostId: string | null = null;
  permissions: RoomPermissions;
  transport: 'mesh' | 'sfu';
  activeProvider?: MediaProviderName | undefined;
  readonly failedProviders = new Set<MediaProviderName>();
  maxParticipants: number;
  isRecording = false;
  recordingStartedAt: number | null = null;
  recordedByPeerId: string | null = null;
  activeEgressId: string | null = null;
  recordingStoragePath: string | null = null;
  readonly createdAt: number = Date.now();

  // Phase 6 Collaboration State
  breakout: BreakoutState = { active: false, rooms: [] };
  readonly polls = new Map<string, PollItem>();
  formit: FormItSession | null = null;
  readonly qa = new Map<string, QaItem>();
  handRaiseQueue: HandRaiseItem[] = [];
  whiteboardHistory: WhiteboardAction[] = [];
  notesDoc: NotesDoc = { content: '', version: 0, lastUpdatedAt: Date.now() };
  meetingTimer: MeetingTimer = {
    type: 'stopwatch',
    running: false,
    durationSeconds: 0,
    agenda: [],
  };

  // Phase 7 Webinar State
  webinar: WebinarState = {
    enabled: false,
    practiceMode: true,
    isLive: false,
    maxViewers: 1000,
    viewerCount: 0,
    peakViewers: 0,
    requireRegistration: false,
    autoApproveRegistrations: true,
    ticketPriceCents: 0,
    currency: 'USD',
    paymentProvider: 'free',
    customFields: [],
  };
  readonly moderatedQa = new Map<string, WebinarQaItem>();
  readonly registrations = new Map<string, WebinarRegistration>();
  readonly attendeeAnalytics = new Map<
    string,
    {
      joinTime: number;
      leaveTime?: number;
      durationMs: number;
      pollVotesCount: number;
      qaCount: number;
      chatCount: number;
      engagementScore: number;
    }
  >();
  peakViewers = 0;

  private readonly peers = new Map<string, Peer>();
  private readonly waitingPeers = new Map<string, WaitingEntry>();
  private readonly blockedUserIds = new Set<string>();
  private readonly blockedFingerprints = new Set<string>();
  private readonly chatHistory: ChatMessagePayload[] = [];
  private readonly reclaimSlotMs: number;
  private chatSequence = 0;

  constructor(
    code: string,
    options: {
      ownerId?: string;
      title?: string;
      description?: string;
      passcode?: string;
      waitingRoom?: boolean;
      permissions?: Partial<RoomPermissions>;
      transport?: 'mesh' | 'sfu';
      maxParticipants?: number;
      reclaimSlotMs?: number;
      webinar?: boolean | Partial<WebinarState>;
    } = {},
  ) {
    this.code = code;
    if (options.ownerId !== undefined) {
      this.ownerId = options.ownerId;
    }
    if (options.title !== undefined) {
      this.title = options.title;
    }
    if (options.description !== undefined) {
      this.description = options.description;
    }
    if (options.passcode !== undefined && options.passcode.trim().length > 0) {
      this.passcode = options.passcode.trim();
    }
    this.permissions = {
      ...DEFAULT_ROOM_PERMISSIONS,
      ...(options.waitingRoom !== undefined
        ? { waitingRoom: options.waitingRoom }
        : {}),
      ...(options.permissions ?? {}),
    };
    this.transport = options.transport ?? 'sfu';
    this.maxParticipants =
      options.maxParticipants ?? (this.transport === 'sfu' ? 100 : 4);
    this.reclaimSlotMs = options.reclaimSlotMs ?? 30_000;

    if (options.webinar) {
      const webinarOpts =
        typeof options.webinar === 'object' ? options.webinar : {};
      this.webinar = {
        enabled: true,
        practiceMode: webinarOpts.practiceMode ?? true,
        isLive: webinarOpts.isLive ?? false,
        maxViewers: webinarOpts.maxViewers ?? 1000,
        viewerCount: 0,
        peakViewers: 0,
        requireRegistration: webinarOpts.requireRegistration ?? false,
        autoApproveRegistrations: webinarOpts.autoApproveRegistrations ?? true,
        ticketPriceCents: webinarOpts.ticketPriceCents ?? 0,
        currency: webinarOpts.currency ?? 'USD',
        paymentProvider: webinarOpts.paymentProvider ?? 'free',
        customFields: webinarOpts.customFields ?? [],
        ...(webinarOpts.branding !== undefined
          ? { branding: webinarOpts.branding }
          : {}),
        ...(webinarOpts.streamOut !== undefined
          ? { streamOut: webinarOpts.streamOut }
          : {}),
        ...(webinarOpts.simulive !== undefined
          ? { simulive: webinarOpts.simulive }
          : {}),
        ...(webinarOpts.startedAt !== undefined
          ? { startedAt: webinarOpts.startedAt }
          : {}),
        ...(webinarOpts.endedAt !== undefined
          ? { endedAt: webinarOpts.endedAt }
          : {}),
      };
      this.transport = 'sfu';
      this.maxParticipants = Math.max(
        this.maxParticipants,
        this.webinar.maxViewers ?? 1000,
      );
    }
  }

  promoteToSfu(): boolean {
    if (this.transport === 'sfu') return false;
    this.transport = 'sfu';
    if (this.maxParticipants < 100) {
      this.maxParticipants = 100;
    }
    return true;
  }

  advanceMediaProvider(
    failed: MediaProviderName,
    availableOrder: MediaProviderName[],
  ): MediaProviderName | null {
    this.failedProviders.add(failed);
    if (this.activeProvider && this.activeProvider !== failed) {
      // Room already moved past the failed provider.
      return this.activeProvider;
    }
    const next = availableOrder.find((p) => !this.failedProviders.has(p));
    if (!next) {
      return null;
    }
    this.activeProvider = next;
    return next;
  }

  startRecording(
    peerId: string,
    egressId?: string,
    storagePath?: string,
  ): boolean {
    if (this.isRecording) return false;
    this.isRecording = true;
    this.recordingStartedAt = Date.now();
    this.recordedByPeerId = peerId;
    this.activeEgressId = egressId ?? null;
    this.recordingStoragePath = storagePath ?? null;
    return true;
  }

  stopRecording(): {
    egressId: string | null;
    storagePath: string | null;
  } | null {
    if (!this.isRecording) return null;
    const result = {
      egressId: this.activeEgressId,
      storagePath: this.recordingStoragePath,
    };
    this.isRecording = false;
    this.recordingStartedAt = null;
    this.recordedByPeerId = null;
    this.activeEgressId = null;
    this.recordingStoragePath = null;
    return result;
  }

  get hasPasscode(): boolean {
    return Boolean(this.passcode && this.passcode.length > 0);
  }

  get participantCount(): number {
    let active = 0;
    for (const peer of this.peers.values()) {
      if (peer.socket !== null) active += 1;
    }
    return active;
  }

  get totalSlotsCount(): number {
    return this.peers.size;
  }

  get isFull(): boolean {
    return this.participantCount >= this.maxParticipants;
  }

  isBlocked(userId?: string, tokenFingerprint?: string): boolean {
    if (userId && this.blockedUserIds.has(userId)) return true;
    if (tokenFingerprint && this.blockedFingerprints.has(tokenFingerprint)) {
      return true;
    }
    return false;
  }

  blockParticipant(userId?: string, tokenFingerprint?: string): void {
    if (userId) this.blockedUserIds.add(userId);
    if (tokenFingerprint) this.blockedFingerprints.add(tokenFingerprint);
  }

  canModerate(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    return peer.role === 'host' || peer.role === 'cohost';
  }

  isHost(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    return peer.role === 'host' || this.hostId === peerId;
  }

  nextChatMetadata(): { id: string; seq: number; ts: number } {
    this.chatSequence += 1;
    const seq = this.chatSequence;
    const padded = String(seq).padStart(6, '0');
    return {
      id: `msg-${padded}-${randomUUID().slice(0, 8)}`,
      seq,
      ts: Date.now(),
    };
  }

  recordChatMessage(message: ChatMessagePayload): void {
    this.chatHistory.push(message);
    if (this.chatHistory.length > 100) {
      this.chatHistory.shift();
    }
    const stats = this.attendeeAnalytics.get(message.from);
    if (stats) {
      stats.chatCount += 1;
    }
  }

  getChatBackfill(afterSeq = 0): ChatMessagePayload[] {
    return this.chatHistory.filter((m) => (m.seq ?? 0) > afterSeq);
  }

  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  getWaitingPeer(peerId: string): WaitingEntry | undefined {
    return this.waitingPeers.get(peerId);
  }

  listWaitingPeerInfos(): WaitingPeer[] {
    return Array.from(this.waitingPeers.values()).map((w) => ({
      id: w.id,
      displayName: w.displayName,
      role: w.role,
      verified: w.verified,
      requestedAt: w.requestedAt,
    }));
  }

  listOtherPeerInfos(excludePeerId: string): PeerInfo[] {
    const out: PeerInfo[] = [];
    for (const peer of this.peers.values()) {
      if (peer.id !== excludePeerId && peer.socket !== null) {
        out.push(peer.toInfo());
      }
    }
    return out;
  }

  listActivePeers(): Peer[] {
    return Array.from(this.peers.values()).filter((p) => p.socket !== null);
  }

  broadcastWaitingRoomUpdate(): void {
    const payload = { waitingPeers: this.listWaitingPeerInfos() };
    for (const peer of this.peers.values()) {
      if (
        peer.socket !== null &&
        (peer.role === 'host' || peer.role === 'cohost')
      ) {
        peer.send({
          v: 1,
          ts: Date.now(),
          type: 'waiting.updated',
          payload,
        });
      }
    }
  }

  joinPeer(params: {
    socket: WebSocket;
    displayName: string;
    requestedSelfId?: string;
    userId?: string;
    tokenFingerprint?: string;
    initialState?: PeerState;
    isAuthenticatedUser?: boolean;
    passcode?: string;
    requestedRole?: PeerRole;
    webinarToken?: string;
  }): JoinResult {
    // 0. Check per-room blocklist first
    if (this.isBlocked(params.userId, params.tokenFingerprint)) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: 'You have been blocked from joining this room by the host.',
      };
    }

    // 1. Check slot reclaim (same selfId within 30s grace window)
    if (params.requestedSelfId) {
      const existing = this.peers.get(params.requestedSelfId);
      if (existing) {
        if (existing.reclaimTimer) {
          clearTimeout(existing.reclaimTimer);
          existing.reclaimTimer = null;
        }
        if (existing.socket && existing.socket !== params.socket) {
          try {
            existing.socket.close(4000, 'Session replaced by reconnect');
          } catch {
            // ignore
          }
        }
        existing.socket = params.socket;
        existing.isAlive = true;
        existing.displayName = params.displayName;
        if (params.initialState) {
          existing.state = { ...params.initialState };
        }

        // Notify other peers that this peer is present / updated
        this.broadcast(
          {
            v: 1,
            ts: Date.now(),
            type: 'state.updated',
            payload: { peerId: existing.id, state: existing.state },
          },
          existing.id,
        );

        return { ok: true, status: 'joined', peer: existing, reclaimed: true };
      }
    }

    // 2. Check room passcode if configured
    if (this.passcode && (params.passcode ?? '').trim() !== this.passcode) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: 'Incorrect or missing room passcode.',
      };
    }

    // 3. Check room lock & capacity
    if (this.locked) {
      return {
        ok: false,
        code: 'ROOM_LOCKED',
        message: 'This room is locked by the host.',
      };
    }

    if (this.participantCount >= this.maxParticipants) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        message: `Room is full (maximum ${this.maxParticipants} participants).`,
      };
    }

    const peerId = params.requestedSelfId ?? randomUUID();
    const isOwner = Boolean(
      this.ownerId && params.userId && this.ownerId === params.userId,
    );
    const isFirstHost =
      isOwner || this.hostId === null || this.peers.size === 0;
    let role: PeerRole = isFirstHost
      ? 'host'
      : params.isAuthenticatedUser
        ? 'attendee'
        : 'guest';

    if (this.webinar.enabled) {
      if (params.requestedRole === 'viewer') {
        if (this.webinar.requireRegistration) {
          const reg = params.webinarToken
            ? this.getRegistrationByToken(params.webinarToken)
            : undefined;
          if (!reg || reg.status !== 'approved') {
            return {
              ok: false,
              code: 'FORBIDDEN',
              message: 'Approved registration required for this webinar.',
            };
          }
        }
        role = 'viewer';
      } else if (isFirstHost) {
        role = 'host';
      } else if (
        params.requestedRole === 'panelist' ||
        (params.webinarToken &&
          this.getRegistrationByToken(params.webinarToken)?.role === 'panelist')
      ) {
        role = 'panelist';
      } else {
        if (this.webinar.requireRegistration) {
          const reg = params.webinarToken
            ? this.getRegistrationByToken(params.webinarToken)
            : undefined;
          if (!reg || reg.status !== 'approved') {
            return {
              ok: false,
              code: 'FORBIDDEN',
              message: 'Approved registration required for this webinar.',
            };
          }
        }
        role = 'viewer';
      }
    }

    // 4. Waiting room gate (for non-hosts when waitingRoom is enabled and not in webinar viewer mode)
    if (this.permissions.waitingRoom && !isFirstHost && role !== 'viewer') {
      const waitingEntry: WaitingEntry = {
        id: peerId,
        ...(params.userId !== undefined ? { userId: params.userId } : {}),
        ...(params.tokenFingerprint !== undefined
          ? { tokenFingerprint: params.tokenFingerprint }
          : {}),
        displayName: params.displayName,
        role,
        verified: Boolean(params.isAuthenticatedUser),
        state: params.initialState
          ? { ...params.initialState }
          : { ...DEFAULT_PEER_STATE },
        socket: params.socket,
        requestedAt: Date.now(),
      };
      this.waitingPeers.set(peerId, waitingEntry);
      this.broadcastWaitingRoomUpdate();
      return { ok: true, status: 'waiting', waiting: waitingEntry };
    }

    let initialPeerState: PeerState = params.initialState
      ? { ...params.initialState }
      : { ...DEFAULT_PEER_STATE };

    if (role === 'viewer') {
      initialPeerState = {
        audio: false,
        video: false,
        screen: false,
        handRaised: false,
      };
    }

    const peer = new Peer({
      id: peerId,
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
      ...(params.tokenFingerprint !== undefined
        ? { tokenFingerprint: params.tokenFingerprint }
        : {}),
      displayName: params.displayName,
      role,
      verified: Boolean(params.isAuthenticatedUser),
      state: initialPeerState,
      socket: params.socket,
    });

    this.peers.set(peerId, peer);
    if (isFirstHost) {
      // If a room owner joins after another temporary host, promote owner to host
      if (this.hostId && this.hostId !== peerId) {
        const oldHost = this.peers.get(this.hostId);
        if (oldHost && oldHost.role === 'host') {
          oldHost.role = 'cohost';
        }
      }
      this.hostId = peerId;
    }

    if (role === 'viewer') {
      this.attendeeAnalytics.set(peerId, {
        joinTime: Date.now(),
        durationMs: 0,
        pollVotesCount: 0,
        qaCount: 0,
        chatCount: 0,
        engagementScore: 100,
      });
      const viewerCount = Array.from(this.peers.values()).filter(
        (p) => p.role === 'viewer' && p.socket !== null,
      ).length;
      if (viewerCount > this.peakViewers) {
        this.peakViewers = viewerCount;
      }
      this.webinar.viewerCount = viewerCount;
      this.webinar.peakViewers = this.peakViewers;
      for (const p of this.peers.values()) {
        if (
          p.socket &&
          (p.role === 'host' || p.role === 'cohost' || p.role === 'panelist')
        ) {
          p.send({
            v: 1,
            ts: Date.now(),
            type: 'webinar.analytics_updated',
            payload: {
              viewerCount,
              peakViewers: this.peakViewers,
            },
          });
        }
      }
    }

    if (role === 'viewer') {
      // In high-scale webinars, avoid flooding 1,000+ viewers with O(N^2) peer.joined events.
      // Broadcast peer.joined only to active hosts, cohosts, and panelists.
      for (const p of this.peers.values()) {
        if (
          p.socket &&
          p.id !== peerId &&
          (p.role === 'host' || p.role === 'cohost' || p.role === 'panelist')
        ) {
          p.send({
            v: 1,
            ts: Date.now(),
            type: 'peer.joined',
            payload: { peer: peer.toInfo() },
          });
        }
      }
    } else {
      this.broadcast(
        {
          v: 1,
          ts: Date.now(),
          type: 'peer.joined',
          payload: { peer: peer.toInfo() },
        },
        peerId,
      );
    }

    return { ok: true, status: 'joined', peer, reclaimed: false };
  }

  admitWaitingPeer(targetPeerId: string): Peer | null {
    const waiting = this.waitingPeers.get(targetPeerId);
    if (!waiting) return null;
    this.waitingPeers.delete(targetPeerId);

    if (this.participantCount >= this.maxParticipants) {
      if (waiting.socket.readyState === 1) {
        waiting.socket.send(
          JSON.stringify({
            v: 1,
            ts: Date.now(),
            type: 'error',
            payload: {
              code: 'ROOM_FULL',
              message: `Room is full (maximum ${this.maxParticipants} participants).`,
            },
          }),
        );
      }
      this.broadcastWaitingRoomUpdate();
      return null;
    }

    const peer = new Peer({
      id: waiting.id,
      ...(waiting.userId !== undefined ? { userId: waiting.userId } : {}),
      ...(waiting.tokenFingerprint !== undefined
        ? { tokenFingerprint: waiting.tokenFingerprint }
        : {}),
      displayName: waiting.displayName,
      role: waiting.role,
      verified: waiting.verified,
      state: waiting.state,
      socket: waiting.socket,
    });

    this.peers.set(peer.id, peer);
    this.broadcast(
      {
        v: 1,
        ts: Date.now(),
        type: 'peer.joined',
        payload: { peer: peer.toInfo() },
      },
      peer.id,
    );
    this.broadcastWaitingRoomUpdate();
    return peer;
  }

  admitAllWaitingPeers(): Peer[] {
    const ids = Array.from(this.waitingPeers.keys());
    const admitted: Peer[] = [];
    for (const id of ids) {
      const p = this.admitWaitingPeer(id);
      if (p) admitted.push(p);
    }
    return admitted;
  }

  denyWaitingPeer(targetPeerId: string): boolean {
    const waiting = this.waitingPeers.get(targetPeerId);
    if (!waiting) return false;
    this.waitingPeers.delete(targetPeerId);

    if (waiting.socket.readyState === 1) {
      try {
        waiting.socket.send(
          JSON.stringify({
            v: 1,
            ts: Date.now(),
            type: 'error',
            payload: {
              code: 'NOT_ADMITTED',
              message: 'The host declined your request to join this meeting.',
            },
          }),
        );
      } catch {
        // ignore
      }
    }
    this.broadcastWaitingRoomUpdate();
    return true;
  }

  removeWaitingSocket(socket: WebSocket): void {
    for (const [id, w] of this.waitingPeers.entries()) {
      if (w.socket === socket) {
        this.waitingPeers.delete(id);
        this.broadcastWaitingRoomUpdate();
        return;
      }
    }
  }

  setPeerRole(targetPeerId: string, nextRole: PeerRole): Peer | null {
    const target = this.peers.get(targetPeerId);
    if (!target) return null;

    if (nextRole === 'host') {
      if (this.hostId && this.hostId !== targetPeerId) {
        const prevHost = this.peers.get(this.hostId);
        if (prevHost) {
          prevHost.role = 'cohost';
          this.broadcast({
            v: 1,
            ts: Date.now(),
            type: 'peer.role.updated',
            payload: {
              peerId: prevHost.id,
              role: prevHost.role,
              hostId: targetPeerId,
            },
          });
        }
      }
      this.hostId = targetPeerId;
    }

    target.role = nextRole;
    if (nextRole === 'viewer') {
      target.state = {
        audio: false,
        video: false,
        screen: false,
        handRaised: false,
      };
      this.broadcast({
        v: 1,
        ts: Date.now(),
        type: 'state.updated',
        payload: {
          peerId: target.id,
          state: target.state,
        },
      });
    }

    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'peer.role.updated',
      payload: {
        peerId: target.id,
        role: target.role,
        hostId: this.hostId,
      },
    });
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'room.updated',
      payload: {
        locked: this.locked,
        hostId: this.hostId,
        permissions: { ...this.permissions },
      },
    });
    if (nextRole === 'host' || nextRole === 'cohost') {
      this.broadcastWaitingRoomUpdate();
    }
    return target;
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'room.updated',
      payload: {
        locked: this.locked,
        hostId: this.hostId,
        permissions: { ...this.permissions },
      },
    });
  }

  updatePermissions(partial: {
    waitingRoom?: boolean | undefined;
    allowGuestChat?: boolean | undefined;
    allowGuestScreenShare?: boolean | undefined;
    allowGuestReactions?: boolean | undefined;
  }): RoomPermissions {
    if (partial.waitingRoom !== undefined) {
      this.permissions.waitingRoom = partial.waitingRoom;
    }
    if (partial.allowGuestChat !== undefined) {
      this.permissions.allowGuestChat = partial.allowGuestChat;
    }
    if (partial.allowGuestScreenShare !== undefined) {
      this.permissions.allowGuestScreenShare = partial.allowGuestScreenShare;
    }
    if (partial.allowGuestReactions !== undefined) {
      this.permissions.allowGuestReactions = partial.allowGuestReactions;
    }
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'room.updated',
      payload: {
        locked: this.locked,
        hostId: this.hostId,
        permissions: { ...this.permissions },
      },
    });
    return this.permissions;
  }

  endMeetingForAll(byPeer: { id: string; displayName: string }): void {
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'host.command',
      payload: {
        command: 'meeting_ended',
        byPeerId: byPeer.id,
        byDisplayName: byPeer.displayName,
      },
    });

    for (const w of this.waitingPeers.values()) {
      if (w.socket.readyState === 1) {
        try {
          w.socket.send(
            JSON.stringify({
              v: 1,
              ts: Date.now(),
              type: 'error',
              payload: {
                code: 'NOT_ADMITTED',
                message: 'The meeting has ended.',
              },
            }),
          );
        } catch {
          // ignore
        }
      }
    }
    this.waitingPeers.clear();

    const allIds = Array.from(this.peers.keys());
    for (const id of allIds) {
      const p = this.peers.get(id);
      if (p?.reclaimTimer) {
        clearTimeout(p.reclaimTimer);
        p.reclaimTimer = null;
      }
    }
    this.peers.clear();
    this.hostId = null;
  }

  /**
   * Called when a socket disconnects without an explicit `leave`.
   * Holds the peer slot for `reclaimSlotMs` (default 30s) before reaping.
   */
  detachSocket(
    peerId: string,
    socket: WebSocket,
    onReaped?: (peerId: string) => void,
  ): void {
    const peer = this.peers.get(peerId);
    if (!peer || peer.socket !== socket) return;

    peer.socket = null;
    if (peer.reclaimTimer) {
      clearTimeout(peer.reclaimTimer);
    }

    peer.reclaimTimer = setTimeout(() => {
      peer.reclaimTimer = null;
      this.leavePeer(peerId, 'timeout');
      onReaped?.(peerId);
    }, this.reclaimSlotMs);
  }

  /**
   * Immediately removes a peer from the room and broadcasts `peer.left`.
   */
  leavePeer(peerId: string, reason = 'left'): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    if (peer.reclaimTimer) {
      clearTimeout(peer.reclaimTimer);
      peer.reclaimTimer = null;
    }

    this.peers.delete(peerId);
    this.handRaiseQueue = this.handRaiseQueue.filter(
      (h) => h.peerId !== peerId,
    );

    if (peer.role === 'viewer') {
      const stats = this.attendeeAnalytics.get(peerId);
      if (stats) {
        stats.leaveTime = Date.now();
        stats.durationMs = stats.leaveTime - stats.joinTime;
      }
      const viewerCount = Array.from(this.peers.values()).filter(
        (p) => p.role === 'viewer' && p.id !== peerId && p.socket !== null,
      ).length;
      this.webinar.viewerCount = viewerCount;
      this.webinar.peakViewers = this.peakViewers;
      for (const p of this.peers.values()) {
        if (
          p.socket &&
          (p.role === 'host' || p.role === 'cohost' || p.role === 'panelist')
        ) {
          p.send({
            v: 1,
            ts: Date.now(),
            type: 'webinar.analytics_updated',
            payload: {
              viewerCount,
              peakViewers: this.peakViewers,
            },
          });
        }
      }
    }

    // Reassign host if the host left (prefer cohost -> verified attendee -> any active peer)
    if (this.hostId === peerId) {
      const candidates = this.listActivePeers();
      const nextHost =
        candidates.find((p) => p.role === 'cohost') ??
        candidates.find((p) => p.role === 'attendee') ??
        candidates[0] ??
        Array.from(this.peers.values())[0];

      if (nextHost) {
        nextHost.role = 'host';
        this.hostId = nextHost.id;
        this.broadcast({
          v: 1,
          ts: Date.now(),
          type: 'peer.role.updated',
          payload: {
            peerId: nextHost.id,
            role: 'host',
            hostId: this.hostId,
          },
        });
        this.broadcastWaitingRoomUpdate();
      } else {
        this.hostId = null;
      }
      this.broadcast({
        v: 1,
        ts: Date.now(),
        type: 'room.updated',
        payload: {
          locked: this.locked,
          hostId: this.hostId,
          permissions: { ...this.permissions },
        },
      });
    }

    this.broadcast(
      {
        v: 1,
        ts: Date.now(),
        type: 'peer.left',
        payload: { peerId, reason },
      },
      peerId,
    );
  }

  broadcast(message: ServerMessage, excludePeerId?: string): void {
    for (const peer of this.peers.values()) {
      if (peer.id !== excludePeerId && peer.socket !== null) {
        peer.send(message);
      }
    }
  }

  clearAllTimers(): void {
    for (const peer of this.peers.values()) {
      if (peer.reclaimTimer) {
        clearTimeout(peer.reclaimTimer);
        peer.reclaimTimer = null;
      }
    }
  }

  // --- Collaboration (Phase 6) methods ---

  createBreakoutRooms(
    rooms: Array<{ name: string; peerIds?: string[] }>,
    durationMinutes?: number,
  ): BreakoutState {
    const breakoutRooms: BreakoutRoom[] = rooms.map((r, idx) => ({
      id: `bo-${randomUUID().slice(0, 8)}`,
      name: r.name || `Room ${idx + 1}`,
      peerIds: r.peerIds ?? [],
    }));

    this.breakout = {
      active: false,
      rooms: breakoutRooms,
      ...(durationMinutes
        ? { timerEndsAt: Date.now() + durationMinutes * 60 * 1000 }
        : {}),
    };
    return this.breakout;
  }

  assignBreakoutPeer(roomId: string, peerId: string): BreakoutState {
    for (const room of this.breakout.rooms) {
      room.peerIds = room.peerIds.filter((id) => id !== peerId);
      if (room.id === roomId) {
        room.peerIds.push(peerId);
      }
    }
    return this.breakout;
  }

  startBreakout(): BreakoutState {
    this.breakout.active = true;
    delete this.breakout.returnNoticeSeconds;
    return this.breakout;
  }

  recallBreakout(noticeSeconds = 30): BreakoutState {
    this.breakout.returnNoticeSeconds = noticeSeconds;
    return this.breakout;
  }

  endBreakout(): BreakoutState {
    this.breakout.active = false;
    delete this.breakout.returnNoticeSeconds;
    return this.breakout;
  }

  createPoll(params: {
    question: string;
    options: string[];
    isQuiz?: boolean | undefined;
    correctOptionIndex?: number | undefined;
    allowMultiple?: boolean | undefined;
    createdBy: string;
    creatorName: string;
  }): PollItem {
    const id = `poll-${randomUUID().slice(0, 8)}`;
    const poll: PollItem = {
      id,
      question: params.question,
      options: params.options,
      ...(params.isQuiz !== undefined ? { isQuiz: params.isQuiz } : {}),
      ...(params.correctOptionIndex !== undefined
        ? { correctOptionIndex: params.correctOptionIndex }
        : {}),
      ...(params.allowMultiple !== undefined
        ? { allowMultiple: params.allowMultiple }
        : {}),
      createdBy: params.createdBy,
      creatorName: params.creatorName,
      createdAt: Date.now(),
      closed: false,
      votes: {},
    };
    this.polls.set(id, poll);
    return poll;
  }

  votePoll(
    pollId: string,
    peerId: string,
    optionIndices: number[],
  ): PollItem | null {
    const poll = this.polls.get(pollId);
    if (!poll || poll.closed) return null;
    const firstOpt = optionIndices[0];
    poll.votes[peerId] = poll.allowMultiple
      ? optionIndices
      : firstOpt !== undefined
        ? [firstOpt]
        : [];
    const stats = this.attendeeAnalytics.get(peerId);
    if (stats) {
      stats.pollVotesCount += 1;
    }
    return poll;
  }

  closePoll(pollId: string): PollItem | null {
    const poll = this.polls.get(pollId);
    if (!poll) return null;
    poll.closed = true;
    return poll;
  }

  deletePoll(pollId: string): boolean {
    return this.polls.delete(pollId);
  }

  listPolls(): PollItem[] {
    return Array.from(this.polls.values());
  }

  launchFormIt(formUrl: string, title?: string): FormItSession {
    const match = formUrl.match(/\/f\/([^/?#]+)/);
    const slug = match && match[1] ? match[1] : 'form';
    const session: FormItSession = {
      id: `formit-${randomUUID().slice(0, 8)}`,
      formUrl,
      slug,
      ...(title ? { title } : {}),
      active: true,
      launchedAt: Date.now(),
      submissionsCount: 0,
      responses: [],
    };
    this.formit = session;
    return session;
  }

  recordFormItSubmission(
    peerId?: string,
    displayName?: string,
    editKey?: string | null,
  ): FormItSession | null {
    if (!this.formit || !this.formit.active) return null;
    this.formit.submissionsCount += 1;
    this.formit.responses.push({
      ...(peerId ? { peerId } : {}),
      ...(displayName ? { displayName } : {}),
      submittedAt: Date.now(),
      ...(editKey ? { editKey } : {}),
    });
    return this.formit;
  }

  closeFormIt(): FormItSession | null {
    if (!this.formit) return null;
    this.formit.active = false;
    return this.formit;
  }

  askQuestion(peerId: string, displayName: string, question: string): QaItem {
    const id = `qa-${randomUUID().slice(0, 8)}`;
    const qaItem: QaItem = {
      id,
      peerId,
      displayName,
      question,
      ts: Date.now(),
      upvotes: [],
      answered: false,
    };
    this.qa.set(id, qaItem);
    return qaItem;
  }

  upvoteQuestion(questionId: string, peerId: string): QaItem | null {
    const item = this.qa.get(questionId);
    if (!item) return null;
    if (item.upvotes.includes(peerId)) {
      item.upvotes = item.upvotes.filter((id) => id !== peerId);
    } else {
      item.upvotes.push(peerId);
    }
    return item;
  }

  answerQuestion(questionId: string, answered: boolean): QaItem | null {
    const item = this.qa.get(questionId);
    if (!item) return null;
    item.answered = answered;
    if (answered) {
      item.answeredAt = Date.now();
    } else {
      delete item.answeredAt;
    }
    return item;
  }

  dismissQuestion(questionId: string, dismissed: boolean): QaItem | null {
    const item = this.qa.get(questionId);
    if (!item) return null;
    item.dismissed = dismissed;
    return item;
  }

  deleteQuestion(questionId: string): boolean {
    return this.qa.delete(questionId);
  }

  listQa(): QaItem[] {
    return Array.from(this.qa.values());
  }

  updateHandRaise(
    peerId: string,
    displayName: string,
    raised: boolean,
  ): HandRaiseItem[] {
    if (raised) {
      if (!this.handRaiseQueue.some((item) => item.peerId === peerId)) {
        this.handRaiseQueue.push({
          peerId,
          displayName,
          raisedAt: Date.now(),
        });
      }
    } else {
      this.handRaiseQueue = this.handRaiseQueue.filter(
        (item) => item.peerId !== peerId,
      );
    }
    return this.handRaiseQueue;
  }

  lowerHand(targetPeerId?: string): HandRaiseItem[] {
    if (targetPeerId) {
      this.handRaiseQueue = this.handRaiseQueue.filter(
        (item) => item.peerId !== targetPeerId,
      );
      const peer = this.peers.get(targetPeerId);
      if (peer) {
        peer.state.handRaised = false;
      }
    } else {
      for (const item of this.handRaiseQueue) {
        const peer = this.peers.get(item.peerId);
        if (peer) {
          peer.state.handRaised = false;
        }
      }
      this.handRaiseQueue = [];
    }
    return this.handRaiseQueue;
  }

  recordWhiteboardAction(action: WhiteboardAction): void {
    if (action.type === 'clear') {
      this.whiteboardHistory = [action];
    } else {
      this.whiteboardHistory.push(action);
      if (this.whiteboardHistory.length > 500) {
        this.whiteboardHistory.shift();
      }
    }
  }

  updateNotes(
    content: string,
    version: number,
    displayName?: string,
  ): NotesDoc {
    this.notesDoc = {
      content,
      version,
      ...(displayName ? { lastUpdatedBy: displayName } : {}),
      lastUpdatedAt: Date.now(),
    };
    return this.notesDoc;
  }

  updateMeetingTimer(params: {
    action:
      | 'start'
      | 'pause'
      | 'reset'
      | 'set_countdown'
      | 'next_agenda'
      | 'set_agenda';
    durationSeconds?: number | undefined;
    agenda?: AgendaItem[] | undefined;
  }): MeetingTimer {
    if (params.action === 'set_countdown') {
      this.meetingTimer.type = 'countdown';
      this.meetingTimer.durationSeconds = params.durationSeconds ?? 300;
      this.meetingTimer.remainingSeconds = this.meetingTimer.durationSeconds;
    } else if (params.action === 'start') {
      this.meetingTimer.running = true;
      this.meetingTimer.startedAt = Date.now();
    } else if (params.action === 'pause') {
      this.meetingTimer.running = false;
      if (
        this.meetingTimer.type === 'countdown' &&
        this.meetingTimer.startedAt &&
        this.meetingTimer.remainingSeconds !== undefined
      ) {
        const elapsed = Math.floor(
          (Date.now() - this.meetingTimer.startedAt) / 1000,
        );
        this.meetingTimer.remainingSeconds = Math.max(
          0,
          this.meetingTimer.remainingSeconds - elapsed,
        );
      }
    } else if (params.action === 'reset') {
      this.meetingTimer.running = false;
      delete this.meetingTimer.startedAt;
      this.meetingTimer.remainingSeconds = this.meetingTimer.durationSeconds;
    } else if (params.action === 'set_agenda') {
      if (params.agenda) {
        this.meetingTimer.agenda = params.agenda;
      }
    } else if (params.action === 'next_agenda') {
      const current = this.meetingTimer.activeAgendaIndex ?? 0;
      if (this.meetingTimer.agenda && this.meetingTimer.agenda[current]) {
        this.meetingTimer.agenda[current].completed = true;
      }
      if (
        this.meetingTimer.agenda &&
        current + 1 < this.meetingTimer.agenda.length
      ) {
        this.meetingTimer.activeAgendaIndex = current + 1;
      }
    }
    return this.meetingTimer;
  }

  addChatReaction(
    messageId: string,
    emoji: string,
    peerId: string,
  ): Record<string, string[]> | null {
    const msg = this.chatHistory.find((m) => m.id === messageId);
    if (!msg) return null;
    if (!msg.reactions) {
      msg.reactions = {};
    }
    const currentList = msg.reactions[emoji] ?? [];
    if (currentList.includes(peerId)) {
      msg.reactions[emoji] = currentList.filter((p) => p !== peerId);
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji];
      }
    } else {
      msg.reactions[emoji] = [...currentList, peerId];
    }
    return msg.reactions;
  }

  // Phase 7 Webinar Management Methods
  enableWebinar(config?: Partial<WebinarState>): void {
    this.webinar = {
      ...this.webinar,
      enabled: true,
      practiceMode: config?.practiceMode ?? true,
      isLive: config?.isLive ?? false,
      maxViewers: config?.maxViewers ?? 1000,
      requireRegistration: config?.requireRegistration ?? false,
      autoApproveRegistrations: config?.autoApproveRegistrations ?? true,
      ticketPriceCents: config?.ticketPriceCents ?? 0,
      currency: config?.currency ?? 'USD',
      paymentProvider: config?.paymentProvider ?? 'free',
      customFields: config?.customFields ?? [],
      ...(config?.branding !== undefined ? { branding: config.branding } : {}),
      ...(config?.streamOut !== undefined
        ? { streamOut: config.streamOut }
        : {}),
      ...(config?.simulive !== undefined ? { simulive: config.simulive } : {}),
      ...(config?.startedAt !== undefined
        ? { startedAt: config.startedAt }
        : {}),
      ...(config?.endedAt !== undefined ? { endedAt: config.endedAt } : {}),
    };
    this.transport = 'sfu';
    this.maxParticipants = Math.max(
      this.maxParticipants,
      this.webinar.maxViewers ?? 1000,
    );
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.state',
      payload: this.webinar,
    });
  }

  goLiveWebinar(hostPeerId: string): boolean {
    if (!this.webinar.enabled || this.webinar.isLive) return false;
    this.webinar.practiceMode = false;
    this.webinar.isLive = true;
    this.webinar.startedAt = Date.now();
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.state',
      payload: this.webinar,
    });
    return true;
  }

  endLiveWebinar(hostPeerId: string): boolean {
    if (!this.webinar.enabled || !this.webinar.isLive) return false;
    this.webinar.isLive = false;
    this.webinar.endedAt = Date.now();
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.state',
      payload: this.webinar,
    });
    return true;
  }

  updateWebinarConfig(config: Record<string, unknown>): void {
    const next = { ...this.webinar };
    for (const [k, v] of Object.entries(config)) {
      if (v !== undefined) {
        (next as Record<string, unknown>)[k] = v;
      }
    }
    this.webinar = next;
    if (typeof config.maxViewers === 'number') {
      this.maxParticipants = Math.max(this.maxParticipants, config.maxViewers);
    }
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.state',
      payload: this.webinar,
    });
  }

  startWebinarStream(params?: {
    rtmpUrl?: string;
    streamKey?: string;
    hlsUrl?: string;
  }): WebinarStreamOut {
    const streamOut: WebinarStreamOut = {
      enabled: true,
      status: 'live',
      viewersCount: this.webinar.viewerCount,
      ...(params?.rtmpUrl !== undefined ? { rtmpUrl: params.rtmpUrl } : {}),
      ...(params?.streamKey !== undefined
        ? { streamKey: params.streamKey }
        : {}),
      hlsUrl:
        params?.hlsUrl ??
        `https://live.meetit.live/hls/${this.code}/index.m3u8`,
    };
    this.webinar.streamOut = streamOut;
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.stream_updated',
      payload: streamOut,
    });
    return streamOut;
  }

  stopWebinarStream(): WebinarStreamOut {
    const streamOut: WebinarStreamOut = {
      enabled: false,
      status: 'idle',
      viewersCount: 0,
      ...(this.webinar.streamOut?.rtmpUrl !== undefined
        ? { rtmpUrl: this.webinar.streamOut.rtmpUrl }
        : {}),
      ...(this.webinar.streamOut?.hlsUrl !== undefined
        ? { hlsUrl: this.webinar.streamOut.hlsUrl }
        : {}),
    };
    this.webinar.streamOut = streamOut;
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.stream_updated',
      payload: streamOut,
    });
    return streamOut;
  }

  syncWebinarSimulive(simulive: {
    positionSec: number;
    playing: boolean;
  }): void {
    const current = this.webinar.simulive ?? {
      enabled: true,
      title: 'Simulive Broadcast',
      durationSeconds: 3600,
      currentPositionSec: 0,
      playing: false,
    };
    this.webinar.simulive = {
      ...current,
      enabled: true,
      currentPositionSec: simulive.positionSec,
      playing: simulive.playing,
    };
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.simulive_updated',
      payload: this.webinar.simulive,
    });
  }

  addWebinarQuestion(
    peerId: string,
    authorName: string,
    question: string,
  ): WebinarQaItem {
    const item: WebinarQaItem = {
      id: randomUUID(),
      authorPeerId: peerId,
      authorName,
      question,
      upvotes: [],
      status: 'pending',
      createdAt: Date.now(),
    };
    this.moderatedQa.set(item.id, item);

    const stats = this.attendeeAnalytics.get(peerId);
    if (stats) {
      stats.qaCount += 1;
    }

    // Broadcast to host, cohosts, panelists and author
    for (const peer of this.peers.values()) {
      if (
        peer.socket &&
        (peer.role === 'host' ||
          peer.role === 'cohost' ||
          peer.role === 'panelist' ||
          peer.id === peerId)
      ) {
        peer.send({
          v: 1,
          ts: Date.now(),
          type: 'webinar.qa_updated',
          payload: { question: item },
        });
      }
    }
    return item;
  }

  upvoteWebinarQuestion(
    peerId: string,
    questionId: string,
  ): WebinarQaItem | null {
    const item = this.moderatedQa.get(questionId);
    if (!item) return null;
    if (!item.upvotes.includes(peerId)) {
      item.upvotes.push(peerId);
    }
    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.qa_updated',
      payload: { question: item },
    });
    return item;
  }

  moderateWebinarQuestion(
    questionId: string,
    status: 'pending' | 'approved' | 'dismissed' | 'answered',
    answer?: string,
    answeredBy?: string,
  ): WebinarQaItem | null {
    const item = this.moderatedQa.get(questionId);
    if (!item) return null;

    if (status === 'dismissed') {
      item.status = 'dismissed';
      this.broadcast({
        v: 1,
        ts: Date.now(),
        type: 'webinar.qa_deleted',
        payload: { questionId },
      });
      return item;
    }

    item.status = status;
    if (status === 'answered') {
      if (answer !== undefined) item.answer = answer;
      if (answeredBy !== undefined) item.answeredBy = answeredBy;
      item.answeredAt = Date.now();
    }

    this.broadcast({
      v: 1,
      ts: Date.now(),
      type: 'webinar.qa_updated',
      payload: { question: item },
    });
    return item;
  }

  listWebinarQa(role?: PeerRole): WebinarQaItem[] {
    const all = Array.from(this.moderatedQa.values());
    if (role === 'host' || role === 'cohost' || role === 'panelist') {
      return all;
    }
    return all.filter(
      (q) => q.status === 'approved' || q.status === 'answered',
    );
  }

  registerAttendee(
    reg: Omit<WebinarRegistration, 'id' | 'registeredAt' | 'joinToken'>,
  ): WebinarRegistration {
    const id = randomUUID();
    const joinToken = `wb_${randomUUID().replace(/-/g, '')}`;
    const newReg: WebinarRegistration = {
      ...reg,
      id,
      registeredAt: Date.now(),
      joinToken,
    };
    this.registrations.set(id, newReg);
    return newReg;
  }

  approveRegistration(registrationId: string): WebinarRegistration | null {
    const reg = this.registrations.get(registrationId);
    if (!reg) return null;
    reg.status = 'approved';
    return reg;
  }

  getRegistrationByToken(token: string): WebinarRegistration | undefined {
    return Array.from(this.registrations.values()).find(
      (r) => r.joinToken === token,
    );
  }

  listRegistrations(): WebinarRegistration[] {
    return Array.from(this.registrations.values());
  }

  getAttendeeAnalyticsReport(): Array<{
    peerId: string;
    displayName: string;
    role: PeerRole;
    joinTime: number;
    leaveTime?: number;
    durationSeconds: number;
    chatCount: number;
    pollVotesCount: number;
    qaCount: number;
    engagementScore: number;
  }> {
    const report: Array<{
      peerId: string;
      displayName: string;
      role: PeerRole;
      joinTime: number;
      leaveTime?: number;
      durationSeconds: number;
      chatCount: number;
      pollVotesCount: number;
      qaCount: number;
      engagementScore: number;
    }> = [];

    const now = Date.now();
    for (const [peerId, stats] of this.attendeeAnalytics.entries()) {
      const peer = this.peers.get(peerId);
      const leave = stats.leaveTime ?? (peer?.socket ? undefined : now);
      const durationSeconds = Math.round(
        ((leave ?? now) - stats.joinTime) / 1000,
      );
      let score = 50;
      if (durationSeconds > 60) score += 20;
      score +=
        stats.pollVotesCount * 10 + stats.qaCount * 10 + stats.chatCount * 2;
      score = Math.min(100, Math.max(0, score));

      report.push({
        peerId,
        displayName: peer?.displayName ?? 'Attendee',
        role: peer?.role ?? 'viewer',
        joinTime: stats.joinTime,
        ...(leave !== undefined ? { leaveTime: leave } : {}),
        durationSeconds,
        chatCount: stats.chatCount,
        pollVotesCount: stats.pollVotesCount,
        qaCount: stats.qaCount,
        engagementScore: score,
      });
    }
    return report;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly reclaimSlotMs: number;

  constructor(options: { reclaimSlotMs?: number } = {}) {
    this.reclaimSlotMs = options.reclaimSlotMs ?? 30_000;
  }

  get size(): number {
    return this.rooms.size;
  }

  values(): IterableIterator<Room> {
    return this.rooms.values();
  }

  listRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  createRoom(
    options: {
      code?: string;
      ownerId?: string;
      title?: string;
      description?: string;
      passcode?: string;
      waitingRoom?: boolean;
      permissions?: Partial<RoomPermissions>;
      transport?: 'mesh' | 'sfu';
      maxParticipants?: number;
      webinar?: boolean | Partial<WebinarState>;
      randomFn?: () => number;
    } = {},
  ): Room {
    let code = options.code;
    if (!code) {
      const maxAttempts = 20;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = generateRoomCode(options.randomFn);
        if (!this.rooms.has(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        throw new Error('Failed to generate unique room code after retries');
      }
    }

    const existing = this.rooms.get(code);
    if (existing) {
      if (options.ownerId !== undefined) existing.ownerId = options.ownerId;
      if (options.title !== undefined) existing.title = options.title;
      if (options.description !== undefined)
        existing.description = options.description;
      if (options.passcode !== undefined) {
        existing.passcode =
          options.passcode.trim().length > 0
            ? options.passcode.trim()
            : undefined;
      }
      if (options.waitingRoom !== undefined) {
        existing.permissions.waitingRoom = options.waitingRoom;
      }
      if (options.permissions) {
        existing.permissions = {
          ...existing.permissions,
          ...options.permissions,
        };
      }
      return existing;
    }

    const room = new Room(code, {
      ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}),
      ...(options.title !== undefined ? { title: options.title } : {}),
      ...(options.description !== undefined
        ? { description: options.description }
        : {}),
      ...(options.passcode !== undefined ? { passcode: options.passcode } : {}),
      ...(options.waitingRoom !== undefined
        ? { waitingRoom: options.waitingRoom }
        : {}),
      ...(options.permissions !== undefined
        ? { permissions: options.permissions }
        : {}),
      ...(options.transport !== undefined
        ? { transport: options.transport }
        : {}),
      ...(options.maxParticipants !== undefined
        ? { maxParticipants: options.maxParticipants }
        : {}),
      ...(options.webinar !== undefined ? { webinar: options.webinar } : {}),
      reclaimSlotMs: this.reclaimSlotMs,
    });
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getOrCreateRoom(code: string): Room {
    const existing = this.rooms.get(code);
    if (existing) return existing;
    return this.createRoom({ code });
  }

  clear(): void {
    for (const room of this.rooms.values()) {
      room.clearAllTimers();
    }
    this.rooms.clear();
  }
}
