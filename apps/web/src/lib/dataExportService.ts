/**
 * GDPR / NDPR / CCPA Machine-Readable Data Exporter for MeetIT.
 * Compiles user profile, rooms, recordings, chat transcripts, notes, and audit trails.
 */

import { supabase } from './supabase.js';
import { getAuditLogs } from './auditService.js';
import { logAuditEvent } from './auditService.js';

export interface UserDataExportBundle {
  exportMetadata: {
    exportDate: string;
    generatedForUserId: string | null;
    appVersion: string;
    complianceFrameworks: string[];
  };
  profile: Record<string, unknown> | null;
  rooms: Record<string, unknown>[];
  recordings: Record<string, unknown>[];
  transcripts: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  securitySettings: Record<string, unknown> | null;
}

export async function generateUserDataExport(
  userId?: string,
): Promise<UserDataExportBundle> {
  const bundle: UserDataExportBundle = {
    exportMetadata: {
      exportDate: new Date().toISOString(),
      generatedForUserId: userId ?? null,
      appVersion: 'MeetIT v1.6.0',
      complianceFrameworks: ['GDPR (Art. 20 Data Portability)', 'NDPR', 'CCPA'],
    },
    profile: null,
    rooms: [],
    recordings: [],
    transcripts: [],
    notes: [],
    auditLogs: [],
    securitySettings: null,
  };

  // 1. Fetch Profile
  if (supabase && userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (profile) bundle.profile = profile;
    } catch {
      // ignore
    }
  }

  // 2. Fetch Rooms
  if (supabase && userId) {
    try {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .eq('owner_id', userId);
      if (rooms) bundle.rooms = rooms;
    } catch {
      // ignore
    }
  }

  // 3. Fetch Recordings
  if (supabase && userId) {
    try {
      const { data: recs } = await supabase
        .from('recordings')
        .select('*')
        .eq('started_by', userId);
      if (recs) bundle.recordings = recs;
    } catch {
      // ignore
    }
  }

  // 4. Local Transcripts & Notes
  try {
    const rawNotes = localStorage.getItem('meetit_notes_items');
    if (rawNotes) {
      bundle.notes = JSON.parse(rawNotes);
    }
    const rawTranscripts = localStorage.getItem('meetit_transcripts');
    if (rawTranscripts) {
      bundle.transcripts = JSON.parse(rawTranscripts);
    }
    const rawSecurity = localStorage.getItem('meetit_security_settings');
    if (rawSecurity) {
      bundle.securitySettings = JSON.parse(rawSecurity);
    }
  } catch {
    // ignore
  }

  // 5. Audit Logs
  try {
    bundle.auditLogs = await getAuditLogs({ limit: 200 });
  } catch {
    // ignore
  }

  // Log compliance audit event
  void logAuditEvent({
    userId,
    action: 'compliance.export',
    targetType: 'user_data',
    targetId: userId,
    metadata: {
      roomsCount: bundle.rooms.length,
      recordingsCount: bundle.recordings.length,
      auditLogsCount: bundle.auditLogs.length,
    },
  });

  return bundle;
}

export function downloadJsonFile(filename: string, content: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
