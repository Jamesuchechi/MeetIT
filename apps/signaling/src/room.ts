import { createHash, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  generateRoomCode,
  type ErrorCode,
  type PeerInfo,
  type PeerRole,
  type PeerState,
  type RoomPermissions,
  type ServerMessage,
  type WaitingPeer,
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
  readonly maxParticipants: number;
  readonly createdAt: number = Date.now();

  private readonly peers = new Map<string, Peer>();
  private readonly waitingPeers = new Map<string, WaitingEntry>();
  private readonly blockedUserIds = new Set<string>();
  private readonly blockedFingerprints = new Set<string>();
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
      maxParticipants?: number;
      reclaimSlotMs?: number;
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
    this.maxParticipants = options.maxParticipants ?? 4;
    this.reclaimSlotMs = options.reclaimSlotMs ?? 30_000;
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
    const role: PeerRole = isFirstHost
      ? 'host'
      : params.isAuthenticatedUser
        ? 'attendee'
        : 'guest';

    // 4. Waiting room gate (for non-hosts when waitingRoom is enabled)
    if (this.permissions.waitingRoom && !isFirstHost) {
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

    const peer = new Peer({
      id: peerId,
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
      ...(params.tokenFingerprint !== undefined
        ? { tokenFingerprint: params.tokenFingerprint }
        : {}),
      displayName: params.displayName,
      role,
      verified: Boolean(params.isAuthenticatedUser),
      ...(params.initialState ? { state: params.initialState } : {}),
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

    this.broadcast(
      {
        v: 1,
        ts: Date.now(),
        type: 'peer.joined',
        payload: { peer: peer.toInfo() },
      },
      peerId,
    );

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

  setPeerRole(
    targetPeerId: string,
    nextRole: 'host' | 'cohost' | 'attendee',
  ): Peer | null {
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

  createRoom(
    options: {
      code?: string;
      ownerId?: string;
      title?: string;
      description?: string;
      passcode?: string;
      waitingRoom?: boolean;
      permissions?: Partial<RoomPermissions>;
      maxParticipants?: number;
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
      ...(options.maxParticipants !== undefined
        ? { maxParticipants: options.maxParticipants }
        : {}),
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
