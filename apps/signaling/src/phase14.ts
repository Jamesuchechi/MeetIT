import { createHash, createHmac } from 'node:crypto';
import type { AgendaItem } from '@meetit/protocol';
import type { MeetingMemoryGraph } from './memoryGraph.js';
import { generateMeetingArtifact } from './meetingArtifacts.js';

export interface MeetingTemplate {
  id: 'standup' | 'one_on_one' | 'retro' | 'client_call';
  name: string;
  defaultTitle: string;
  agenda: AgendaItem[];
  notesScaffold: string;
}

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    id: 'standup',
    name: 'Daily Standup',
    defaultTitle: 'Daily Standup',
    agenda: [
      {
        id: 'st-1',
        title: 'Yesterday & Progress',
        durationMinutes: 5,
        completed: false,
      },
      {
        id: 'st-2',
        title: 'Today & Priorities',
        durationMinutes: 5,
        completed: false,
      },
      { id: 'st-3', title: 'Blockers', durationMinutes: 5, completed: false },
    ],
    notesScaffold: '## Progress\n- \n\n## Blockers\n- ',
  },
  {
    id: 'one_on_one',
    name: '1:1 Check-in',
    defaultTitle: '1:1 Sync',
    agenda: [
      {
        id: 'oo-1',
        title: 'Wins & Pulse Check',
        durationMinutes: 10,
        completed: false,
      },
      {
        id: 'oo-2',
        title: 'Current Work & Feedback',
        durationMinutes: 15,
        completed: false,
      },
      {
        id: 'oo-3',
        title: 'Career & Action Items',
        durationMinutes: 5,
        completed: false,
      },
    ],
    notesScaffold: '## Discussion\n- \n\n## Action Items\n- [ ] ',
  },
  {
    id: 'retro',
    name: 'Sprint Retrospective',
    defaultTitle: 'Sprint Retro',
    agenda: [
      {
        id: 'rt-1',
        title: 'What Went Well',
        durationMinutes: 15,
        completed: false,
      },
      {
        id: 'rt-2',
        title: 'What Could Improve',
        durationMinutes: 15,
        completed: false,
      },
      {
        id: 'rt-3',
        title: 'Action Owners',
        durationMinutes: 10,
        completed: false,
      },
    ],
    notesScaffold: '## Went Well\n- \n\n## Improve\n- \n\n## Actions\n- [ ] ',
  },
  {
    id: 'client_call',
    name: 'Client Discovery / Review',
    defaultTitle: 'Client Sync',
    agenda: [
      {
        id: 'cc-1',
        title: 'Goals & Context',
        durationMinutes: 10,
        completed: false,
      },
      {
        id: 'cc-2',
        title: 'Demo / Proposal Walkthrough',
        durationMinutes: 20,
        completed: false,
      },
      {
        id: 'cc-3',
        title: 'Next Steps & Timeline',
        durationMinutes: 10,
        completed: false,
      },
    ],
    notesScaffold:
      '## Client Goals\n- \n\n## Decisions\n- \n\n## Next Steps\n- [ ] ',
  },
];

export function buildCatchMeUpSummary(
  captions: Array<{ displayName: string; text: string; ts: number }>,
  sinceTs = 0,
): {
  summary: string;
  highlights: Array<{ speaker: string; text: string; ts: number }>;
  missedCount: number;
} {
  const missed = captions.filter((c) => c.ts >= sinceTs);
  if (missed.length === 0) {
    return {
      summary: 'Nothing missed since you were away.',
      highlights: [],
      missedCount: 0,
    };
  }
  const highlights = missed.slice(-5).map((c) => ({
    speaker: c.displayName,
    text: c.text,
    ts: c.ts,
  }));
  const speakers = Array.from(new Set(missed.map((m) => m.displayName)));
  const summary = `${missed.length} updates from ${speakers.join(', ')}. Latest: "${highlights[highlights.length - 1]?.text ?? ''}"`;
  return {
    summary,
    highlights,
    missedCount: missed.length,
  };
}

