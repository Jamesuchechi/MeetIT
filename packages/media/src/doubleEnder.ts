export interface DoubleEnderRecorderOptions {
  mimeType?: string | undefined;
  timesliceMs?: number | undefined;
}

/**
 * Local double-ender recorder (Phase 14 Tier A):
 * Records local audio/video tracks directly in the browser so recordings
 * remain crisp even when live network conditions degrade.
 */
export class LocalDoubleEnderRecorder {
  private recorder: MediaRecorder | null = null;
  private readonly chunks: Blob[] = [];
  private readonly mimeType: string;
  private readonly timesliceMs: number;

  constructor(options: DoubleEnderRecorderOptions = {}) {
    this.mimeType = options.mimeType ?? 'video/webm;codecs=vp8,opus';
    this.timesliceMs = options.timesliceMs ?? 2000;
  }

  start(stream: MediaStream): void {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not supported in this environment.');
    }
    this.chunks.length = 0;
    const supportedMime = MediaRecorder.isTypeSupported(this.mimeType)
      ? this.mimeType
      : undefined;
    this.recorder = new MediaRecorder(
      stream,
      supportedMime ? { mimeType: supportedMime } : undefined,
    );
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.start(this.timesliceMs);
  }

  async stop(): Promise<Blob> {
    const rec = this.recorder;
    if (!rec || rec.state === 'inactive') {
      return new Blob(this.chunks, { type: this.mimeType });
    }
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    return new Blob(this.chunks, { type: rec.mimeType || this.mimeType });
  }

  get chunkCount(): number {
    return this.chunks.length;
  }
}
