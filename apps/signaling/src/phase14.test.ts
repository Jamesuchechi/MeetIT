import { describe, expect, it } from 'vitest';
import { MeetingMemoryGraph } from './memoryGraph.js';
import {
  MEETING_TEMPLATES,
  buildCatchMeUpSummary,
  buildTranscriptHashChain,
  handleMcpRequest,
  verifyTranscriptHashChain,
} from './phase14.js';

describe('Phase 14 expansion primitives', () => {
  it('provides structured meeting templates and catch-me-up summaries', () => {
    expect(MEETING_TEMPLATES.map((t) => t.id)).toContain('standup');
    const summary = buildCatchMeUpSummary(
      [
        { displayName: 'Alice', text: 'First point', ts: 1000 },
        { displayName: 'Bob', text: 'We agreed to ship Friday', ts: 5000 },
      ],
      3000,
    );
    expect(summary.missedCount).toBe(1);
    expect(summary.summary).toContain('Bob');
  });

  it('builds and verifies tamper-evident transcript hash chains', () => {
    const secret = 'audit-secret-key';
    const chain = buildTranscriptHashChain(
      [
        { speaker: 'Alice', text: 'Confirmed terms', ts: 100 },
        { speaker: 'Bob', text: 'Agreed', ts: 200 },
      ],
      secret,
    );
    expect(verifyTranscriptHashChain(chain, secret)).toEqual({ valid: true });

    // Tamper with entry 1
    chain[1]!.text = 'Disagreed';
    expect(verifyTranscriptHashChain(chain, secret)).toEqual({
      valid: false,
      brokenAtIndex: 1,
    });
  });

  it('handles MCP tools/list and tools/call for meeting memory', () => {
    const graph = new MeetingMemoryGraph();
    graph.indexMeeting({
      roomCode: 'abc-defg-hij',
      title: 'Architecture Sync',
      participantIds: ['u1'],
      transcriptLines: [
        { speaker: 'Alice', text: 'We decided to use LiveKit.' },
      ],
    });

    const listRes = handleMcpRequest({ id: 1, method: 'tools/list' }, graph);
    expect((listRes.result as { tools: unknown[] }).tools.length).toBe(2);

    const callRes = handleMcpRequest(
      {
        id: 2,
        method: 'tools/call',
        params: {
          name: 'query_meeting_memory',
          arguments: { q: 'LiveKit', requesterId: 'u1' },
        },
      },
      graph,
    );
    const text = (callRes.result as { content: Array<{ text: string }> })
      .content[0]?.text;
    expect(text).toContain('LiveKit');
  });
});
