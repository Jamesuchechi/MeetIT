import {
  type ApiKey,
  type ApiKeyScope,
  type CreateRoomApiRequest,
  type CreateRoomApiResponse,
  type WebhookSubscription,
  createRoomApiRequestSchema,
  generateRoomCode,
} from '@meetit/protocol';
import { WebhookDispatcher } from './webhookDispatcher';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data:
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } };
}

export interface ApiRequest {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

const API_KEYS_STORAGE_KEY = 'meetit_api_keys_v1';
const RATE_LIMIT_STORAGE_KEY = 'meetit_rate_limits_v1';

export class ApiKeyService {
  private static async hashSecret(rawSecret: string): Promise<string> {
    try {
      if (
        typeof crypto !== 'undefined' &&
        crypto.subtle &&
        typeof crypto.subtle.digest === 'function'
      ) {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest(
          'SHA-256',
          encoder.encode(rawSecret),
        );
        return Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
    } catch {
      // fallback
    }

    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < rawSecret.length; i++) {
      const ch = rawSecret.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0))
      .toString(16)
      .padStart(64, '0');
  }

  public static getKeys(): ApiKey[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem(API_KEYS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ApiKey[]) : [];
    } catch {
      return [];
    }
  }

  public static async createKey(
    name: string,
    scopes: ApiKeyScope[],
    expiresInDays?: number,
  ): Promise<{ apiKey: ApiKey; secretKey: string }> {
    const rawSecret = `mkit_live_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const prefix = rawSecret.slice(0, 16);

    const hashedSecret = await this.hashSecret(rawSecret);

    const key: ApiKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      keyPrefix: prefix,
      hashedSecret,
      scopes,
      createdAt: Date.now(),
      ...(expiresInDays
        ? { expiresAt: Date.now() + expiresInDays * 86400000 }
        : {}),
    };

    const keys = this.getKeys();
    keys.unshift(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
    }

    return { apiKey: key, secretKey: rawSecret };
  }

  public static revokeKey(id: string): boolean {
    const keys = this.getKeys();
    const filtered = keys.filter((k) => k.id !== id);
    if (filtered.length !== keys.length) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          API_KEYS_STORAGE_KEY,
          JSON.stringify(filtered),
        );
      }
      return true;
    }
    return false;
  }

  public static async validateKey(
    bearerToken: string,
    requiredScope?: ApiKeyScope,
  ): Promise<{
    valid: boolean;
    key?: ApiKey | undefined;
    error?: string | undefined;
  }> {
    if (!bearerToken.startsWith('mkit_live_')) {
      return { valid: false, error: 'Invalid API key format' };
    }

    const hashed = await this.hashSecret(bearerToken);

    const keys = this.getKeys();
    const matched = keys.find((k) => k.hashedSecret === hashed);

    if (!matched) {
      return { valid: false, error: 'API key not found or revoked' };
    }

    if (matched.expiresAt && Date.now() > matched.expiresAt) {
      return { valid: false, error: 'API key has expired' };
    }

    if (requiredScope && !matched.scopes.includes(requiredScope)) {
      return {
        valid: false,
        error: `API key lacks required scope '${requiredScope}'`,
      };
    }

    return { valid: true, key: matched };
  }
}

/**
 * Token Bucket Rate Limiter (Default: 60 requests/minute per API key).
 */
export class RateLimiter {
  private static limit = 60;
  private static windowMs = 60000;

  public static check(keyId: string): {
    allowed: boolean;
    remaining: number;
    resetSecs: number;
  } {
    const now = Date.now();
    let store: Record<string, { count: number; resetAt: number }> = {};
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
        if (raw) store = JSON.parse(raw);
      }
    } catch {
      // ignore
    }

    const record = store[keyId] ?? { count: 0, resetAt: now + this.windowMs };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + this.windowMs;
    }

    record.count += 1;
    store[keyId] = record;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(
          RATE_LIMIT_STORAGE_KEY,
          JSON.stringify(store),
        );
      } catch {
        // ignore
      }
    }

    const remaining = Math.max(0, this.limit - record.count);
    const resetSecs = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      allowed: record.count <= this.limit,
      remaining,
      resetSecs,
    };
  }
}

/**
 * Public REST API Router handling /api/v1/* requests.
 */
export class ApiRouter {
  public static async handleRequest(req: ApiRequest): Promise<ApiResponse> {
    const authHeader =
      req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Check path routing
    const url = new URL(req.path, 'https://meetit.app');
    const pathname = url.pathname;

    // 1. Authentication check
    if (!token) {
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        data: {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or malformed Authorization Bearer header',
          },
        },
      };
    }

    // Determine required scope
    let requiredScope: ApiKeyScope | undefined;
    if (pathname === '/api/v1/rooms' && req.method === 'POST') {
      requiredScope = 'rooms:write';
    } else if (pathname.startsWith('/api/v1/rooms') && req.method === 'GET') {
      requiredScope = 'rooms:read';
    } else if (pathname.startsWith('/api/v1/meetings')) {
      requiredScope = 'meetings:read';
    } else if (pathname.startsWith('/api/v1/recordings')) {
      requiredScope = 'recordings:read';
    } else if (pathname.startsWith('/api/v1/transcripts')) {
      requiredScope = 'transcripts:read';
    } else if (pathname.startsWith('/api/v1/webhooks')) {
      requiredScope = 'webhooks:manage';
    }

    const authResult = await ApiKeyService.validateKey(token, requiredScope);
    if (!authResult.valid || !authResult.key) {
      return {
        status: authResult.error?.includes('scope') ? 403 : 401,
        headers: { 'Content-Type': 'application/json' },
        data: {
          success: false,
          error: {
            code: authResult.error?.includes('scope')
              ? 'FORBIDDEN'
              : 'UNAUTHORIZED',
            message: authResult.error || 'Unauthorized',
          },
        },
      };
    }

    // 2. Rate Limiting check
    const rateCheck = RateLimiter.check(authResult.key.id);
    const standardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': String(rateCheck.remaining),
      'X-RateLimit-Reset': String(rateCheck.resetSecs),
    };

    if (!rateCheck.allowed) {
      return {
        status: 429,
        headers: {
          ...standardHeaders,
          'Retry-After': String(rateCheck.resetSecs),
        },
        data: {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded. Maximum 60 requests per minute.',
          },
        },
      };
    }

    // 3. Route Handlers
    // POST /api/v1/rooms
    if (pathname === '/api/v1/rooms' && req.method === 'POST') {
      const parseResult = createRoomApiRequestSchema.safeParse(req.body ?? {});
      if (!parseResult.success) {
        return {
          status: 400,
          headers: standardHeaders,
          data: {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Invalid room creation payload parameters',
            },
          },
        };
      }

      const input = parseResult.data;
      const roomCode = generateRoomCode();
      const hostToken = `host_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const guestToken = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = Date.now();
      const expiresInHours = input.expiresInHours ?? 24;
      const expiresAt = now + expiresInHours * 3600000;

      const responseData: CreateRoomApiResponse = {
        roomCode,
        roomUrl: `https://meetit.app/m/${roomCode}?token=${guestToken}`,
        hostUrl: `https://meetit.app/m/${roomCode}?token=${hostToken}`,
        hostToken,
        guestToken,
        createdAt: now,
        expiresAt,
      };

      if (input.webhookUrl) {
        WebhookDispatcher.registerSubscription(input.webhookUrl, [
          'meeting.started',
          'meeting.ended',
          'recording.ready',
        ]);
      }

      return {
        status: 201,
        headers: standardHeaders,
        data: {
          success: true,
          data: responseData,
        },
      };
    }

    // GET /api/v1/rooms/:code
    if (pathname.startsWith('/api/v1/rooms/') && req.method === 'GET') {
      const code = pathname.split('/').pop() || '';
      return {
        status: 200,
        headers: standardHeaders,
        data: {
          success: true,
          data: {
            roomCode: code,
            active: true,
            maxParticipants: 100,
            activeParticipantsCount: 1,
            features: {
              e2ee: true,
              breakout: true,
              recording: true,
              transcription: true,
            },
          },
        },
      };
    }

    // GET /api/v1/recordings
    if (pathname === '/api/v1/recordings' && req.method === 'GET') {
      return {
        status: 200,
        headers: standardHeaders,
        data: {
          success: true,
          data: [
            {
              id: 'rec_01',
              roomCode: 'gzh-kfwu-wqt',
              title: 'Weekly Standup & Sprint Planning',
              durationSeconds: 1540,
              downloadUrl: 'https://cdn.meetit.app/recordings/rec_01.mp4',
              sizeBytes: 84200000,
              createdAt: Date.now() - 3600000,
            },
          ],
        },
      };
    }

    // Webhooks management: GET & POST /api/v1/webhooks
    if (pathname === '/api/v1/webhooks') {
      if (req.method === 'GET') {
        const subs = WebhookDispatcher.getSubscriptions();
        return {
          status: 200,
          headers: standardHeaders,
          data: {
            success: true,
            data: subs,
          },
        };
      } else if (req.method === 'POST') {
        const body = (req.body as any) || {};
        if (!body.url || !Array.isArray(body.events)) {
          return {
            status: 400,
            headers: standardHeaders,
            data: {
              success: false,
              error: {
                code: 'INVALID_REQUEST',
                message: 'Webhook requires url (string) and events (array)',
              },
            },
          };
        }
        const created = WebhookDispatcher.registerSubscription(
          body.url,
          body.events,
          body.secret,
        );
        return {
          status: 201,
          headers: standardHeaders,
          data: {
            success: true,
            data: created,
          },
        };
      }
    }

    // 404 Route Not Found
    return {
      status: 404,
      headers: standardHeaders,
      data: {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Endpoint ${req.method} ${pathname} not found`,
        },
      },
    };
  }
}
