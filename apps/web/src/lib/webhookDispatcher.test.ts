import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeHmacSha256,
  verifyWebhookSignature,
  WebhookDispatcher,
} from './webhookDispatcher';

describe('WebhookDispatcher & HMAC Signing', () => {
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

  it('computes and verifies HMAC-SHA256 signatures correctly', async () => {
    const secret = 'whsec_test_secret_key_12345';
    const payload = JSON.stringify({
      event: 'recording.ready',
      roomCode: 'abc-defg-hij',
    });
    const timestamp = String(Date.now());

    const message = `${timestamp}.${payload}`;
    const signature = await computeHmacSha256(message, secret);

    expect(signature).toHaveLength(64); // 256-bit hex is 64 characters

    const verification = await verifyWebhookSignature(
      payload,
      `sha256=${signature}`,
      timestamp,
      secret,
    );
    expect(verification.valid).toBe(true);
  });

  it('rejects tampered payloads or wrong secrets', async () => {
    const secret = 'whsec_valid_secret';
    const payload = JSON.stringify({ event: 'meeting.started' });
    const timestamp = String(Date.now());

    const signature = await computeHmacSha256(
      `${timestamp}.${payload}`,
      secret,
    );

    const tamperedCheck = await verifyWebhookSignature(
      JSON.stringify({ event: 'meeting.started', tampered: true }),
      `sha256=${signature}`,
      timestamp,
      secret,
    );
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reason).toBe('Signature mismatch');

    const wrongSecretCheck = await verifyWebhookSignature(
      payload,
      `sha256=${signature}`,
      timestamp,
      'whsec_wrong_key',
    );
    expect(wrongSecretCheck.valid).toBe(false);
  });

  it('rejects timestamps outside acceptable clock skew window', async () => {
    const secret = 'whsec_test_secret';
    const payload = JSON.stringify({ event: 'meeting.ended' });
    const expiredTimestamp = String(Date.now() - 600000); // 10 minutes ago

    const signature = await computeHmacSha256(
      `${expiredTimestamp}.${payload}`,
      secret,
    );

    const result = await verifyWebhookSignature(
      payload,
      `sha256=${signature}`,
      expiredTimestamp,
      secret,
      300000, // 5 min max window
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('outside acceptable window');
  });

  it('registers subscriptions and dispatches signed events to subscribers', async () => {
    const sub = WebhookDispatcher.registerSubscription(
      'https://api.thirdparty.com/webhook',
      ['meeting.started', 'recording.ready'],
      'whsec_custom_secret',
    );

    expect(sub.id).toBeDefined();
    expect(sub.url).toBe('https://api.thirdparty.com/webhook');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    const attempts = await WebhookDispatcher.dispatchEvent(
      'recording.ready',
      {
        roomCode: 'gzh-kfwu-wqt',
        recordingUrl: 'https://cdn.meetit.app/recordings/test.mp4',
      },
      mockFetch as unknown as typeof fetch,
    );

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('success');
    expect(attempts[0]?.httpStatus).toBe(200);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toBe('https://api.thirdparty.com/webhook');
    expect(calledInit.headers).toHaveProperty('X-MeetIt-Signature');
    expect(calledInit.headers).toHaveProperty(
      'X-MeetIt-Event',
      'recording.ready',
    );

    const history = WebhookDispatcher.getDeliveryHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
  });
});
