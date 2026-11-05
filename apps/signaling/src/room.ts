import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  generateRoomCode,
  type ErrorCode,
  type PeerInfo,
  type PeerRole,
  type PeerState,
  type ServerMessage,
} from '@meetit/protocol';

const DEFAULT_PEER_STATE: PeerState = {
  audio: true,
  video: true,
  screen: false,
  handRaised: false,
};

export class Peer {
  readonly id: string;
  displayName: string;
  role: PeerRole;
  state: PeerState;
  socket: WebSocket | null;
  isAlive = true;
  lastReactionAt = 0;
  reclaimTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(params: {
    id: string;
    displayName: string;
    role: PeerRole;
    state?: PeerState;
    socket: WebSocket;
  }) {
    this.id = params.id;
    this.displayName = params.displayName;
    this.role = params.role;
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
      state: { ...this.state },
    };
  }
}

export type JoinResult =
  | { ok: true; peer: Peer; reclaimed: boolean }
  | { ok: false; code: ErrorCode; message: string };

export class Room {
  readonly code: string;
  title?: string;
  locked = false;
  hostId: string | null = null;
  readonly maxParticipants: number;
  readonly createdAt: number = Date.now();

  private readonly peers = new Map<string, Peer>();
  private readonly reclaimSlotMs: number;
  private chatSequence = 0;

  constructor(
    code: string,
    options: {
      title?: string;
      maxParticipants?: number;
      reclaimSlotMs?: number;
    } = {},
  ) {
    this.code = code;
    if (options.title !== undefined) {
      this.title = options.title;
    }
    this.maxParticipants = options.maxParticipants ?? 4;
    this.reclaimSlotMs = options.reclaimSlotMs ?? 30_000;
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

  joinPeer(params: {
    socket: WebSocket;
    displayName: string;
    requestedSelfId?: string;
    initialState?: PeerState;
    isAuthenticatedUser?: boolean;
  }): JoinResult {
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

        return { ok: true, peer: existing, reclaimed: true };
      }
    }

    // 2. Check room lock & capacity
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
    const isFirstHost = this.hostId === null || this.peers.size === 0;
    const role: PeerRole = isFirstHost
      ? 'host'
      : params.isAuthenticatedUser
        ? 'attendee'
        : 'guest';

    const peer = new Peer({
      id: peerId,
      displayName: params.displayName,
      role,
      ...(params.initialState ? { state: params.initialState } : {}),
      socket: params.socket,
    });

    this.peers.set(peerId, peer);
    if (isFirstHost) {
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

    return { ok: true, peer, reclaimed: false };
  }

  /**
   * Called when a socket disconnects without an explicit `leave`.
   * Holds the peer slot for `reclaimSlotMs` (default 30s) before reaping.
   */
  detachSocket(peerId: string, socket: WebSocket): void {
    const peer = this.peers.get(peerId);
    if (!peer || peer.socket !== socket) return;

    peer.socket = null;
    if (peer.reclaimTimer) {
      clearTimeout(peer.reclaimTimer);
    }

    peer.reclaimTimer = setTimeout(() => {
      peer.reclaimTimer = null;
      this.leavePeer(peerId, 'timeout');
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

    // Reassign host if the host left
    if (this.hostId === peerId) {
      const nextHost =
        this.listActivePeers()[0] ?? Array.from(this.peers.values())[0];
      if (nextHost) {
        nextHost.role = 'host';
        this.hostId = nextHost.id;
      } else {
        this.hostId = null;
      }
      this.broadcast({
        v: 1,
        ts: Date.now(),
        type: 'room.updated',
        payload: { locked: this.locked, hostId: this.hostId },
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
      title?: string;
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
    if (existing) return existing;

    const room = new Room(code, {
      ...(options.title !== undefined ? { title: options.title } : {}),
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
