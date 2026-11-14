import { describe, expect, it } from 'vitest';
import { RoomIntelligenceTracker } from './roomIntelligence.js';
import { generateMeetingArtifact } from './meetingArtifacts.js';
import { MeetingMemoryGraph } from './memoryGraph.js';
import { AiProxySession } from './aiProxy.js';

describe('Phase 13 Tier 1 spikes', () => {
  it('detects toxicity, talk-time imbalance, agenda overrun, and drafts follow-up agenda', () => {
    const intel = new RoomIntelligenceTracker();
    const now = 1_700_000_000_000;

    // 1. Toxicity detection
    const toxicRes = intel.recordCaptionCue({
      peerId: 'p1',
      displayName: 'Alice',
      text: 'You are an idiot for shipping that',
      isFinal: true,
      ts: now,
      activePeerIds: ['p1', 'p2'],
    });
    expect(toxicRes.nudges.some((n) => n.kind === 'toxicity')).toBe(true);

    // 2. Talk-time imbalance (>= 30s total, >= 70% share)
    const imbalanceNudges = [];
    for (let i = 0; i < 5; i++) {
      const res = intel.recordCaptionCue({
        peerId: 'p1',
        displayName: 'Alice',
        text: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
        isFinal: true,
        ts: now + (i + 1) * 1000,
        activePeerIds: ['p1', 'p2'],
      });
      imbalanceNudges.push(...res.nudges);
    }
    expect(imbalanceNudges.some((n) => n.kind === 'talk_imbalance')).toBe(true);

    // 3. Agenda overrun & follow-up draft
    const agenda = [
      {
        id: 'a1',
        title: 'Pricing Review',
        durationMinutes: 1,
        completed: false,
      },
    ];
    intel.evaluateAgenda(agenda, now);
    const overrunNudges = intel.evaluateAgenda(agenda, now + 120_000);
    expect(overrunNudges.some((n) => n.kind === 'agenda_overrun')).toBe(true);

    intel.recordParkedTangent('Revisit enterprise SSO timeline');
    const followUp = intel.draftFollowUpAgenda(agenda);
    expect(followUp).toHaveLength(2);
    expect(followUp[1]?.source).toBe('parked_tangent');
  });

  it('generates spec, tickets, and PR draft from meeting transcript and notes', () => {
    const transcriptLines = [
      {
        speaker: 'Alice',
        text: 'We decided to move media to apps/signaling/src/mediaProviders.ts',
      },
      {
        speaker: 'Bob',
        text: 'I will add unit tests for fallback in packages/media/src/fallback.ts',
      },
    ];

    const spec = generateMeetingArtifact({
      roomCode: 'abc-defg-hij',
      title: 'SFU Migration',
      mode: 'spec',
      transcriptLines,
    });
    expect(spec.decisions).toHaveLength(1);
    expect(spec.actionItems).toHaveLength(1);
    expect(spec.mentionedPaths).toContain(
      'apps/signaling/src/mediaProviders.ts',
    );

    const tickets = generateMeetingArtifact({
      roomCode: 'abc-defg-hij',
      title: 'SFU Migration',
      mode: 'tickets',
      transcriptLines,
    });
    expect(tickets.markdown).toContain('# Epic: SFU Migration');
    expect(tickets.markdown).toContain('**T-1** (Bob)');

    const pr = generateMeetingArtifact({
      roomCode: 'abc-defg-hij',
      title: 'SFU Migration',
      mode: 'pr_draft',
      transcriptLines,
    });
    expect(pr.markdown).toContain('# PR Draft: SFU Migration');
  });

  it('indexes meetings into MeetingMemoryGraph and enforces participant RLS filtering', () => {
    const graph = new MeetingMemoryGraph();
    graph.indexMeeting({
      roomCode: 'abc-defg-hij',
      title: 'Q4 Pricing Sync',
      participantIds: ['u-alice', 'u-bob'],
      transcriptLines: [
        { speaker: 'Alice', text: 'We decided to keep the Pro tier at $15.' },
        { speaker: 'Bob', text: 'I will update the Stripe price ID.' },
      ],
    });

    const aliceHits = graph.query({ q: 'Pro tier', requesterId: 'u-alice' });
    expect(aliceHits.length).toBeGreaterThan(0);

    const eveHits = graph.query({ q: 'Pro tier', requesterId: 'u-eve' });
    expect(eveHits).toHaveLength(0);
  });

  it('answers within allowed topics and escalates out-of-scope questions on AiProxySession', () => {
    const proxy = new AiProxySession({
      roomCode: 'abc-defg-hij',
      ownerDisplayName: 'Alice',
      allowedTopics: ['release', 'schedule'],
      contextFacts: {
        release: 'v2.1 ships on Friday at 14:00 UTC.',
      },
    });

    const inScope = proxy.handleCaption({
      speaker: 'Bob',
      text: 'Hey Alice, when is the release?',
    });
    expect(inScope?.escalated).toBe(false);
    expect(inScope?.response).toContain('v2.1 ships on Friday');

    const outOfScope = proxy.handleCaption({
      speaker: 'Bob',
      text: 'Alice, can you approve a $50k discount?',
    });
    expect(outOfScope?.escalated).toBe(true);
    expect(proxy.debrief).toHaveLength(2);
  });
});
