export interface SpacePoint {
  x: number;
  y: number;
}

export interface ProximityAudioResult {
  distance: number;
  gain: number;
  pan: number;
  videoVisible: boolean;
}

/**
 * Computes spatial audio gain (0..1), stereo pan (-1..1), and SFU video visibility
 * for persistent virtual spaces with proximity audio.
 */
export function computeProximityAudioGain(
  selfPos: SpacePoint,
  peerPos: SpacePoint,
  maxHearingRadius = 400,
): ProximityAudioResult {
  const dx = peerPos.x - selfPos.x;
  const dy = peerPos.y - selfPos.y;
  const distance = Math.hypot(dx, dy);

  if (distance >= maxHearingRadius) {
    return {
      distance,
      gain: 0,
      pan: Math.max(-1, Math.min(1, dx / maxHearingRadius)),
      videoVisible: false,
    };
  }

  const normalized = distance / maxHearingRadius;
  const gain = Math.max(0, Math.min(1, 1 - normalized * normalized));
  const pan = Math.max(-1, Math.min(1, dx / (maxHearingRadius * 0.6)));
  return {
    distance,
    gain: Number(gain.toFixed(3)),
    pan: Number(pan.toFixed(3)),
    videoVisible: distance <= maxHearingRadius * 0.85,
  };
}

export type HapticCueKind =
  'speaker_change' | 'hand_raised' | 'nudge' | 'alert';

const HAPTIC_PATTERNS: Record<HapticCueKind, number[]> = {
  speaker_change: [25],
  hand_raised: [40, 30, 40],
  nudge: [60, 40, 60],
  alert: [100, 50, 100, 50, 100],
};

/**
 * Triggers a device haptic vibration cue when supported (accessibility-first mode).
 */
export function triggerHapticCue(kind: HapticCueKind): boolean {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  ) {
    return navigator.vibrate(HAPTIC_PATTERNS[kind]);
  }
  return false;
}

export interface EngagementWindowInput {
  speakingMs: number;
  windowMs: number;
  captionTurns: number;
  cameraActive: boolean;
}

/**
 * Computes an opt-in, strictly on-device engagement score (0..100)
 * without transmitting raw video or biometric data.
 */
export function computeOnDeviceEngagement(input: EngagementWindowInput): {
  score: number;
  label: 'high' | 'moderate' | 'low';
} {
  const safeWindow = Math.max(1, input.windowMs);
  const speakRatio = Math.min(1, Math.max(0, input.speakingMs / safeWindow));
  const turnBonus = Math.min(35, input.captionTurns * 7);
  const cameraBonus = input.cameraActive ? 15 : 0;
  const score = Math.round(
    Math.min(100, speakRatio * 50 + turnBonus + cameraBonus),
  );
  const label = score >= 65 ? 'high' : score >= 35 ? 'moderate' : 'low';
  return { score, label };
}

/**
 * Lightweight caption translator helper for Universal Translator Rooms.
 * Uses a configured translation endpoint if provided, or returns a tagged preview.
 */
export async function translateCaptionText(
  text: string,
  targetLang: string,
  endpointUrl?: string,
): Promise<string> {
  if (!targetLang || targetLang === 'en') return text;
  if (endpointUrl) {
    try {
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'auto', target: targetLang }),
      });
      if (res.ok) {
        const data = (await res.json()) as { translatedText?: string };
        if (data.translatedText) return data.translatedText;
      }
    } catch {
      // fall through to tagged fallback
    }
  }
  return `[${targetLang.toUpperCase()}] ${text}`;
}
