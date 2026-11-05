import {
  generateRoomCode as protocolGenerateRoomCode,
  normalizeRoomCode as protocolNormalizeRoomCode,
} from '@meetit/protocol';

export type ViewMode =
  'home' | 'dashboard' | 'signin' | 'signup' | 'room' | 'ended' | '404';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  isPro?: boolean;
}

export interface ToastMessage {
  id: number;
  text: string;
}

export const generateRoomCode = protocolGenerateRoomCode;
export const normalizeRoomCode = protocolNormalizeRoomCode;

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
