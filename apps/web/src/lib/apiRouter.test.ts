import { describe, it, expect, beforeEach } from 'vitest';
import { ApiKeyService, ApiRouter } from './apiRouter';

describe('Public REST API Router v1', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    globalThis.window = {
      localStorage: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          mockStorage = {};
        },
        length: 0,
        key: () => null,
      } as Storage,
    } as unknown as Window & typeof globalThis;
  });

  it('generates API keys and rejects unauthorized requests without token', async () => {
    const res = await ApiRouter.handleRequest({
      method: 'POST',
      path: '/api/v1/rooms',
      headers: {},
      body: {},
    });

    expect(res.status).toBe(401);
    expect(res.data.success).toBe(false);
  });

  it('rejects requests when API key lacks required scope', async () => {
    // Create key with only 'recordings:read' scope
    const { secretKey } = await ApiKeyService.createKey('Read Only Key', [
      'recordings:read',
    ]);

    // Try to call POST /api/v1/rooms which requires 'rooms:write'
    const res = await ApiRouter.handleRequest({
      method: 'POST',
      path: '/api/v1/rooms',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
      body: {},
    });

    expect(res.status).toBe(403);
    expect(res.data.success).toBe(false);
    if (!res.data.success) {
      expect(res.data.error.code).toBe('FORBIDDEN');
      expect(res.data.error.message).toContain('rooms:write');
    }
  });

  it('creates rooms via POST /api/v1/rooms with rate limit headers', async () => {
    const { secretKey } = await ApiKeyService.createKey('Full Access Key', [
      'rooms:read',
      'rooms:write',
      'recordings:read',
      'webhooks:manage',
    ]);

    const res = await ApiRouter.handleRequest({
      method: 'POST',
      path: '/api/v1/rooms',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
      body: {
        title: 'Developer Demo Meeting',
        maxParticipants: 25,
        expiresInHours: 48,
      },
    });

    expect(res.status).toBe(201);
    expect(res.headers['X-RateLimit-Limit']).toBe('60');
    expect(Number(res.headers['X-RateLimit-Remaining'])).toBeLessThanOrEqual(
      59,
    );
    expect(res.data.success).toBe(true);

    if (res.data.success) {
      const data = res.data.data as any;
      expect(data.roomCode).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
      expect(data.roomUrl).toContain(data.roomCode);
      expect(data.hostToken).toBeDefined();
      expect(data.guestToken).toBeDefined();
    }
  });

  it('retrieves room details and recordings with valid token', async () => {
    const { secretKey } = await ApiKeyService.createKey('Service Key', [
      'rooms:read',
      'recordings:read',
    ]);

    const roomRes = await ApiRouter.handleRequest({
      method: 'GET',
      path: '/api/v1/rooms/gzh-kfwu-wqt',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    expect(roomRes.status).toBe(200);
    expect(roomRes.data.success).toBe(true);

    const recRes = await ApiRouter.handleRequest({
      method: 'GET',
      path: '/api/v1/recordings',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    expect(recRes.status).toBe(200);
    expect(recRes.data.success).toBe(true);
    if (recRes.data.success) {
      const recs = recRes.data.data as any[];
      expect(recs.length).toBeGreaterThanOrEqual(1);
      expect(recs[0]?.downloadUrl).toBeDefined();
    }
  });
});
