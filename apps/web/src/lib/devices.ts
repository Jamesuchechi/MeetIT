export interface DeviceChoice {
  audioInputId: string;
  videoInputId: string;
  audioOutputId: string;
}

export interface EnumeratedDevices {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

export type MediaErrorKind =
  'permission_denied' | 'no_device' | 'hardware_in_use' | 'unknown';

export interface MediaAcquireResult {
  stream: MediaStream | null;
  errorKind: MediaErrorKind | null;
  errorMessage: string | null;
  recoverySteps: string[];
}

const STORAGE_KEY = 'meetit_device_preferences_v1';

export function loadDevicePreferences(): DeviceChoice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { audioInputId: '', videoInputId: '', audioOutputId: '' };
    }
    const parsed = JSON.parse(raw) as Partial<DeviceChoice>;
    return {
      audioInputId: parsed.audioInputId ?? '',
      videoInputId: parsed.videoInputId ?? '',
      audioOutputId: parsed.audioOutputId ?? '',
    };
  } catch {
    return { audioInputId: '', videoInputId: '', audioOutputId: '' };
  }
}

export function saveDevicePreferences(prefs: Partial<DeviceChoice>): void {
  try {
    const current = loadDevicePreferences();
    const updated: DeviceChoice = {
      audioInputId: prefs.audioInputId ?? current.audioInputId,
      videoInputId: prefs.videoInputId ?? current.videoInputId,
      audioOutputId: prefs.audioOutputId ?? current.audioOutputId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage quota errors
  }
}

export async function enumerateMediaDevices(): Promise<EnumeratedDevices> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return { microphones: [], cameras: [], speakers: [] };
  }

  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return {
      microphones: list.filter((d) => d.kind === 'audioinput'),
      cameras: list.filter((d) => d.kind === 'videoinput'),
      speakers: list.filter((d) => d.kind === 'audiooutput'),
    };
  } catch {
    return { microphones: [], cameras: [], speakers: [] };
  }
}

export function subscribeDeviceChanges(onChange: () => void): () => void {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.addEventListener !== 'function'
  ) {
    return () => {};
  }
  navigator.mediaDevices.addEventListener('devicechange', onChange);
  return () => {
    navigator.mediaDevices.removeEventListener('devicechange', onChange);
  };
}

export function classifyMediaError(err: unknown): {
  errorKind: MediaErrorKind;
  errorMessage: string;
  recoverySteps: string[];
} {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError'
  ) {
    return {
      errorKind: 'permission_denied',
      errorMessage: 'Camera or microphone access was blocked by your browser.',
      recoverySteps: [
        'Click the camera or lock icon in your browser address bar.',
        'Set Camera and Microphone permissions to "Allow".',
        'Click "Retry devices" below or join in audio-only / listen-only mode.',
      ],
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      errorKind: 'no_device',
      errorMessage: 'No camera or microphone was detected on this device.',
      recoverySteps: [
        'Plug in a USB webcam or headset and wait a moment for detection.',
        'Check your system Sound and Camera settings to ensure hardware is enabled.',
        'You can still join the meeting now and turn on audio/video later.',
      ],
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      errorKind: 'hardware_in_use',
      errorMessage:
        'Your camera or microphone is currently in use by another application.',
      recoverySteps: [
        'Close other video apps (Zoom, Teams, other browser tabs) using the camera.',
        'Select an alternate camera or microphone from the device dropdowns.',
        'Click "Retry devices" once the hardware is free.',
      ],
    };
  }

  return {
    errorKind: 'unknown',
    errorMessage:
      'Could not initialize camera or microphone with the current selection.',
    recoverySteps: [
      'Check that your browser has permission to access media devices.',
      'Try selecting default devices or joining without camera.',
    ],
  };
}

export async function acquireUserMedia(options: {
  audio: boolean;
  video: boolean;
  audioInputId?: string;
  videoInputId?: string;
}): Promise<MediaAcquireResult> {
  if (!options.audio && !options.video) {
    return {
      stream: new MediaStream(),
      errorKind: null,
      errorMessage: null,
      recoverySteps: [],
    };
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return {
      stream: null,
      errorKind: 'no_device',
      errorMessage: 'Media devices API is unavailable in this browser context.',
      recoverySteps: [
        'Ensure you are visiting MeetIT over HTTPS or localhost.',
        'You can still join the call in view-only mode.',
      ],
    };
  }

  const audioConstraint: boolean | MediaTrackConstraints = options.audio
    ? {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(options.audioInputId
          ? { deviceId: { ideal: options.audioInputId } }
          : {}),
      }
    : false;

  const videoConstraint: boolean | MediaTrackConstraints = options.video
    ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
        ...(options.videoInputId
          ? { deviceId: { ideal: options.videoInputId } }
          : {}),
      }
    : false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraint,
      video: videoConstraint,
    });
    return {
      stream,
      errorKind: null,
      errorMessage: null,
      recoverySteps: [],
    };
  } catch (err) {
    // If video failed (e.g. no webcam) but audio was requested, try audio-only fallback
    if (options.video && options.audio) {
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraint,
          video: false,
        });
        const info = classifyMediaError(err);
        return {
          stream: audioOnlyStream,
          errorKind: info.errorKind,
          errorMessage:
            'Camera unavailable — switched to microphone-only automatically.',
          recoverySteps: info.recoverySteps,
        };
      } catch {
        // Fall through to full error classification
      }
    }

    const info = classifyMediaError(err);
    return {
      stream: null,
      errorKind: info.errorKind,
      errorMessage: info.errorMessage,
      recoverySteps: info.recoverySteps,
    };
  }
}

/**
 * Acquires a screen-sharing MediaStream via `navigator.mediaDevices.getDisplayMedia`.
 */
export async function acquireDisplayMedia(options?: {
  withAudio?: boolean;
  highRes?: boolean;
}): Promise<MediaStream | null> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== 'function'
  ) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: options?.highRes ? 30 : 15, max: 30 },
        ...(options?.highRes
          ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
          : {}),
      },
      audio: options?.withAudio ?? true,
    });
  } catch {
    // If audio capture was rejected by user or browser, try fallback without audio
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      });
    } catch {
      return null;
    }
  }
}

/**
 * Monitors an audio MediaStream and invokes `onLevel(0..100)` at ~25fps.
 * Returns a cleanup function that stops the monitor and closes the AudioContext.
 */
export function createMicLevelMonitor(
  stream: MediaStream | null,
  onLevel: (level: number) => void,
): () => void {
  if (!stream || stream.getAudioTracks().length === 0) {
    onLevel(0);
    return () => {};
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    onLevel(0);
    return () => {};
  }

  let rafId: number | null = null;
  let audioCtx: AudioContext | null = null;

  try {
    const ctx = new AudioCtx();
    audioCtx = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      const track = stream.getAudioTracks()[0];
      if (!track || !track.enabled || track.readyState !== 'live') {
        onLevel(0);
      } else {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] ?? 0;
        }
        const avg = sum / data.length;
        const normalized = Math.min(100, Math.round((avg / 96) * 100));
        onLevel(normalized);
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
  } catch {
    onLevel(0);
  }

  return () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close().catch(() => {});
    }
  };
}
