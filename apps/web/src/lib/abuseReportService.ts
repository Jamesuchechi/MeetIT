/**
 * In-Meeting Abuse Reporting Service.
 * Submits structured moderation reports to Supabase or local storage fallback.
 */

import type { AbuseReportPayload } from '@meetit/protocol';
import { supabase } from './supabase.js';
import { logAuditEvent } from './auditService.js';

const LOCAL_REPORTS_KEY = 'meetit_abuse_reports';

export async function submitAbuseReport(
  payload: AbuseReportPayload,
  reporterId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Save to local storage
    try {
      const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      existing.push({
        id: crypto.randomUUID(),
        ...payload,
        reporterId,
        status: 'pending',
      });
      localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(existing));
    } catch {
      // ignore
    }

    // 2. Persist to Supabase if available
    if (supabase) {
      await supabase.from('abuse_reports').insert({
        id: crypto.randomUUID(),
        reporter_id: reporterId ?? null,
        reported_peer_id: payload.reportedPeerId,
        room_code: payload.roomCode,
        category: payload.category,
        details: payload.details ?? '',
        status: 'pending',
      });
    }

    // 3. Log audit event
    void logAuditEvent({
      userId: reporterId,
      action: 'settings.update',
      targetType: 'abuse_report',
      targetId: payload.roomCode,
      metadata: {
        category: payload.category,
        reportedPeerId: payload.reportedPeerId,
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit report' };
  }
}
