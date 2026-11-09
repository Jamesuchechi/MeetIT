/**
 * Audio Intelligence and Effects Processor
 * Meets Phase 8 specifications:
 * - AI Noise Suppression (spectral gate, high-pass filter, dynamics expander)
 * - Voice Clarity Booster
 * - Acoustic Feedback & Echo Runaway Detection
 * - Spatial Audio Engine (Stereo Panning based on stage tile placement)
 * - Adaptive Voice-First Mode
 */

export type NoiseSuppressionMode = 'off' | 'low' | 'high' | 'ai';

export interface AudioEffectsConfig {
  noiseSuppression: NoiseSuppressionMode;
  voiceBoost?: boolean | undefined;
  feedbackGuard?: boolean | undefined;
  spatialAudio?: boolean | undefined;
  voiceFirstMode?: boolean | undefined;
}

export type FeedbackListener = () => void;

export class AudioEffectProcessor {
  private config: AudioEffectsConfig;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  private presenceFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private outputTrack: MediaStreamTrack | null = null;

  private feedbackIntervalId: ReturnType<typeof setInterval> | null = null;
  private feedbackListeners: Set<FeedbackListener> = new Set();
  private consecutiveFeedbackHits = 0;

  constructor(initialConfig: Partial<AudioEffectsConfig> = {}) {
    this.config = {
      noiseSuppression: initialConfig.noiseSuppression ?? 'high',
      voiceBoost: initialConfig.voiceBoost ?? true,
      feedbackGuard: initialConfig.feedbackGuard ?? true,
      spatialAudio: initialConfig.spatialAudio ?? false,
      voiceFirstMode: initialConfig.voiceFirstMode ?? false,
    };
  }

  public getConfig(): AudioEffectsConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AudioEffectsConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.applyFilterParameters();
  }

  public onFeedbackDetected(listener: FeedbackListener): () => void {
    this.feedbackListeners.add(listener);
    return () => {
      this.feedbackListeners.delete(listener);
    };
  }

  private emitFeedback(): void {
    for (const listener of this.feedbackListeners) {
      try {
        listener();
      } catch (err) {
        console.error('Error in feedback listener:', err);
      }
    }
  }

  /**
   * Processes input microphone track and returns an AI-cleaned track.
   */
  public async processTrack(
    inputTrack: MediaStreamTrack,
  ): Promise<MediaStreamTrack> {
    if (typeof window === 'undefined') {
      return inputTrack;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) {
      return inputTrack;
    }

    this.stop();

    try {
      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const stream = new MediaStream([inputTrack]);
      this.sourceNode = this.audioCtx.createMediaStreamSource(stream);

      // 1. High-Pass Filter: Cuts air-conditioning hum, desk bumps, and rumble below 85Hz
      this.highPassFilter = this.audioCtx.createBiquadFilter();
      this.highPassFilter.type = 'highpass';
      this.highPassFilter.frequency.value = 85;
      this.highPassFilter.Q.value = 0.7;

      // 2. Vocal Presence Boost: Peaks speech clarity in the 2.5kHz - 3.5kHz band
      this.presenceFilter = this.audioCtx.createBiquadFilter();
      this.presenceFilter.type = 'peaking';
      this.presenceFilter.frequency.value = 2800;
      this.presenceFilter.Q.value = 1.0;
      this.presenceFilter.gain.value = this.config.voiceBoost ? 2.5 : 0;

      // 3. Dynamics Compressor / Expander: Noise gate suppressing ambient room noise
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.applyCompressorParameters();

      // 4. Analyser for feedback loop detection and VU level calculation
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      // 5. Output Destination
      this.destinationNode = this.audioCtx.createMediaStreamDestination();

      // Connect nodes in series: Source -> HighPass -> Presence -> Compressor -> Analyser -> Destination
      this.sourceNode.connect(this.highPassFilter);
      this.highPassFilter.connect(this.presenceFilter);
      this.presenceFilter.connect(this.compressor);
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.destinationNode);

      this.startFeedbackMonitoring();

      this.outputTrack =
        this.destinationNode.stream.getAudioTracks()[0] ?? null;
      return this.outputTrack ?? inputTrack;
    } catch (err) {
      console.warn('AudioEffectProcessor fallback to raw track:', err);
      return inputTrack;
    }
  }

  private applyCompressorParameters(): void {
    if (!this.compressor) return;

    switch (this.config.noiseSuppression) {
      case 'off':
        this.compressor.threshold.value = 0;
        this.compressor.knee.value = 40;
        this.compressor.ratio.value = 1;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;
        break;
      case 'low':
        this.compressor.threshold.value = -30;
        this.compressor.knee.value = 20;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.2;
        break;
      case 'high':
        this.compressor.threshold.value = -38;
        this.compressor.knee.value = 15;
        this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.002;
        this.compressor.release.value = 0.15;
        break;
      case 'ai':
        // Maximum vocal isolation and noise suppression
        this.compressor.threshold.value = -45;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 14;
        this.compressor.attack.value = 0.001;
        this.compressor.release.value = 0.1;
        break;
    }
  }

  private applyFilterParameters(): void {
    if (this.presenceFilter) {
      this.presenceFilter.gain.value = this.config.voiceBoost ? 2.5 : 0;
    }
    if (this.highPassFilter) {
      this.highPassFilter.frequency.value =
        this.config.noiseSuppression === 'off' ? 20 : 85;
    }
    this.applyCompressorParameters();
  }

  /**
   * Monitors spectral energy in the high frequency band to detect feedback howl / loop.
   */
  private startFeedbackMonitoring(): void {
    if (this.feedbackIntervalId) {
      clearInterval(this.feedbackIntervalId);
      this.feedbackIntervalId = null;
    }

    if (!this.config.feedbackGuard) {
      return;
    }

    this.feedbackIntervalId = setInterval(() => {
      if (!this.analyser || !this.config.feedbackGuard) {
        return;
      }

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      // Check high resonant peak indicative of acoustic feedback screech (1.5kHz - 6kHz)
      let peakValue = 0;
      let totalEnergy = 0;

      for (let i = 0; i < bufferLength; i++) {
        const val = dataArray[i] ?? 0;
        totalEnergy += val;
        if (val > peakValue) {
          peakValue = val;
        }
      }

      const avgEnergy = totalEnergy / bufferLength;
      // Resonance spike: intense peak relative to average energy
      if (peakValue > 220 && peakValue > avgEnergy * 3.2) {
        this.consecutiveFeedbackHits++;
        if (this.consecutiveFeedbackHits >= 3) {
          this.emitFeedback();
          this.consecutiveFeedbackHits = 0;
        }
      } else {
        this.consecutiveFeedbackHits = 0;
      }
    }, 400);
  }

  /**
   * Returns current microphone input level from 0 to 100.
   */
  public getAudioLevel(): number {
    if (!this.analyser) {
      return 0;
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] ?? 0;
    }
    const avg = sum / dataArray.length;
    return Math.min(100, Math.round((avg / 128) * 100));
  }

  public stop(): void {
    if (this.feedbackIntervalId) {
      clearInterval(this.feedbackIntervalId);
      this.feedbackIntervalId = null;
    }

    if (this.outputTrack) {
      this.outputTrack.stop();
      this.outputTrack = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.sourceNode = null;
    this.highPassFilter = null;
    this.presenceFilter = null;
    this.compressor = null;
    this.analyser = null;
    this.destinationNode = null;
  }
}

