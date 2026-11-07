import { supabase, isSupabaseConfigured } from './supabase';
import { normalizeRoomCode } from '../types';

export type RecordingStatus = 'recording' | 'processing' | 'ready' | 'failed';
export type RecordingLayout = 'grid' | 'speaker';

export interface RecordingItem {
  id: string;
  roomCode: string;
  roomTitle: string;
  startedAt: string; // ISO string
  endedAt?: string | undefined;
  durationSeconds: number;
  fileSizeBytes: number;
  status: RecordingStatus;
  layout: RecordingLayout;
  storagePath: string;
  downloadUrl?: string | undefined;
  playUrl?: string | undefined;
  startedBy?: string | undefined;
  startedByName?: string | undefined;
  expiresAt?: string | undefined;
  retentionDays?: number | undefined;
  isoTracks?: boolean | undefined;
}

const RECORDINGS_STORAGE_KEY = 'meetit_recordings_v1';

// Sample demo recordings for first-time onboarding or offline testing
const DEMO_RECORDINGS: RecordingItem[] = [
  {
    id: 'rec-demo-001',
    roomCode: 'ebg-dzxk-exs',
    roomTitle: 'Product Design Sync & Review',
    startedAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    endedAt: new Date(
      Date.now() - 3600 * 1000 * 24 + 1845 * 1000,
    ).toISOString(),
    durationSeconds: 1845,
    fileSizeBytes: 48_500_000,
    status: 'ready',
    layout: 'grid',
    storagePath: 'recordings/ebg-dzxk-exs/product-sync-20261106.mp4',
    playUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    downloadUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    startedByName: 'James Uchechi',
    isoTracks: true,
    retentionDays: 30,
    expiresAt: new Date(Date.now() + 29 * 86400 * 1000).toISOString(),
  },
  {
    id: 'rec-demo-002',
    roomCode: 'klm-pqrs-tuv',
    roomTitle: 'Architecture Planning & Latency Optimization',
    startedAt: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    endedAt: new Date(Date.now() - 3600 * 1000 * 48 + 920 * 1000).toISOString(),
    durationSeconds: 920,
    fileSizeBytes: 24_100_000,
    status: 'ready',
    layout: 'speaker',
    storagePath: 'recordings/klm-pqrs-tuv/arch-planning-20261105.mp4',
    playUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    downloadUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    startedByName: 'James Uchechi',
    isoTracks: false,
    retentionDays: 90,
    expiresAt: new Date(Date.now() + 88 * 86400 * 1000).toISOString(),
  },
];

export function loadLocalRecordings(ownerId?: string): RecordingItem[] {
  try {
    const raw = window.localStorage.getItem(RECORDINGS_STORAGE_KEY);
    if (!raw) {
      // Seed initial sample recordings for immediate preview
      saveLocalRecordings(DEMO_RECORDINGS);
      return DEMO_RECORDINGS;
    }
    const parsed = JSON.parse(raw) as RecordingItem[];
    if (!Array.isArray(parsed)) return [];
    const filtered = ownerId
      ? parsed.filter((r) => !r.startedBy || r.startedBy === ownerId)
      : parsed;
    return filtered.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  } catch {
    return DEMO_RECORDINGS;
  }
}

export function saveLocalRecordings(recordings: RecordingItem[]): void {
  try {
    window.localStorage.setItem(
      RECORDINGS_STORAGE_KEY,
      JSON.stringify(recordings),
    );
  } catch {
    // ignore quota error
  }
}

export async function fetchRecordings(
  ownerId?: string,
): Promise<RecordingItem[]> {
  const local = loadLocalRecordings(ownerId);

  if (!isSupabaseConfigured || !supabase) {
    return local;
  }

  try {
    let query = supabase
      .from('recordings')
      .select('*')
      .order('started_at', { ascending: false });

    if (ownerId) {
      query = query.eq('started_by', ownerId);
    }

    const { data, error } = await query;
    if (error || !data) {
      return local;
    }

    const remoteRecords: RecordingItem[] = data.map((row) => {
      const code =
        normalizeRoomCode(String(row.room_code || '')) || 'meetit-room';
      return {
        id: String(row.id),
        roomCode: code,
        roomTitle: (row.room_title as string) || `Room ${code}`,
        startedAt: (row.started_at as string) || new Date().toISOString(),
        ...(row.ended_at ? { endedAt: row.ended_at as string } : {}),
        durationSeconds: (row.duration_seconds as number) || 0,
        fileSizeBytes: (row.file_size_bytes as number) || 0,
        status: (row.status as RecordingStatus) || 'ready',
        layout: (row.layout as RecordingLayout) || 'grid',
        storagePath: (row.storage_path as string) || '',
        ...(row.download_url
          ? { downloadUrl: row.download_url as string }
          : {}),
        ...(row.download_url ? { playUrl: row.download_url as string } : {}),
        ...(row.started_by ? { startedBy: row.started_by as string } : {}),
        ...(row.expires_at ? { expiresAt: row.expires_at as string } : {}),
        ...(typeof row.retention_days === 'number'
          ? { retentionDays: row.retention_days as number }
          : {}),
        ...(typeof row.iso_tracks === 'boolean'
          ? { isoTracks: row.iso_tracks as boolean }
          : {}),
      };
    });

    if (remoteRecords.length === 0) {
      return local;
    }

    saveLocalRecordings(remoteRecords);
    return remoteRecords;
  } catch {
    return local;
  }
}

export async function deleteRecording(id: string): Promise<boolean> {
  // Update local storage
  try {
    const existing = loadLocalRecordings();
    const target = existing.find((r) => r.id === id);
    const updated = existing.filter((r) => r.id !== id);
    saveLocalRecordings(updated);

    if (isSupabaseConfigured && supabase) {
      await supabase.from('recordings').delete().eq('id', id);
      if (target?.storagePath) {
        await supabase.storage.from('recordings').remove([target.storagePath]);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i] ?? 'B'}`;
}

export function formatRecordingDuration(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatRecordingDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatExpiryCountdown(expiresAtStr?: string): string | null {
  if (!expiresAtStr) return null;
  try {
    const target = new Date(expiresAtStr).getTime();
    const now = Date.now();
    const diffMs = target - now;
    if (diffMs <= 0) return 'Expired';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 1) {
      return `Expires in ${diffDays}d`;
    }
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours >= 1) {
      return `Expires in ${diffHours}h`;
    }
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `Expires in ${Math.max(1, diffMins)}m`;
  } catch {
    return null;
  }
}
