export interface SpeakerSample {
  peerId: string;
  level: number;
}

export interface HysteresisActiveSpeakerOptions {
  /** Minimum audio level (0..100) to be considered speaking (default 14). */
  speakingThreshold?: number;
  /** Margin by which a new speaker must exceed current speaker to switch early (default 8). */
  switchMargin?: number;
  /** Minimum hold duration (ms) before switching or clearing active speaker (default 900). */
  holdMs?: number;
}

/**
 * Pure state machine with hysteresis for selecting the active speaker
 * from periodic RMS/frequency audio levels (`0..100`).
 */
export class ActiveSpeakerSelector {
  private readonly speakingThreshold: number;
  private readonly switchMargin: number;
  private readonly holdMs: number;

  private currentSpeakerId: string | null = null;
  private lastSpokeAt = 0;

  constructor(options: HysteresisActiveSpeakerOptions = {}) {
    this.speakingThreshold = options.speakingThreshold ?? 14;
    this.switchMargin = options.switchMargin ?? 8;
    this.holdMs = options.holdMs ?? 900;
  }

  getActiveSpeaker(): string | null {
    return this.currentSpeakerId;
  }

  evaluate(samples: SpeakerSample[], nowMs = Date.now()): string | null {
    let loudest: SpeakerSample | null = null;
    for (const s of samples) {
      if (
        s.level >= this.speakingThreshold &&
        (!loudest || s.level > loudest.level)
      ) {
        loudest = s;
      }
    }

    const currentSample = this.currentSpeakerId
      ? samples.find((s) => s.peerId === this.currentSpeakerId)
      : undefined;

    // If current speaker is still above threshold, refresh hold timer
    if (currentSample && currentSample.level >= this.speakingThreshold) {
      this.lastSpokeAt = nowMs;
      // Only switch to another speaker if they are significantly louder
      if (
        loudest &&
        loudest.peerId !== this.currentSpeakerId &&
        loudest.level >= currentSample.level + this.switchMargin
      ) {
        this.currentSpeakerId = loudest.peerId;
        this.lastSpokeAt = nowMs;
      }
      return this.currentSpeakerId;
    }

    // Current speaker dropped below threshold: check hysteresis hold window
    if (this.currentSpeakerId && nowMs - this.lastSpokeAt < this.holdMs) {
      // Allow immediate takeover if someone else is speaking clearly
      if (
        loudest &&
        loudest.peerId !== this.currentSpeakerId &&
        loudest.level >= this.speakingThreshold + this.switchMargin
      ) {
        this.currentSpeakerId = loudest.peerId;
        this.lastSpokeAt = nowMs;
      }
      return this.currentSpeakerId;
    }

    // Hold expired or no previous speaker
    if (loudest) {
      this.currentSpeakerId = loudest.peerId;
      this.lastSpokeAt = nowMs;
    } else {
      this.currentSpeakerId = null;
    }

    return this.currentSpeakerId;
  }
}

/**
 * Monitors multiple MediaStreams (local + remote peers) via Web Audio AnalyserNode
 * and invokes `onActiveSpeakerChange` when the active speaker changes.
 */
export function createMultiPeerSpeakerMonitor(
  streamsByPeerId: Record<string, MediaStream | null>,
  onActiveSpeakerChange: (peerId: string | null) => void,
): () => void {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;

  if (!AudioCtx) {
    return () => {};
  }

  let audioCtx: AudioContext | null = null;
  let timerId: number | null = null;
  const selector = new ActiveSpeakerSelector();
  let lastReported: string | null = null;

  const analysers = new Map<
    string,
    { analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }
  >();

  try {
    const ctx = new AudioCtx();
    audioCtx = ctx;

    for (const [peerId, stream] of Object.entries(streamsByPeerId)) {
      if (!stream || stream.getAudioTracks().length === 0) continue;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analysers.set(peerId, {
          analyser,
          data: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        });
      } catch {
        // ignore stream attachment errors
      }
    }

    timerId = window.setInterval(() => {
      const samples: SpeakerSample[] = [];
      for (const [peerId, { analyser, data }] of analysers.entries()) {
        const stream = streamsByPeerId[peerId];
        const track = stream?.getAudioTracks()[0];
        if (!track || !track.enabled || track.readyState !== 'live') {
          samples.push({ peerId, level: 0 });
          continue;
        }
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] ?? 0;
        }
        const avg = sum / data.length;
        const level = Math.min(100, Math.round((avg / 90) * 100));
        samples.push({ peerId, level });
      }

      const nextSpeaker = selector.evaluate(samples, Date.now());
      if (nextSpeaker !== lastReported) {
        lastReported = nextSpeaker;
        onActiveSpeakerChange(nextSpeaker);
      }
    }, 150);
  } catch {
    // ignore audio context restrictions
  }

  return () => {
    if (timerId !== null) {
      window.clearInterval(timerId);
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close().catch(() => {});
    }
  };
}

/**
 * Plays a gentle synthesized two-tone chime for join or leave events.
 */
export function playCallChime(kind: 'join' | 'leave'): void {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    if (kind === 'join') {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.09); // E5
    } else {
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(440.0, now + 0.09); // A4
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // ignore autoplay restriction
  }
}
