import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showInMeetingNotification,
  loadNotificationPreferences,
  saveNotificationPreferences,
  urlBase64ToUint8Array,
} from './pushNotificationService';

describe('pushNotificationService', () => {
  let mockNotification: any;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    mockNotification = vi.fn();
    mockNotification.permission = 'granted';
    mockNotification.requestPermission = vi.fn().mockResolvedValue('granted');

    (globalThis as any).window = {
      Notification: mockNotification,
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
    };

    (globalThis as any).document = {
      visibilityState: 'visible',
    };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    vi.restoreAllMocks();
  });

  it('detects notification support and permissions', async () => {
    expect(isNotificationSupported()).toBe(true);
    expect(getNotificationPermission()).toBe('granted');

    const perm = await requestNotificationPermission();
    expect(perm).toBe('granted');
  });

  it('shows in-meeting notification when tab is backgrounded', () => {
    // @ts-expect-error test mock
    globalThis.document.visibilityState = 'hidden';

    const notif = showInMeetingNotification('Doorbell Knock', {
      body: 'John Doe wants to join the room',
    });

    expect(notif).toBeDefined();
    expect(mockNotification).toHaveBeenCalledWith(
      'Doorbell Knock',
      expect.objectContaining({
        body: 'John Doe wants to join the room',
        icon: '/favicon.svg',
      }),
    );
  });

  it('suppresses native notification if document is visible', () => {
    // @ts-expect-error test mock
    globalThis.document.visibilityState = 'visible';

    const notif = showInMeetingNotification('Doorbell Knock', {
      body: 'John Doe wants to join the room',
    });

    expect(notif).toBeNull();
  });

  it('converts VAPID base64 URL to Uint8Array', () => {
    const base64 = 'BMxS7X8hY0K0-9v1';
    const uint8 = urlBase64ToUint8Array(base64);
    expect(uint8 instanceof Uint8Array).toBe(true);
    expect(uint8.length).toBeGreaterThan(0);
  });

  it('loads and saves notification preferences', () => {
    const store: Record<string, string> = {};
    // @ts-expect-error test mock
    globalThis.window.localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };

    const prefs = {
      enabled: true,
      waitingRoomKnocks: false,
      handRaises: true,
      chatMentions: true,
    };
    saveNotificationPreferences(prefs);
    expect(loadNotificationPreferences()).toEqual(prefs);
  });
});
