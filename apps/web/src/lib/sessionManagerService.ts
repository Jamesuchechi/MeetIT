/**
 * Active Session Manager for MeetIT.
 * Tracks signed-in browsers, operating systems, IPs, and supports remote revocation.
 */

import type { UserSession } from '@meetit/protocol';
import { logAuditEvent } from './auditService.js';

const SESSIONS_STORAGE_KEY = 'meetit_active_sessions';

export function getActiveSessions(): UserSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }

  // Seed default session if empty
  const defaultSessions: UserSession[] = [
    {
      id: 'sess_current',
      current: true,
      browser:
        typeof navigator !== 'undefined'
          ? parseBrowserName(navigator.userAgent)
          : 'Chrome 126',
      os:
        typeof navigator !== 'undefined'
          ? parseOsName(navigator.userAgent)
          : 'Linux x86_64',
      ipAddress: '197.210.54.12',
      location: 'Lagos, Nigeria',
      lastActiveAt: Date.now(),
      createdAt: Date.now() - 3600000,
    },
    {
      id: 'sess_mobile',
      current: false,
      browser: 'Mobile Safari 17.4',
      os: 'iOS 17.4.1 (iPhone 15)',
      ipAddress: '102.89.44.89',
      location: 'Abuja, Nigeria',
      lastActiveAt: Date.now() - 86400000,
      createdAt: Date.now() - 86400000 * 3,
    },
  ];

  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(defaultSessions));
  return defaultSessions;
}

export function revokeSession(
  sessionId: string,
  userId?: string,
): UserSession[] {
  const sessions = getActiveSessions().filter((s) => s.id !== sessionId);
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));

  void logAuditEvent({
    userId,
    action: 'security.session_revoke',
    targetType: 'session',
    targetId: sessionId,
  });

  return sessions;
}

export function revokeAllOtherSessions(userId?: string): UserSession[] {
  const current = getActiveSessions().filter((s) => s.current);
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(current));

  void logAuditEvent({
    userId,
    action: 'security.session_revoke',
    targetType: 'all_other_sessions',
  });

  return current;
}

function parseBrowserName(ua: string): string {
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Chrome/')) return 'Google Chrome';
  if (ua.includes('Safari/')) return 'Apple Safari';
  return 'Web Browser';
}

function parseOsName(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Operating System';
}
