import QRCode from 'qrcode';
import { type DeviceHandoffState, type PeerRole } from '@meetit/protocol';

const PENDING_HANDOFF_KEY = 'meetit_pending_handoff_v1';
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Detect current platform and browser for a human-readable device name
 */
export function getDeviceDescriptor(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent;

  let os = 'Computer';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android Phone';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'MacBook';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Linux/i.test(ua)) os = 'Linux Device';

  let browser = 'Browser';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Edg\//i.test(ua)) browser = 'Edge';

  return `${os} (${browser})`;
}

/**
 * Generate a unique, cryptographically random handoff token
 */
export function generateHandoffToken(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `mkt_handoff_${crypto.randomUUID()}_${Date.now()}`;
  }
  const rand = Math.random().toString(36).substring(2, 12);
  return `mkt_handoff_${rand}_${Date.now()}`;
}

export interface CreateHandoffOptions {
  roomCode: string;
  userId: string;
  displayName: string;
  role?: PeerRole;
  mediaState?: {
    audio: boolean;
    video: boolean;
    screen: boolean;
    handRaised: boolean;
  };
  targetDeviceHint?: string;
  ttlMs?: number;
}

/**
 * Initialize a new pending handoff state
 */
export function createHandoffState(
  options: CreateHandoffOptions,
): DeviceHandoffState {
  const now = Date.now();
  const token = generateHandoffToken();
  const nonce =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 10);

  const state: DeviceHandoffState = {
    handoffToken: token,
    roomCode: options.roomCode,
    userId: options.userId,
    displayName: options.displayName,
    role: options.role ?? 'guest',
    sourceDevice: getDeviceDescriptor(),
    targetDevice: options.targetDeviceHint ?? 'Mobile device',
    mediaState: options.mediaState ?? {
      audio: true,
      video: true,
      screen: false,
      handRaised: false,
    },
    nonce,
    createdAt: now,
    expiresAt: now + (options.ttlMs ?? DEFAULT_TTL_MS),
    status: 'pending',
  };

  savePendingHandoff(state);
  return state;
}

/**
 * Format the full URL the target device opens to claim handoff
 */
export function generateHandoffUrl(
  roomCode: string,
  token: string,
  origin?: string,
): string {
  const base =
    origin ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : 'https://meetit.app');
  return `${base}/m/${encodeURIComponent(roomCode)}?handoff=${encodeURIComponent(token)}`;
}

/**
 * Generate an SVG string representing the QR code for instant camera scanning
 */
export async function generateQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    width: 240,
    color: {
      dark: '#0a1220',
      light: '#ffffff',
    },
  });
}

/**
 * Extract a handoff token from a query string or URL
 */
export function extractHandoffToken(
  urlOrParams: string | URLSearchParams,
): string | null {
  if (typeof urlOrParams === 'string') {
    try {
      const parsed = new URL(urlOrParams, 'https://meetit.app');
      return parsed.searchParams.get('handoff');
    } catch {
      const match = /[?&]handoff=([^&#]+)/.exec(urlOrParams);
      return match ? decodeURIComponent(match[1]!) : null;
    }
  }
  return urlOrParams.get('handoff');
}

/**
 * Store the active handoff in sessionStorage
 */
export function savePendingHandoff(state: DeviceHandoffState): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(PENDING_HANDOFF_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or restriction errors
  }
}

/**
 * Retrieve the pending handoff from sessionStorage
 */
export function getPendingHandoff(): DeviceHandoffState | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceHandoffState;
    if (isHandoffExpired(parsed)) {
      clearPendingHandoff();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check if the handoff has passed its expiry time
 */
export function isHandoffExpired(state: DeviceHandoffState): boolean {
  return Date.now() >= state.expiresAt;
}

/**
 * Clear the pending handoff from storage
 */
export function clearPendingHandoff(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(PENDING_HANDOFF_KEY);
  } catch {
    // Ignore errors
  }
}
