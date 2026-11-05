export type ViewMode = 'home' | 'dashboard' | 'signin' | 'signup';

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

/**
 * Generates an accessible, human-friendly 3-4-3 room code.
 * Excludes ambiguous glyphs like 0/o, 1/l/i.
 */
export function generateRoomCode(): string {
  const charset = 'abcdefghjkmnpqrstuvwxyz';
  const pick = (length: number) => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[Math.floor(Math.random() * charset.length)];
    }
    return result;
  };
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

/**
 * Normalizes input text into a canonical room code `xxx-xxxx-xxx`
 * or returns null if it doesn't match a valid meeting code.
 */
export function normalizeRoomCode(input: string): string | null {
  const cleaned = String(input).toLowerCase().trim();
  const match = cleaned.match(/[a-z]{3}-?[a-z]{4}-?[a-z]{3}/);
  if (!match) return null;
  const raw = match[0].replace(/-/g, '');
  return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7)}`;
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
