/**
 * Web Push and In-Meeting Background Notification Service
 * Manages notification permissions, background alerts (knocks, hands, mentions),
 * and Web Push Manager subscriptions.
 */

export interface NotificationPreferences {
  enabled: boolean;
  waitingRoomKnocks: boolean;
  handRaises: boolean;
  chatMentions: boolean;
}

const PREFS_STORAGE_KEY = 'meetit_notification_prefs_v1';

export function loadNotificationPreferences(): NotificationPreferences {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        enabled: true,
        waitingRoomKnocks: true,
        handRaises: true,
        chatMentions: true,
      };
    }
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        enabled: true,
        waitingRoomKnocks: true,
        handRaises: true,
        chatMentions: true,
      };
    }
    return JSON.parse(raw) as NotificationPreferences;
  } catch {
    return {
      enabled: true,
      waitingRoomKnocks: true,
      handRaises: true,
      chatMentions: true,
    };
  }
}

export function saveNotificationPreferences(
  prefs: NotificationPreferences,
): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // ignore
  }
}

/**
 * Checks whether the Notification API is supported in the current environment.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function getNotificationConstructor(): typeof Notification | null {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return (window as any).Notification;
  }
  if (typeof Notification !== 'undefined') {
    return Notification;
  }
  return null;
}

/**
 * Gets the current notification permission state.
 */
export function getNotificationPermission(): NotificationPermission {
  const Notif = getNotificationConstructor();
  if (!Notif) {
    return 'denied';
  }
  return Notif.permission;
}

/**
 * Requests native browser notification permission.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const Notif = getNotificationConstructor();
  if (!Notif) {
    return 'denied';
  }
  try {
    return await Notif.requestPermission();
  } catch (err) {
    console.warn('[Push] Error requesting notification permission:', err);
    return 'denied';
  }
}

/**
 * Displays an in-meeting system notification when the user has minimized or backgrounded the call tab.
 */
export function showInMeetingNotification(
  title: string,
  options?: NotificationOptions,
): Notification | null {
  const Notif = getNotificationConstructor();
  if (!Notif || Notif.permission !== 'granted') {
    return null;
  }

  // Only trigger native notification if the window or document is currently backgrounded
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible'
  ) {
    return null;
  }

  try {
    const notification = new Notif(title, {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      silent: false,
      ...options,
    });

    notification.onclick = () => {
      if (typeof window !== 'undefined' && window.focus) {
        window.focus();
      }
      notification.close();
    };

    return notification;
  } catch (err) {
    console.warn('[Push] Failed to show notification:', err);
    return null;
  }
}

/**
 * Subscribes to Web Push through the active Service Worker registration.
 */
export async function subscribeToPushNotifications(
  vapidPublicKey?: string,
): Promise<PushSubscription | null> {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription && vapidPublicKey) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as BufferSource,
      });
    }

    return subscription;
  } catch (err) {
    console.warn('[Push] Failed to subscribe to push notifications:', err);
    return null;
  }
}

/**
 * Helper to convert a URL-safe Base64 string to a Uint8Array for PushManager keys.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
