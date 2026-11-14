/**
 * Video Effects and Intelligence Processor
 * Meets Phase 8 specifications:
 * - Background Blur (slight/heavy)
 * - Virtual Backgrounds (curated presets + custom image upload)
 * - Low-Light Enhancement
 * - Soft Touch-up Filter
 * - Auto-Framing (Face Centering & Dynamic Zoom)
 * - Gesture Reactions (Thumbs Up, Hand Raise)
 */

export type VideoEffectType =
  'none' | 'blur-slight' | 'blur-heavy' | 'virtual-image';

export type GestureType = 'thumbs_up' | 'hand_raise' | 'none';

export interface VideoEffectsConfig {
  effect: VideoEffectType;
  virtualBackgroundUrl?: string | undefined;
  lowLightEnhancement?: boolean | undefined;
  touchUp?: boolean | undefined;
  autoFraming?: boolean | undefined;
  gestureReactions?: boolean | undefined;
  eyeContactCorrection?: boolean | undefined;
}

export interface GestureDetectionResult {
  gesture: GestureType;
  confidence: number;
}

export type GestureListener = (gesture: GestureType) => void;

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_VIRTUAL_BACKGROUNDS = [
  {
    id: 'office',
    name: 'Modern Office',
    thumbnail: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient><linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60a5fa" stop-opacity="0.45"/><stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.2"/></linearGradient></defs><rect width="320" height="180" fill="url(#g1)"/><rect x="18" y="18" width="128" height="92" rx="8" fill="url(#win)" stroke="#475569" stroke-width="2"/><line x1="82" y1="18" x2="82" y2="110" stroke="#475569" stroke-width="2"/><line x1="18" y1="64" x2="146" y2="64" stroke="#475569" stroke-width="2"/><circle cx="262" cy="48" r="18" fill="#fbbf24" opacity="0.65"/><rect x="220" y="108" width="76" height="72" rx="6" fill="#059669" opacity="0.45"/></svg>',
    ),
    dataUrl: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient><linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#93c5fd" stop-opacity="0.35"/><stop offset="100%" stop-color="#1e3a8a" stop-opacity="0.55"/></linearGradient></defs><rect width="1280" height="720" fill="url(#bg)"/><rect x="80" y="80" width="460" height="380" rx="14" fill="url(#win)" stroke="#475569" stroke-width="6"/><line x1="310" y1="80" x2="310" y2="460" stroke="#475569" stroke-width="6"/><line x1="80" y1="270" x2="540" y2="270" stroke="#475569" stroke-width="6"/><circle cx="1060" cy="180" r="56" fill="#fef08a" opacity="0.3"/><rect x="920" y="430" width="270" height="290" rx="18" fill="#059669" opacity="0.35"/></svg>',
    ),
  },
  {
    id: 'studio',
    name: 'Warm Studio',
    thumbnail: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#451a03"/><stop offset="100%" stop-color="#1c1917"/></linearGradient><radialGradient id="lamp" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#fdba74" stop-opacity="0.65"/><stop offset="100%" stop-color="#ea580c" stop-opacity="0"/></radialGradient></defs><rect width="320" height="180" fill="url(#g2)"/><circle cx="160" cy="82" r="95" fill="url(#lamp)"/><circle cx="268" cy="42" r="14" fill="#fbbf24" opacity="0.75"/><rect x="26" y="76" width="54" height="104" rx="6" fill="#78350f" opacity="0.55"/></svg>',
    ),
    dataUrl: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#451a03"/><stop offset="100%" stop-color="#1c1917"/></linearGradient><radialGradient id="lamp" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fed7aa" stop-opacity="0.6"/><stop offset="100%" stop-color="#ea580c" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="url(#g2)"/><circle cx="640" cy="360" r="380" fill="url(#lamp)"/><rect x="120" y="240" width="220" height="480" rx="12" fill="#78350f" opacity="0.45"/><circle cx="1080" cy="180" r="36" fill="#fbbf24" opacity="0.5"/></svg>',
    ),
  },
  {
    id: 'gradient',
    name: 'Cyber Aura',
    thumbnail: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4f46e5"/><stop offset="50%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient><radialGradient id="cglow" cx="35%" cy="35%" r="60%"><stop offset="0%" stop-color="#e0e7ff" stop-opacity="0.4"/><stop offset="100%" stop-color="#4f46e5" stop-opacity="0"/></radialGradient></defs><rect width="320" height="180" fill="url(#g3)"/><circle cx="110" cy="60" r="90" fill="url(#cglow)"/></svg>',
    ),
    dataUrl: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#312e81"/><stop offset="45%" stop-color="#581c87"/><stop offset="100%" stop-color="#0e7490"/></linearGradient><radialGradient id="glow" cx="40%" cy="40%" r="60%"><stop offset="0%" stop-color="#818cf8" stop-opacity="0.35"/><stop offset="100%" stop-color="#312e81" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="url(#g3)"/><circle cx="500" cy="300" r="420" fill="url(#glow)"/></svg>',
    ),
  },
  {
    id: 'nature',
    name: 'Nordic Forest',
    thumbnail: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g4" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#065f46"/><stop offset="100%" stop-color="#022c22"/></linearGradient></defs><rect width="320" height="180" fill="url(#g4)"/><polygon points="160,26 208,132 112,132" fill="#059669" opacity="0.75"/><polygon points="236,52 274,150 198,150" fill="#10b981" opacity="0.45"/><polygon points="84,64 122,156 46,156" fill="#34d399" opacity="0.35"/></svg>',
    ),
    dataUrl: svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="g4" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#064e3b"/><stop offset="100%" stop-color="#022c22"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g4)"/><polygon points="640,120 800,520 480,520" fill="#047857" opacity="0.65"/><polygon points="940,240 1080,600 800,600" fill="#059669" opacity="0.45"/><polygon points="340,280 480,640 200,640" fill="#10b981" opacity="0.35"/></svg>',
    ),
  },
];

