export interface BrowserPlatformCapabilities {
  isSafari: boolean;
  isIOS: boolean;
  isMobileWebKit: boolean;
  supportsScreenShare: boolean;
  supportsSpeakerSelection: boolean;
}

export interface DeviceMatrixEntry {
  platform: string;
  browser: string;
  audioOpusFec: boolean;
  videoMesh4Way: boolean;
  screenShare: boolean;
  speakerOutputSelect: boolean;
  workdirWorkaround: string;
}

export const REAL_DEVICE_TEST_MATRIX: readonly DeviceMatrixEntry[] = [
  {
    platform: 'Desktop (Linux / macOS / Windows)',
    browser: 'Chrome / Edge 120+',
    audioOpusFec: true,
    videoMesh4Way: true,
    screenShare: true,
    speakerOutputSelect: true,
    workdirWorkaround: 'Native WebRTC + setSinkId + getDisplayMedia',
  },
  {
    platform: 'Desktop (macOS)',
    browser: 'Safari 17+',
    audioOpusFec: true,
    videoMesh4Way: true,
    screenShare: true,
    speakerOutputSelect: false,
    workdirWorkaround:
      'Autoplay gesture unlock + AudioContext resume + playsInline enforcement',
  },
  {
    platform: 'Desktop (Linux / macOS / Windows)',
    browser: 'Firefox 122+',
    audioOpusFec: true,
    videoMesh4Way: true,
    screenShare: true,
    speakerOutputSelect: false,
    workdirWorkaround: 'Perfect negotiation rollback + per-sender maxBitrate',
  },
  {
    platform: 'iOS / iPadOS 17+',
    browser: 'Mobile Safari / PWA Standalone',
    audioOpusFec: true,
    videoMesh4Way: true,
    screenShare: false,
    speakerOutputSelect: false,
    workdirWorkaround:
      '100dvh viewport + foreground track re-acquisition + gesture audio unlock',
  },
  {
    platform: 'Android 13+',
    browser: 'Chrome Mobile / PWA Standalone',
    audioOpusFec: true,
    videoMesh4Way: true,
    screenShare: false,
    speakerOutputSelect: false,
    workdirWorkaround:
      'Portrait 2-row layout + Data Saver / Audio-only auto-adaptation',
  },
];

/**
 * Detects Safari, iOS/iPadOS, and WebRTC media feature availability.
 */
export function detectBrowserPlatform(
  userAgent: string = typeof navigator !== 'undefined'
    ? navigator.userAgent
    : '',
  maxTouchPoints: number = typeof navigator !== 'undefined'
    ? navigator.maxTouchPoints || 0
    : 0,
): BrowserPlatformCapabilities {
  const ua = userAgent || '';
  const isIOSDevice =
    /iPad|iPhone|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && maxTouchPoints > 1);

  const isSafari =
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(ua);

  const isMobileWebKit = isIOSDevice || (isSafari && maxTouchPoints > 0);

  const hasDisplayMedia =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
    !isIOSDevice;

  const hasSetSinkId =
    typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype &&
    !isIOSDevice;

  return {
    isSafari,
    isIOS: isIOSDevice,
    isMobileWebKit,
    supportsScreenShare: hasDisplayMedia,
    supportsSpeakerSelection: hasSetSinkId,
  };
}

/**
 * Checks whether a local MediaStream has any ended tracks (which happens on iOS Safari
 * when locking the screen or backgrounding the browser tab).
 */
export function hasEndedMediaTracks(
  stream: MediaStream | null | undefined,
  expectVideo: boolean,
): boolean {
  if (!stream) return false;
  const audioTracks = stream.getAudioTracks();
  if (
    audioTracks.length > 0 &&
    audioTracks.some((t) => t.readyState === 'ended')
  ) {
    return true;
  }
  if (expectVideo) {
    const videoTracks = stream.getVideoTracks();
    if (
      videoTracks.length === 0 ||
      videoTracks.some((t) => t.readyState === 'ended')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Safely attaches a MediaStream to a <video> or <audio> element with iOS/Safari
 * inline playback attributes and autoplay gesture fallback.
 */
export function attachSafeMediaElement(
  element: HTMLVideoElement | HTMLAudioElement | null,
  stream: MediaStream | null,
  options?: {
    muted?: boolean;
    onAutoplayBlocked?: (retryPlay: () => Promise<boolean>) => void;
  },
): () => void {
  if (!element) return () => {};

  if ('playsInline' in element) {
    element.playsInline = true;
  }
  element.setAttribute('playsinline', 'true');
  element.setAttribute('webkit-playsinline', 'true');

  if (options?.muted !== undefined) {
    element.muted = options.muted;
  }

  if (element.srcObject !== stream) {
    element.srcObject = stream;
  }

  if (!stream) {
    return () => {};
  }

  let cleanedUp = false;
  const retryPlay = async (): Promise<boolean> => {
    if (cleanedUp || !element.srcObject) return true;
    try {
      await element.play();
      return true;
    } catch {
      return false;
    }
  };

  const handleGestureUnlock = () => {
    void retryPlay();
  };

  void (async () => {
    const ok = await retryPlay();
    if (!ok && !cleanedUp && typeof window !== 'undefined') {
      window.addEventListener('pointerdown', handleGestureUnlock, {
        once: true,
      });
      window.addEventListener('keydown', handleGestureUnlock, { once: true });
      options?.onAutoplayBlocked?.(retryPlay);
    }
  })();

  return () => {
    cleanedUp = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', handleGestureUnlock);
      window.removeEventListener('keydown', handleGestureUnlock);
    }
  };
}
