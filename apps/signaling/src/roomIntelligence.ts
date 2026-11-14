import { randomUUID } from 'node:crypto';
import type { AgendaItem, SignalingEvents } from '@meetit/protocol';

export type ModeratorNudge = SignalingEvents['moderator.nudge'];
export type ModeratorStats = SignalingEvents['moderator.stats'];

interface CaptionBufferEntry {
  peerId: string;
  displayName: string;
  text: string;
  ts: number;
}

const TOXICITY_PATTERNS: RegExp[] = [
  /\b(idiot|stupid|moron|shut up|useless|loser)\b/i,
  /\b(kill yourself|threaten|harass)\b/i,
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'about',
  'what',
  'when',
  'where',
  'which',
  'have',
  'will',
  'would',
  'could',
  'should',
  'are',
  'was',
  'were',
  'been',
  'being',
  'just',
  'like',
  'okay',
  'yeah',
  'well',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

export class RoomIntelligenceTracker {
  enabled = true;
  talkTimeThresholdPct = 70;
  toxicityCheck = true;

  private readonly talkSecondsByPeer = new Map<
    string,
    { displayName: string; seconds: number }
  >();
  private readonly captionBuffer: CaptionBufferEntry[] = [];
  private readonly parkedTangents: string[] = [];
  private readonly lastNudgeAt = new Map<string, number>();
  private activeAgendaStartedAt = new Map<string, number>();

  configure(options: {
    enabled: boolean;
    talkTimeThresholdPct?: number | undefined;
    toxicityCheck?: boolean | undefined;
  }): void {
    this.enabled = options.enabled;
    if (options.talkTimeThresholdPct !== undefined) {
      this.talkTimeThresholdPct = options.talkTimeThresholdPct;
    }
    if (options.toxicityCheck !== undefined) {
      this.toxicityCheck = options.toxicityCheck;
    }
  }

  recordParkedTangent(text: string): void {
    this.parkedTangents.push(text.trim());
  }

  getParkedTangents(): string[] {
    return [...this.parkedTangents];
  }

  getRecentCaptions(windowMs = 90_000, now = Date.now()): CaptionBufferEntry[] {
    const cutoff = now - windowMs;
    while (
      this.captionBuffer.length > 0 &&
      (this.captionBuffer[0]?.ts ?? 0) < cutoff
    ) {
      this.captionBuffer.shift();
    }
    return [...this.captionBuffer];
  }

  getStats(): ModeratorStats {
    let totalSeconds = 0;
    for (const entry of this.talkSecondsByPeer.values()) {
      totalSeconds += entry.seconds;
    }
    const talkTimeByPeer: ModeratorStats['talkTimeByPeer'] = {};
    for (const [peerId, entry] of this.talkSecondsByPeer.entries()) {
      talkTimeByPeer[peerId] = {
        displayName: entry.displayName,
        seconds: Math.round(entry.seconds),
        sharePct:
          totalSeconds > 0
            ? Math.round((entry.seconds / totalSeconds) * 100)
            : 0,
      };
    }
    return {
      enabled: this.enabled,
      talkTimeByPeer,
    };
  }

  private canEmitNudge(key: string, cooldownMs: number, now: number): boolean {
    const last = this.lastNudgeAt.get(key) ?? 0;
    if (now - last < cooldownMs) return false;
    this.lastNudgeAt.set(key, now);
    return true;
  }

  recordCaptionCue(params: {
    peerId: string;
    displayName: string;
    text: string;
    isFinal: boolean;
    ts: number;
    activePeerIds?: string[];
    agenda?: AgendaItem[];
  }): { nudges: ModeratorNudge[]; stats: ModeratorStats } {
    const nudges: ModeratorNudge[] = [];

    if (params.isFinal) {
      this.captionBuffer.push({
        peerId: params.peerId,
        displayName: params.displayName,
        text: params.text,
        ts: params.ts,
      });

      // Estimate speaking seconds from word count (~2.5 words/sec, min 1s)
      const words = params.text.trim().split(/\s+/).filter(Boolean).length;
      const estimatedSec = Math.max(1, Math.min(20, words / 2.5));
      const existing = this.talkSecondsByPeer.get(params.peerId);
      this.talkSecondsByPeer.set(params.peerId, {
        displayName: params.displayName,
        seconds: (existing?.seconds ?? 0) + estimatedSec,
      });
    }

    if (!this.enabled) {
      return { nudges, stats: this.getStats() };
    }

    // 1. Toxicity / harassment check
    if (
      this.toxicityCheck &&
      TOXICITY_PATTERNS.some((pattern) => pattern.test(params.text))
    ) {
      if (this.canEmitNudge(`toxicity:${params.peerId}`, 30_000, params.ts)) {
        nudges.push({
          id: randomUUID(),
          kind: 'toxicity',
          message: `Potential disrespectful or hostile language detected from ${params.displayName}.`,
          ts: params.ts,
          targetPeerId: params.peerId,
          suggestedAction: 'mute',
        });
      }
    }

    // 2. Talk-time imbalance check (requires >= 30s total speaking time)
    const stats = this.getStats();
    let totalSec = 0;
    for (const v of Object.values(stats.talkTimeByPeer)) {
      totalSec += v.seconds;
    }
    const participantCount = Math.max(
      Object.keys(stats.talkTimeByPeer).length,
      params.activePeerIds?.length ?? 0,
    );
    if (totalSec >= 30 && participantCount >= 2) {
      for (const [peerId, entry] of Object.entries(stats.talkTimeByPeer)) {
        if (entry.sharePct >= this.talkTimeThresholdPct) {
          if (this.canEmitNudge(`imbalance:${peerId}`, 120_000, params.ts)) {
            nudges.push({
              id: randomUUID(),
              kind: 'talk_imbalance',
              message: `${entry.displayName} has spoken ${entry.sharePct}% of the meeting so far. Consider inviting quieter participants.`,
              ts: params.ts,
              targetPeerId: peerId,
              suggestedAction: 'invite_quiet',
            });
          }
        }
      }
    }

    // 3. Agenda overrun & drift check
    if (params.agenda && params.agenda.length > 0) {
      const agendaNudges = this.evaluateAgenda(params.agenda, params.ts);
      nudges.push(...agendaNudges);
    }

    return { nudges, stats };
  }

  evaluateAgenda(agenda: AgendaItem[], now = Date.now()): ModeratorNudge[] {
    if (!this.enabled) return [];
    const nudges: ModeratorNudge[] = [];
    const activeItem = agenda.find((item) => !item.completed);
    if (!activeItem) return nudges;

    if (!this.activeAgendaStartedAt.has(activeItem.id)) {
      this.activeAgendaStartedAt.set(activeItem.id, now);
    }
    const startedAt = this.activeAgendaStartedAt.get(activeItem.id) ?? now;
    const elapsedSec = (now - startedAt) / 1000;

    const allocatedSec = (activeItem.durationMinutes || 0) * 60;
    if (allocatedSec > 0 && elapsedSec > allocatedSec) {
      if (this.canEmitNudge(`overrun:${activeItem.id}`, 90_000, now)) {
        const overMin = Math.max(
          1,
          Math.round((elapsedSec - allocatedSec) / 60),
        );
        nudges.push({
          id: randomUUID(),
          kind: 'agenda_overrun',
          message: `Agenda item "${activeItem.title}" is ~${overMin}m over its allocated time.`,
          ts: now,
          suggestedAction: 'advance_agenda',
        });
      }
    }

    const recent = this.getRecentCaptions(60_000, now);
    if (recent.length >= 4) {
      const agendaKeywords = extractKeywords(activeItem.title);
      if (agendaKeywords.length > 0) {
        const combinedText = recent.map((c) => c.text).join(' ');
        const captionKeywords = new Set(extractKeywords(combinedText));
        const hasOverlap = agendaKeywords.some((kw) => captionKeywords.has(kw));
        if (!hasOverlap && captionKeywords.size >= 8) {
          if (this.canEmitNudge(`drift:${activeItem.id}`, 120_000, now)) {
            nudges.push({
              id: randomUUID(),
              kind: 'agenda_drift',
              message: `Discussion may have drifted from "${activeItem.title}". Park tangent to notes?`,
              ts: now,
              suggestedAction: 'park_tangent',
            });
          }
        }
      }
    }

    return nudges;
  }

  draftFollowUpAgenda(agenda: AgendaItem[]): Array<{
    title: string;
    durationMinutes: number;
    source: 'unfinished_agenda' | 'parked_tangent';
  }> {
    const items: Array<{
      title: string;
      durationMinutes: number;
      source: 'unfinished_agenda' | 'parked_tangent';
    }> = [];

    for (const item of agenda) {
      if (!item.completed) {
        items.push({
          title: item.title,
          durationMinutes: Math.max(5, item.durationMinutes || 5),
          source: 'unfinished_agenda',
        });
      }
    }

    for (const tangent of this.parkedTangents) {
      items.push({
        title: tangent,
        durationMinutes: 10,
        source: 'parked_tangent',
      });
    }

    return items;
  }
}