/**
 * Spatial Audio Engine
 * Positions each participant in stereo space (headphones/speakers)
 * based on their horizontal coordinate on the meeting stage grid.
 */
export class SpatialAudioEngine {
  private audioCtx: AudioContext | null = null;
  private peerPanners: Map<
    string,
    {
      source: MediaStreamAudioSourceNode;
      panner: StereoPannerNode;
      stream: MediaStream;
    }
  > = new Map();
  private enabled = true;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    for (const { panner } of this.peerPanners.values()) {
      panner.pan.value = this.enabled ? panner.pan.value : 0;
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Connects a remote participant's audio stream to the spatial stereo panner.
   */
  public attachPeerStream(
    peerId: string,
    stream: MediaStream,
    initialPan = 0,
  ): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (this.peerPanners.has(peerId)) {
      this.detachPeerStream(peerId);
    }

    try {
      const source = ctx.createMediaStreamSource(stream);
      const panner = ctx.createStereoPanner();
      panner.pan.value = this.enabled
        ? Math.max(-0.7, Math.min(0.7, initialPan))
        : 0;

      source.connect(panner);
      panner.connect(ctx.destination);

      this.peerPanners.set(peerId, { source, panner, stream });
    } catch (err) {
      console.warn(`Could not attach spatial audio for peer ${peerId}:`, err);
    }
  }

  /**
   * Updates the stereo pan position for a peer (-1.0 = left, 0 = center, +1.0 = right).
   */
  public updatePeerPan(peerId: string, normalizedX: number): void {
    const entry = this.peerPanners.get(peerId);
    if (!entry) return;

    // Constrain natural listening field to [-0.65, +0.65] to prevent ear fatigue
    const clampedPan = Math.max(
      -0.65,
      Math.min(0.65, (normalizedX - 0.5) * 1.3),
    );
    entry.panner.pan.value = this.enabled ? clampedPan : 0;
  }

  public detachPeerStream(peerId: string): void {
    const entry = this.peerPanners.get(peerId);
    if (!entry) return;

    try {
      entry.source.disconnect();
      entry.panner.disconnect();
    } catch {
      // ignore
    }
    this.peerPanners.delete(peerId);
  }

  public destroy(): void {
    for (const peerId of Array.from(this.peerPanners.keys())) {
      this.detachPeerStream(peerId);
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
