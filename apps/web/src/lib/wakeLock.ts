/**
 * Screen Wake Lock API wrapper
 * Keeps the device display active during active video calls.
 * Automatically handles visibility change re-acquisition.
 */

let wakeLockSentinel: any = null;
let isRequested = false;
let visibilityListenerAttached = false;

async function reacquireOnVisibilityChange(): Promise<void> {
  if (
    document.visibilityState === 'visible' &&
    isRequested &&
    !wakeLockSentinel
  ) {
    try {
      if ('wakeLock' in navigator) {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
      }
    } catch {
      // Ignore background acquisition failure
    }
  }
}

/**
 * Requests a screen wake lock to keep the display on during a meeting.
 */
export async function requestScreenWakeLock(): Promise<boolean> {
  isRequested = true;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  if (!('wakeLock' in navigator) || !(navigator as any).wakeLock) {
    return false;
  }

  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }

    if (!visibilityListenerAttached && typeof document !== 'undefined') {
      document.addEventListener(
        'visibilitychange',
        reacquireOnVisibilityChange,
      );
      visibilityListenerAttached = true;
    }
    return true;
  } catch (err) {
    console.warn('[WakeLock] Unable to acquire screen wake lock:', err);
    return false;
  }
}

/**
 * Releases the active screen wake lock and removes visibility change listener.
 */
export async function releaseScreenWakeLock(): Promise<void> {
  isRequested = false;
  if (visibilityListenerAttached && typeof document !== 'undefined') {
    document.removeEventListener(
      'visibilitychange',
      reacquireOnVisibilityChange,
    );
    visibilityListenerAttached = false;
  }

  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // Ignore release errors
    } finally {
      wakeLockSentinel = null;
    }
  }
}

/**
 * Checks whether the screen wake lock is currently active.
 */
export function isScreenWakeLockActive(): boolean {
  return Boolean(wakeLockSentinel && !wakeLockSentinel.released);
}