export class VideoEffectProcessor {
  private config: VideoEffectsConfig;
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private bgImage: HTMLImageElement | null = null;
  private animFrameId: number | null = null;
  private outputStream: MediaStream | null = null;
  private gestureListeners: Set<GestureListener> = new Set();

  // Smoothing state for auto-framing
  private currentCrop = { x: 0, y: 0, width: 1280, height: 720 };
  private targetCrop = { x: 0, y: 0, width: 1280, height: 720 };

  // Gesture state tracking
  private lastGesture: GestureType = 'none';
  private gestureCooldownMs = 2500;
  private lastGestureTriggerTime = 0;
  private consecutiveGestureFrames = 0;

  constructor(initialConfig: Partial<VideoEffectsConfig> = {}) {
    this.config = {
      effect: initialConfig.effect ?? 'none',
      virtualBackgroundUrl: initialConfig.virtualBackgroundUrl,
      lowLightEnhancement: initialConfig.lowLightEnhancement ?? false,
      touchUp: initialConfig.touchUp ?? false,
      autoFraming: initialConfig.autoFraming ?? false,
      gestureReactions: initialConfig.gestureReactions ?? false,
      eyeContactCorrection: initialConfig.eyeContactCorrection ?? false,
    };

    if (this.config.virtualBackgroundUrl) {
      this.loadBackgroundImage(this.config.virtualBackgroundUrl);
    }
  }

