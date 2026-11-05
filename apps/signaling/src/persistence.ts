import { randomUUID } from 'node:crypto';
import type { PeerRole } from '@meetit/protocol';

export interface PersistedAttendee {
  peerId: string;
  userId?: string;
  displayName: string;
  role: PeerRole;
  joinedAt: string;
  leftAt?: string;
}

export interface PersistedMeetingRecord {
  id: string;
  roomCode: string;
  roomTitle?: string;
  startedAt: string;
  endedAt?: string;
  peakParticipants: number;
  transport: 'mesh' | 'sfu';
  attendees: PersistedAttendee[];
}

export class SignalingPersistence {
  private readonly supabaseUrl: string | undefined;
  private readonly serviceRoleKey: string | undefined;
  private readonly activeMeetingsByRoom = new Map<
    string,
    PersistedMeetingRecord
  >();
  private readonly completedMeetings: PersistedMeetingRecord[] = [];

  constructor(options: { supabaseUrl?: string; serviceRoleKey?: string } = {}) {
    this.supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
    this.serviceRoleKey =
      options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  get isRemoteConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.serviceRoleKey);
  }

  private async postSupabase(table: string, body: unknown): Promise<void> {
    if (!this.supabaseUrl || !this.serviceRoleKey) return;
    try {
      await fetch(`${this.supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(body),
      });
    } catch {
      // Non-fatal in signaling path
    }
  }

  recordRoomCreated(params: {
    code: string;
    title?: string;
    description?: string;
    ownerId?: string;
    kind?: 'instant' | 'scheduled' | 'personal';
  }): void {
    void this.postSupabase('rooms', {
      code: params.code,
      kind: params.kind ?? 'instant',
      ...(params.title ? { title: params.title } : {}),
      ...(params.description ? { description: params.description } : {}),
      ...(params.ownerId ? { owner_id: params.ownerId } : {}),
    });
  }

  recordPeerJoined(params: {
    roomCode: string;
    roomTitle?: string;
    peerId: string;
    userId?: string;
    displayName: string;
    role: PeerRole;
    currentParticipantCount: number;
  }): void {
    let active = this.activeMeetingsByRoom.get(params.roomCode);
    const nowIso = new Date().toISOString();

    if (!active) {
      active = {
        id: randomUUID(),
        roomCode: params.roomCode,
        ...(params.roomTitle ? { roomTitle: params.roomTitle } : {}),
        startedAt: nowIso,
        peakParticipants: params.currentParticipantCount,
        transport: 'mesh',
        attendees: [],
      };
      this.activeMeetingsByRoom.set(params.roomCode, active);
    } else {
      if (params.currentParticipantCount > active.peakParticipants) {
        active.peakParticipants = params.currentParticipantCount;
      }
      if (params.roomTitle && !active.roomTitle) {
        active.roomTitle = params.roomTitle;
      }
    }

    const existingAttendee = active.attendees.find(
      (a) => a.peerId === params.peerId && !a.leftAt,
    );
    if (!existingAttendee) {
      active.attendees.push({
        peerId: params.peerId,
        ...(params.userId ? { userId: params.userId } : {}),
        displayName: params.displayName,
        role: params.role,
        joinedAt: nowIso,
      });
    }
  }

  recordPeerLeft(params: {
    roomCode: string;
    peerId: string;
    remainingParticipants: number;
  }): void {
    const active = this.activeMeetingsByRoom.get(params.roomCode);
    if (!active) return;

    const nowIso = new Date().toISOString();
    for (const attendee of active.attendees) {
      if (attendee.peerId === params.peerId && !attendee.leftAt) {
        attendee.leftAt = nowIso;
      }
    }

    if (params.remainingParticipants === 0) {
      active.endedAt = nowIso;
      this.activeMeetingsByRoom.delete(params.roomCode);
      this.completedMeetings.unshift(active);
      if (this.completedMeetings.length > 200) {
        this.completedMeetings.pop();
      }
    }
  }

  listMeetingsHistory(limit = 50): PersistedMeetingRecord[] {
    const activeList = Array.from(this.activeMeetingsByRoom.values());
    return [...activeList, ...this.completedMeetings].slice(0, limit);
  }
}