export interface SignedTranscriptEntry {
  index: number;
  speaker: string;
  text: string;
  ts: number;
  prevHash: string;
  hash: string;
  signature: string;
}

export function buildTranscriptHashChain(
  entries: Array<{ speaker: string; text: string; ts: number }>,
  hmacSecret: string,
): SignedTranscriptEntry[] {
  let prevHash = 'GENESIS';
  return entries
    .map((entry, index) => {
      const payload = `${index}|${entry.speaker}|${entry.text}|${entry.ts}|${prevHash}`;
      const hash = createHash('sha256').update(payload).digest('hex');
      const signature = createHmac('sha256', hmacSecret)
        .update(hash)
        .digest('hex');
      prevHash = hash;
      return {
        index,
        speaker: entry.speaker,
        text: entry.text,
        ts: entry.ts,
        prevHash: index === 0 ? 'GENESIS' : prevHash === hash ? '' : prevHash,
        hash,
        signature,
      };
    })
    .map((item, idx, arr) => ({
      ...item,
      prevHash: idx === 0 ? 'GENESIS' : (arr[idx - 1]?.hash ?? 'GENESIS'),
    }));
}

export function verifyTranscriptHashChain(
  entries: SignedTranscriptEntry[],
  hmacSecret: string,
): { valid: boolean; brokenAtIndex?: number } {
  let expectedPrev = 'GENESIS';
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.prevHash !== expectedPrev) {
      return { valid: false, brokenAtIndex: i };
    }
    const payload = `${entry.index}|${entry.speaker}|${entry.text}|${entry.ts}|${entry.prevHash}`;
    const expectedHash = createHash('sha256').update(payload).digest('hex');
    if (entry.hash !== expectedHash) {
      return { valid: false, brokenAtIndex: i };
    }
    const expectedSig = createHmac('sha256', hmacSecret)
      .update(entry.hash)
      .digest('hex');
    if (entry.signature !== expectedSig) {
      return { valid: false, brokenAtIndex: i };
    }
    expectedPrev = entry.hash;
  }
  return { valid: true };
}

export function handleMcpRequest(
  rpc: {
    jsonrpc?: string;
    id?: unknown;
    method?: string;
    params?: Record<string, unknown>;
  },
  memoryGraph: MeetingMemoryGraph,
): Record<string, unknown> {
  const id = rpc.id ?? null;
  if (rpc.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'query_meeting_memory',
            description: 'Search decisions and action items across meetings.',
            inputSchema: {
              type: 'object',
              properties: {
                q: { type: 'string' },
                requesterId: { type: 'string' },
              },
              required: ['q'],
            },
          },
          {
            name: 'generate_meeting_artifact',
            description:
              'Generate a spec, ticket tree, or PR draft from transcript lines.',
            inputSchema: {
              type: 'object',
              properties: {
                roomCode: { type: 'string' },
                mode: { type: 'string' },
                transcriptLines: { type: 'array' },
              },
              required: ['roomCode', 'transcriptLines'],
            },
          },
        ],
      },
    };
  }

  if (rpc.method === 'tools/call') {
    const toolName = String(rpc.params?.name ?? '');
    const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>;
    if (toolName === 'query_meeting_memory') {
      const matches = memoryGraph.query({
        q: String(args.q ?? ''),
        requesterId: args.requesterId ? String(args.requesterId) : undefined,
      });
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(matches) }] },
      };
    }
    if (toolName === 'generate_meeting_artifact') {
      const artifact = generateMeetingArtifact({
        roomCode: String(args.roomCode ?? 'unknown'),
        mode: (args.mode as 'spec' | 'tickets' | 'pr_draft') ?? 'spec',
        transcriptLines: Array.isArray(args.transcriptLines)
          ? (args.transcriptLines as Array<{ speaker: string; text: string }>)
          : [],
      });
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: artifact.markdown }] },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unsupported MCP method: ${rpc.method}` },
  };
}
