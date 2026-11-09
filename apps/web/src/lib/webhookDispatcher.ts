import type {
  WebhookEventType,
  WebhookPayload,
  WebhookSubscription,
} from '@meetit/protocol';

export interface WebhookDeliveryAttempt {
  id: string;
  subscriptionId: string;
  event: WebhookEventType;
  url: string;
  payload: WebhookPayload;
  status: 'success' | 'failed';
  httpStatus?: number | undefined;
  error?: string | undefined;
  timestamp: number;
  attempt: number;
  nextRetryAt?: number | undefined;
}

const SUBSCRIPTIONS_KEY = 'meetit_webhook_subscriptions_v1';
const DELIVERIES_KEY = 'meetit_webhook_deliveries_v1';

/**
 * Computes HMAC-SHA256 hex signature using standard Web Crypto API.
 */
export async function computeHmacSha256(
  message: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies an incoming webhook HMAC-SHA256 signature and checks replay window (within 5 minutes).
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string,
  secret: string,
  maxClockSkewMs = 300000, // 5 minutes
): Promise<{ valid: boolean; reason?: string | undefined }> {
  const ts = Number(timestampHeader);
  if (!ts || isNaN(ts)) {
    return { valid: false, reason: 'Invalid or missing timestamp header' };
  }

  const now = Date.now();
  if (Math.abs(now - ts) > maxClockSkewMs) {
    return {
      valid: false,
      reason: 'Timestamp outside acceptable window (potential replay)',
    };
  }

  const cleanSignature = signatureHeader.replace(/^sha256=/, '').trim();
  const expectedMessage = `${timestampHeader}.${rawBody}`;
  const computed = await computeHmacSha256(expectedMessage, secret);

  if (computed !== cleanSignature) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return { valid: true };
}

export class WebhookDispatcher {
  /**
   * Retrieves registered webhook subscriptions.
   */
  public static getSubscriptions(): WebhookSubscription[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem(SUBSCRIPTIONS_KEY);
      return raw ? (JSON.parse(raw) as WebhookSubscription[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Registers a new webhook subscription.
   */
  public static registerSubscription(
    url: string,
    events: WebhookEventType[],
    secret?: string,
  ): WebhookSubscription {
    const subs = this.getSubscriptions();
    const newSub: WebhookSubscription = {
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url,
      secret:
        secret ||
        `whsec_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
      events,
      active: true,
      createdAt: Date.now(),
    };

    subs.push(newSub);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
    }
    return newSub;
  }

  /**
   * Deletes a webhook subscription by ID.
   */
  public static deleteSubscription(id: string): boolean {
    const subs = this.getSubscriptions();
    const filtered = subs.filter((s) => s.id !== id);
    if (filtered.length !== subs.length) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          SUBSCRIPTIONS_KEY,
          JSON.stringify(filtered),
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Dispatches an event to all active matching webhook subscribers with HMAC-SHA256 signing.
   */
  public static async dispatchEvent<T extends Record<string, unknown>>(
    event: WebhookEventType,
    data: T,
    fetchFn = fetch,
  ): Promise<WebhookDeliveryAttempt[]> {
    const subs = this.getSubscriptions().filter(
      (s) => s.active && s.events.includes(event),
    );

    const attempts: WebhookDeliveryAttempt[] = [];
    const timestamp = Date.now();
    const payloadId = `evt_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;

    const payload: WebhookPayload = {
      id: payloadId,
      event,
      timestamp,
      data,
      attempt: 1,
    };

    const rawBody = JSON.stringify(payload);

    for (const sub of subs) {
      const signaturePayload = `${timestamp}.${rawBody}`;
      const signature = await computeHmacSha256(signaturePayload, sub.secret);

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'MeetIT-Webhooks/1.0',
        'X-MeetIt-Event': event,
        'X-MeetIt-Delivery': payloadId,
        'X-MeetIt-Timestamp': String(timestamp),
        'X-MeetIt-Signature': `sha256=${signature}`,
      };

      const attemptRecord: WebhookDeliveryAttempt = {
        id: `att_${timestamp}_${Math.random().toString(36).slice(2, 6)}`,
        subscriptionId: sub.id,
        event,
        url: sub.url,
        payload,
        status: 'failed',
        timestamp,
        attempt: 1,
      };

      try {
        const response = await fetchFn(sub.url, {
          method: 'POST',
          headers,
          body: rawBody,
        });

        attemptRecord.httpStatus = response.status;
        if (response.ok) {
          attemptRecord.status = 'success';
        } else {
          attemptRecord.status = 'failed';
          attemptRecord.error = `HTTP ${response.status} ${response.statusText}`;
          attemptRecord.nextRetryAt = timestamp + 60000; // 1 min retry
        }
      } catch (err: any) {
        attemptRecord.status = 'failed';
        attemptRecord.error = err.message || 'Network request failed';
        attemptRecord.nextRetryAt = timestamp + 60000;
      }

      attempts.push(attemptRecord);
    }

    this.saveDeliveryAttempts(attempts);
    return attempts;
  }

  /**
   * Returns recent delivery history.
   */
  public static getDeliveryHistory(): WebhookDeliveryAttempt[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem(DELIVERIES_KEY);
      return raw ? (JSON.parse(raw) as WebhookDeliveryAttempt[]) : [];
    } catch {
      return [];
    }
  }

  private static saveDeliveryAttempts(
    newAttempts: WebhookDeliveryAttempt[],
  ): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const history = this.getDeliveryHistory();
      const combined = [...newAttempts, ...history].slice(0, 100);
      window.localStorage.setItem(DELIVERIES_KEY, JSON.stringify(combined));
    } catch {
      // ignore
    }
  }
}
