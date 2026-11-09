import {
  generateRoomCode as protocolGenerateRoomCode,
  normalizeRoomCode as protocolNormalizeRoomCode,
} from '@meetit/protocol';

export type ViewMode =
  | 'home'
  | 'dashboard'
  | 'signin'
  | 'signup'
  | 'room'
  | 'ended'
  | '404'
  | 'webinar-register';

export type DashboardTab =
  | 'home'
  | 'meetings'
  | 'schedule'
  | 'notes'
  | 'recordings'
  | 'transcripts'
  | 'developer'
  | 'settings'
  | 'profile'
  | 'profile-edit';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  headline?: string;
  bio?: string;
  organization?: string;
  location?: string;
  timezone?: string;
  createdAt?: string;
  isPro?: boolean;
}

export interface ToastMessage {
  id: number;
  text: string;
}

export const generateRoomCode = protocolGenerateRoomCode;
export const normalizeRoomCode = protocolNormalizeRoomCode;

/**
 * Deterministic, valid `xxx-xxxx-xxx` room code derived from a user id.
 * Stable per user until the persisted personal room lands (Phase 3, rooms).
 */
export function personalRoomCodeForUser(userId: string): string {
  const charset = 'abcdefghjkmnpqrstuvwxyz';
  const hex = userId.replace(/[^0-9a-f]/gi, '').padEnd(10, '0');
  let letters = '';
  for (let i = 0; i < 10; i++) {
    const n = parseInt(hex.slice(i * 2, i * 2 + 2) || '0', 16);
    letters += charset[n % charset.length];
  }
  return `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}`;
}

/**
 * Safe clipboard copy with fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for non-secure contexts
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    return successful;
  } catch {
    return false;
  }
}
