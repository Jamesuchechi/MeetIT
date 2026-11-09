import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSavedWebinarPasses,
  saveWebinarPass,
  simulatePayment,
  exportAnalyticsToCsv,
  registerForWebinarApi,
  verifyWebinarTokenApi,
  fetchWebinarAnalyticsApi,
} from './webinarStore';
import type { WebinarRegistration, WebinarState } from '@meetit/protocol';

describe('Webinar Store & Utilities', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    };

    const mockDocument = {
      createElement: vi.fn((tag: string) => ({
        tagName: tag.toUpperCase(),
        setAttribute: vi.fn(),
        click: vi.fn(),
      })),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };

    globalThis.window = {
      localStorage: mockStorage as Storage,
    } as unknown as Window & typeof globalThis;
    globalThis.localStorage = mockStorage as Storage;
    globalThis.document = mockDocument as unknown as Document;

    vi.restoreAllMocks();
  });

  describe('Local Pass Storage', () => {
    it('saves and retrieves webinar registration passes in localStorage', () => {
      const reg: WebinarRegistration = {
        id: 'reg_123',
        roomCode: 'web-1000-xyz',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'viewer',
        registeredAt: Date.now(),
        status: 'approved',
        joinToken: 'token_ada_abc',
        paid: false,
        ticketPriceCents: 0,
        currency: 'USD',
        paymentProvider: 'free',
        customAnswers: {},
        engagementScore: 0,
      };

      expect(getSavedWebinarPasses()).toEqual({});
      saveWebinarPass(reg);

      const passes = getSavedWebinarPasses();
      expect(passes['web-1000-xyz']).toBeDefined();
      expect(passes['web-1000-xyz']?.joinToken).toBe('token_ada_abc');
    });
  });

  describe('Payment Simulation', () => {
    it('simulates Stripe payment with valid prefix', async () => {
      const res = await simulatePayment('stripe', 25, 'USD');
      expect(res.success).toBe(true);
      expect(res.provider).toBe('stripe');
      expect(res.amount).toBe(25);
      expect(res.currency).toBe('USD');
      expect(res.transactionRef.startsWith('ch_stripe_')).toBe(true);
    });

    it('simulates Paystack payment with valid prefix', async () => {
      const res = await simulatePayment('paystack', 5000, 'NGN');
      expect(res.success).toBe(true);
      expect(res.provider).toBe('paystack');
      expect(res.transactionRef.startsWith('pstk_tx_')).toBe(true);
    });

    it('simulates Flutterwave payment with valid prefix', async () => {
      const res = await simulatePayment('flutterwave', 30, 'GBP');
      expect(res.success).toBe(true);
      expect(res.provider).toBe('flutterwave');
      expect(res.transactionRef.startsWith('flw_ref_')).toBe(true);
    });
  });

  describe('CSV Export', () => {
    it('generates a CSV download element and clicks it', () => {
      const sampleReport = [
        {
          peerId: 'peer_1',
          displayName: 'Alan Turing',
          role: 'panelist',
          joinTime: 1700000000000,
          leaveTime: 1700003600000,
          durationSeconds: 3600,
          chatCount: 12,
          pollVotesCount: 3,
          qaCount: 2,
          engagementScore: 85,
        },
      ];

      exportAnalyticsToCsv(sampleReport, 'test-room-123');

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
    });
  });

  describe('REST API Helpers', () => {
    const mockWebinar: WebinarState = {
      enabled: true,
      practiceMode: false,
      isLive: true,
      maxViewers: 1000,
      viewerCount: 15,
      peakViewers: 22,
      requireRegistration: false,
      autoApproveRegistrations: true,
      ticketPriceCents: 0,
      currency: 'USD',
      paymentProvider: 'free',
      customFields: [],
    };

    it('registerForWebinarApi posts payload and returns registration', async () => {
      const mockReg: WebinarRegistration = {
        id: 'reg_abc',
        roomCode: 'web-room-001',
        name: 'Grace Hopper',
        email: 'grace@example.com',
        role: 'viewer',
        registeredAt: Date.now(),
        status: 'approved',
        joinToken: 'token_grace_789',
        paid: false,
        ticketPriceCents: 0,
        currency: 'USD',
        paymentProvider: 'free',
        customAnswers: {},
        engagementScore: 0,
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          registration: mockReg,
          joinToken: 'token_grace_789',
          webinar: mockWebinar,
        }),
      } as Response);

      const res = await registerForWebinarApi('web-room-001', {
        name: 'Grace Hopper',
        email: 'grace@example.com',
      });

      expect(res.success).toBe(true);
      expect(res.joinToken).toBe('token_grace_789');
      expect(getSavedWebinarPasses()['web-room-001']?.joinToken).toBe(
        'token_grace_789',
      );
    });

    it('verifyWebinarTokenApi verifies valid token', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          webinar: mockWebinar,
        }),
      } as Response);

      const res = await verifyWebinarTokenApi('web-room-001', 'token_valid');
      expect(res.valid).toBe(true);
      expect(res.webinar.isLive).toBe(true);
    });

    it('fetchWebinarAnalyticsApi fetches attendee report', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          report: [
            {
              peerId: 'p1',
              displayName: 'Viewer One',
              role: 'viewer',
              joinTime: 1000,
              durationSeconds: 120,
              chatCount: 1,
              pollVotesCount: 1,
              qaCount: 0,
              engagementScore: 50,
            },
          ],
          peakViewers: 42,
        }),
      } as Response);

      const res = await fetchWebinarAnalyticsApi('web-room-001');
      expect(res.peakViewers).toBe(42);
      expect(res.report.length).toBe(1);
      expect(res.report[0]?.displayName).toBe('Viewer One');
    });
  });
});