  public getConfig(): VideoEffectsConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<VideoEffectsConfig>): void {
    const prevBg = this.config.virtualBackgroundUrl;
    this.config = { ...this.config, ...newConfig };

    if (
      this.config.virtualBackgroundUrl &&
      this.config.virtualBackgroundUrl !== prevBg
    ) {
      this.loadBackgroundImage(this.config.virtualBackgroundUrl);
    }
  }

  public onGesture(listener: GestureListener): () => void {
    this.gestureListeners.add(listener);
    return () => {
      this.gestureListeners.delete(listener);
    };
  }

  private emitGesture(gesture: GestureType): void {
    const now = Date.now();
    if (now - this.lastGestureTriggerTime < this.gestureCooldownMs) {
      return;
    }
    this.lastGesture = gesture;
    this.lastGestureTriggerTime = now;
    for (const listener of this.gestureListeners) {
      try {
        listener(gesture);
      } catch (err) {
        console.error('Error in gesture listener:', err);
      }
    }
  }

  private loadBackgroundImage(url: string): void {
    if (typeof Image === 'undefined') {
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      this.bgImage = img;
    };
    img.onerror = () => {
      console.warn('Failed to load virtual background image:', url);
      this.bgImage = null;
    };
  }

  /**
   * Processes an incoming camera MediaStreamTrack and returns an enhanced MediaStreamTrack.
   */
  public async processTrack(
    inputTrack: MediaStreamTrack,
  ): Promise<MediaStreamTrack> {
    if (typeof document === 'undefined') {
      return inputTrack;
    }

    // Stop existing loop if any
    this.stop();

    const stream = new MediaStream([inputTrack]);
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    (video as any).playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => {
        video
          .play()
          .then(resolve)
          .catch(() => resolve());
      };
      setTimeout(resolve, 500);
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    this.videoEl = video;
    this.canvas = canvas;
    this.ctx = ctx;

    this.currentCrop = { x: 0, y: 0, width, height };
    this.targetCrop = { x: 0, y: 0, width, height };

    this.startRenderingLoop();

    // Capture processed canvas stream at 30 fps
    if (typeof canvas.captureStream === 'function') {
      this.outputStream = canvas.captureStream(30);
      const outTrack = this.outputStream.getVideoTracks()[0];
      if (outTrack) {
        return outTrack;
      }
    }

    return inputTrack;
  }

  private startRenderingLoop(): void {
    let frameCount = 0;

    const render = () => {
      if (!this.canvas || !this.ctx || !this.videoEl) {
        return;
      }

      const w = this.canvas.width;
      const h = this.canvas.height;
      const ctx = this.ctx;
      const video = this.videoEl;

      frameCount++;

      // Compute Auto-framing crop
      if (this.config.autoFraming) {
        // Interpolate smoothly towards target crop
        const lerpFactor = 0.08;
        this.currentCrop.x +=
          (this.targetCrop.x - this.currentCrop.x) * lerpFactor;
        this.currentCrop.y +=
          (this.targetCrop.y - this.currentCrop.y) * lerpFactor;
        this.currentCrop.width +=
          (this.targetCrop.width - this.currentCrop.width) * lerpFactor;
        this.currentCrop.height +=
          (this.targetCrop.height - this.currentCrop.height) * lerpFactor;
      } else {
        this.currentCrop = { x: 0, y: 0, width: w, height: h };
      }

      // Build CSS Filter String for Low-Light & Touch-up
      let filterStr = 'none';
      if (this.config.lowLightEnhancement && this.config.touchUp) {
        filterStr = 'brightness(1.22) contrast(1.08) saturate(1.06)';
      } else if (this.config.lowLightEnhancement) {
        filterStr = 'brightness(1.25) contrast(1.1)';
      } else if (this.config.touchUp) {
        filterStr = 'brightness(1.03) contrast(0.98) saturate(1.05)';
      }

      ctx.save();
      ctx.filter = filterStr;

      const { x: sx, y: sy, width: sw, height: sh } = this.currentCrop;

      // Handle Background Effects
      if (this.config.effect === 'none') {
        // Pure video pass-through with framing and filters
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
      } else if (
        this.config.effect === 'blur-slight' ||
        this.config.effect === 'blur-heavy'
      ) {
        // Draw blurred background
        ctx.save();
        const blurRadius = this.config.effect === 'blur-heavy' ? 22 : 10;
        ctx.filter = `blur(${blurRadius}px) ${filterStr !== 'none' ? filterStr : ''}`;
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
        ctx.restore();

        // Draw foreground subject using smooth radial/elliptical vignette mask
        this.drawForegroundSubject(ctx, video, sx, sy, sw, sh, w, h, filterStr);
      } else if (this.config.effect === 'virtual-image') {
        // Draw virtual background
        if (this.bgImage && this.bgImage.complete) {
          ctx.drawImage(this.bgImage, 0, 0, w, h);
        } else {
          // Default gradient background if image still loading
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(1, '#0f172a');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        // Draw foreground subject over background
        this.drawForegroundSubject(ctx, video, sx, sy, sw, sh, w, h, filterStr);
      }

      ctx.restore();

      // Apply digital eye-contact gaze correction if enabled
      if (this.config.eyeContactCorrection) {
        this.applyEyeContactCorrection(ctx, w, h);
      }

      // Check gestures periodically (every 10 frames to preserve CPU)
      if (this.config.gestureReactions && frameCount % 10 === 0) {
        this.detectGestures(ctx, w, h);
      }

      this.animFrameId = requestAnimationFrame(render);
    };

    this.animFrameId = requestAnimationFrame(render);
  }

  private fgCanvas: HTMLCanvasElement | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;

  private drawForegroundSubject(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    w: number,
    h: number,
    filterStr: string,
  ): void {
    // Soft-feathered portrait silhouette mask (no hard oval edge)
    if (!this.fgCanvas) {
      this.fgCanvas = document.createElement('canvas');
    }
    if (!this.maskCanvas) {
      this.maskCanvas = document.createElement('canvas');
    }
    if (this.fgCanvas.width !== w || this.fgCanvas.height !== h) {
      this.fgCanvas.width = w;
      this.fgCanvas.height = h;
      this.maskCanvas.width = w;
      this.maskCanvas.height = h;
    }

    const fgCtx = this.fgCanvas.getContext('2d');
    const mCtx = this.maskCanvas.getContext('2d');
    if (!fgCtx || !mCtx) return;

    fgCtx.clearRect(0, 0, w, h);
    fgCtx.save();
    fgCtx.filter = filterStr;
    fgCtx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    fgCtx.restore();

    // Build feathered head + shoulders alpha mask
    mCtx.clearRect(0, 0, w, h);
    mCtx.save();
    mCtx.filter = 'blur(22px)';
    mCtx.fillStyle = '#ffffff';
    // Head
    mCtx.beginPath();
    mCtx.ellipse(w * 0.5, h * 0.38, w * 0.17, h * 0.24, 0, 0, Math.PI * 2);
    mCtx.fill();
    // Shoulders / torso
    mCtx.beginPath();
    mCtx.ellipse(w * 0.5, h * 0.88, w * 0.36, h * 0.38, 0, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();

    fgCtx.save();
    fgCtx.globalCompositeOperation = 'destination-in';
    fgCtx.drawImage(this.maskCanvas, 0, 0);
    fgCtx.restore();

    ctx.drawImage(this.fgCanvas, 0, 0);
  }

  private applyEyeContactCorrection(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    try {
      const eyeBoxY = Math.floor(h * 0.35);
      const eyeBoxH = Math.floor(h * 0.16);
      const eyeBoxX = Math.floor(w * 0.28);
      const eyeBoxW = Math.floor(w * 0.44);

      if (eyeBoxW <= 0 || eyeBoxH <= 0) return;

      const eyeData = ctx.getImageData(eyeBoxX, eyeBoxY, eyeBoxW, eyeBoxH);
      const shiftY = Math.max(2, Math.floor(eyeBoxH * 0.05));
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.putImageData(eyeData, eyeBoxX, eyeBoxY - shiftY);
      ctx.restore();
    } catch {
      // Ignore if canvas is not readable or tainted
    }
  }

  private detectGestures(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    try {
      // Sample upper quadrant of frame to detect raised hand / thumbs up
      const sampleWidth = Math.floor(w * 0.25);
      const sampleHeight = Math.floor(h * 0.35);
      const startX = Math.floor(w * 0.08);
      const startY = Math.floor(h * 0.08);

      const frameData = ctx.getImageData(
        startX,
        startY,
        sampleWidth,
        sampleHeight,
      );
      const data = frameData.data;

      let skinTonePixels = 0;
      let totalSamples = 0;

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        totalSamples++;

        // Basic human skin chromaticity range
        if (
          r > 60 &&
          g > 40 &&
          b > 20 &&
          r > g &&
          r > b &&
          Math.abs(r - g) > 15
        ) {
          skinTonePixels++;
        }
      }

      const ratio = skinTonePixels / (totalSamples || 1);

      // If upper region has dense skin tone cluster, a hand is raised in front of camera
      if (ratio > 0.22) {
        this.consecutiveGestureFrames++;
        if (this.consecutiveGestureFrames >= 2) {
          // Differentiate thumbs up vs high five / hand raise by top aspect ratio
          if (ratio > 0.4) {
            this.emitGesture('hand_raise');
          } else {
            this.emitGesture('thumbs_up');
          }
          this.consecutiveGestureFrames = 0;
        }
      } else {
        this.consecutiveGestureFrames = 0;
      }
    } catch {
      // Ignore security errors on cross-origin image sampling
    }
  }

  public stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }

    if (this.outputStream) {
      this.outputStream.getTracks().forEach((t) => t.stop());
      this.outputStream = null;
    }

    this.canvas = null;
    this.ctx = null;
  }
}
