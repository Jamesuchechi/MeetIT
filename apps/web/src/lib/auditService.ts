/**
 * Structured Audit Logging Engine for MeetIT (Phase 10).
 * Records security-sensitive host actions, recordings, API keys, and compliance operations.
 * Supports querying, CSV export, and JSON export.
 */

import type { AuditAction, AuditLogEntry } from '@meetit/protocol';
import { supabase } from './supabase.js';

const LOCAL_AUDIT_KEY = 'meetit_audit_logs';
const MAX_LOCAL_LOGS = 500;

export interface AuditQueryFilters {
  action?: AuditAction | undefined;
  targetType?: string | undefined;
  startDate?: number | undefined;
  endDate?: number | undefined;
  limit?: number | undefined;
}

export interface LogAuditEventParams {
  userId?: string | null | undefined;
  action: AuditAction;
  targetType: string;
  targetId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export async function logAuditEvent(
  entry: LogAuditEventParams,
): Promise<AuditLogEntry> {
  const auditId = `audit_${crypto.randomUUID()}`;
  const now = Date.now();

  const newLog: AuditLogEntry = {
    id: auditId,
    userId: entry.userId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ipAddress: entry.ipAddress,
    userAgent:
      entry.userAgent ??
      (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
    createdAt: now,
  };

  // 1. Save to local storage for offline resilience
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    const existing: AuditLogEntry[] = raw ? JSON.parse(raw) : [];
    existing.unshift(newLog);
    if (existing.length > MAX_LOCAL_LOGS) {
      existing.length = MAX_LOCAL_LOGS;
    }
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(existing));
  } catch {
    // Ignore storage quota or SSR errors
  }

  // 2. Persist to Supabase if authenticated
  if (supabase) {
    try {
      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: newLog.userId,
        action: newLog.action,
        target_type: newLog.targetType,
        target_id: newLog.targetId,
        metadata: newLog.metadata,
        ip_address: newLog.ipAddress,
        user_agent: newLog.userAgent,
        created_at: new Date(newLog.createdAt).toISOString(),
      });
    } catch {
      // Non-fatal if Supabase table is not configured or user is offline
    }
  }

  return newLog;
}

export async function getAuditLogs(
  filters?: AuditQueryFilters,
): Promise<AuditLogEntry[]> {
  let logs: AuditLogEntry[] = [];

  // Try Supabase first
  if (supabase) {
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.action) {
        query = query.eq('action', filters.action);
      }
      if (filters?.targetType) {
        query = query.eq('target_type', filters.targetType);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        logs = data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          action: d.action,
          targetType: d.target_type,
          targetId: d.target_id,
          metadata: d.metadata || {},
          ipAddress: d.ip_address,
          userAgent: d.user_agent,
          createdAt: new Date(d.created_at).getTime(),
        }));
      }
    } catch {
      // Fallback to local
    }
  }

  // Merge / fallback with local storage
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    if (raw) {
      const localLogs: AuditLogEntry[] = JSON.parse(raw);
      const seenIds = new Set(logs.map((l) => l.id));
      for (const log of localLogs) {
        if (!seenIds.has(log.id)) {
          logs.push(log);
        }
      }
    }
  } catch {
    // ignore
  }

  // Apply in-memory filters for local logs
  let filtered = [...logs];
  if (filters?.action) {
    filtered = filtered.filter((l) => l.action === filters.action);
  }
  if (filters?.targetType) {
    filtered = filtered.filter((l) => l.targetType === filters.targetType);
  }
  if (filters?.startDate) {
    filtered = filtered.filter((l) => l.createdAt >= filters.startDate!);
  }
  if (filters?.endDate) {
    filtered = filtered.filter((l) => l.createdAt <= filters.endDate!);
  }

  filtered.sort((a, b) => b.createdAt - a.createdAt);
  if (filters?.limit && filtered.length > filters.limit) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}

export function exportAuditLogsAsJson(logs: AuditLogEntry[]): string {
  return JSON.stringify(logs, null, 2);
}

export function exportAuditLogsAsCsv(logs: AuditLogEntry[]): string {
  const headers = [
    'Timestamp',
    'Action',
    'Target Type',
    'Target ID',
    'User ID',
    'Details',
  ];
  const rows = logs.map((log) => {
    const date = new Date(log.createdAt).toISOString();
    const details = JSON.stringify(log.metadata).replace(/"/g, '""');
    return `"${date}","${log.action}","${log.targetType}","${log.targetId ?? ''}","${log.userId ?? ''}","${details}"`;
  });
  return [headers.join(','), ...rows].join('\n');
}
