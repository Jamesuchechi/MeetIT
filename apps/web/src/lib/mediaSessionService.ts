/**
 * Media Session API integration
 * Exposes call status and playback/mute actions to native device lock screens,
 * Bluetooth headsets, smartwatch media controls, and car head units.
 */

export interface MediaSessionConfig {
  roomTitle: string;
  roomCode: string;
  audioMuted: boolean;
  activeSpeaker?: string | undefined;
  onToggleMute: () => void;
  onLeaveCall: () => void;
  onToggleHand?: (() => void) | undefined;
}

let silentAudioEl: HTMLAudioElement | null = null;
let currentConfig: MediaSessionConfig | null = null;

/**
 * Creates and starts a looping silent audio track to keep background audio routing
 * and lock screen media controls active on mobile browsers (iOS WebKit / Chrome Android).
 */
function ensureSilentAudioKeepAlive(): void {
  if (typeof document === 'undefined' || silentAudioEl) return;
  try {
    // 1-second base64 silent WAV audio loop
    const silentWavBase64 =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    const audio = document.createElement('audio');
    audio.src = silentWavBase64;
    audio.loop = true;
    audio.volume = 0.001; // virtually silent
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.setAttribute('aria-hidden', 'true');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    silentAudioEl = audio;
    audio.play().catch(() => {
      // Audio autoplay policy might require user interaction first
    });
  } catch {
    // Ignore audio element creation failure
  }
}

/**
 * Initializes or updates native device Media Session controls for the meeting.
 */
export function setupMediaSession(config: MediaSessionConfig): void {
  currentConfig = config;
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator)
  ) {
    return;
  }

  const title = config.roomTitle || `Meeting ${config.roomCode}`;
  const speakerText = config.activeSpeaker
    ? `Speaking: ${config.activeSpeaker}`
    : 'Call in progress';

  try {
    if (typeof (window as any).MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new (window as any).MediaMetadata({
        title,
        artist: speakerText,
        album: 'MeetIT Audio-First Video Calls',
        artwork: [
          { src: '/favicon.svg', sizes: '96x96', type: 'image/svg+xml' },
          { src: '/favicon.svg', sizes: '128x128', type: 'image/svg+xml' },
          { src: '/favicon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/favicon.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      });
    }

    navigator.mediaSession.playbackState = config.audioMuted
      ? 'paused'
      : 'playing';

    // Mute / Unmute handlers
    navigator.mediaSession.setActionHandler('play', () => {
      if (currentConfig?.audioMuted) {
        currentConfig.onToggleMute();
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      if (currentConfig && !currentConfig.audioMuted) {
        currentConfig.onToggleMute();
      }
    });

    // Stop / Hangup handlers
    navigator.mediaSession.setActionHandler('stop', () => {
      currentConfig?.onLeaveCall();
    });

    try {
      // 'hangup' action is supported in modern Chrome 93+
      navigator.mediaSession.setActionHandler('hangup' as any, () => {
        currentConfig?.onLeaveCall();
      });
    } catch {
      // Unsupported action on some browsers
    }

    // Toggle hand raise with nexttrack if provided
    if (config.onToggleHand) {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        currentConfig?.onToggleHand?.();
      });
    }

    ensureSilentAudioKeepAlive();
  } catch (err) {
    console.warn('[MediaSession] Failed to set up media session:', err);
  }
}

/**
 * Updates the lock screen / media notification to reflect active speaker changes.
 */
export function updateMediaSessionSpeaker(speakerName: string): void {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    !navigator.mediaSession.metadata
  ) {
    return;
  }
  navigator.mediaSession.metadata.artist = speakerName
    ? `Speaking: ${speakerName}`
    : 'MeetIT Call Active';
}

/**
 * Updates the media session playback state when local audio is muted or unmuted.
 */
export function updateMediaSessionAudioState(muted: boolean): void {
  if (currentConfig) {
    currentConfig.audioMuted = muted;
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession.playbackState = muted ? 'paused' : 'playing';
  }
}

/**
 * Clears media session metadata, unregisters action handlers, and halts background audio.
 */
export function clearMediaSession(): void {
  currentConfig = null;
  if (silentAudioEl) {
    silentAudioEl.pause();
    silentAudioEl.remove();
    silentAudioEl = null;
  }

  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      try {
        navigator.mediaSession.setActionHandler('hangup' as any, null);
      } catch {
        // ignore
      }
      navigator.mediaSession.setActionHandler('nexttrack', null);
    } catch {
      // Ignore cleanup error
    }
  }
}
