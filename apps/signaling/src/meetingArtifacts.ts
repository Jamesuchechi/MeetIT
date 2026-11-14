import type { AgendaItem, WhiteboardAction } from '@meetit/protocol';

export type MeetingArtifactMode =
  'spec' | 'tickets' | 'pr_draft' | 'follow_up_agenda';

export interface MeetingArtifactInput {
  roomCode: string;
  title?: string | undefined;
  mode: MeetingArtifactMode;
  transcriptLines: Array<{ speaker: string; text: string; ts?: number }>;
  notesContent?: string | undefined;
  whiteboardActions?: WhiteboardAction[] | undefined;
  agenda?: AgendaItem[] | undefined;
  parkedTangents?: string[] | undefined;
}

export interface GeneratedMeetingArtifact {
  mode: MeetingArtifactMode;
  title: string;
  markdown: string;
  decisions: string[];
  actionItems: Array<{ owner: string; task: string }>;
  mentionedPaths: string[];
}

function extractDecisions(
  lines: Array<{ speaker: string; text: string }>,
): string[] {
  const results: string[] = [];
  const decisionPattern =
    /\b(decided|agreed|let's go with|we will use|approved|ship)\b/i;
  for (const line of lines) {
    if (decisionPattern.test(line.text)) {
      results.push(`${line.speaker}: ${line.text.trim()}`);
    }
  }
  return results;
}

function extractActionItems(
  lines: Array<{ speaker: string; text: string }>,
  notesContent?: string,
): Array<{ owner: string; task: string }> {
  const items: Array<{ owner: string; task: string }> = [];
  const actionPattern =
    /\b(will|need to|todo|action item|follow up|i'll|can you)\b/i;
  for (const line of lines) {
    if (actionPattern.test(line.text)) {
      items.push({ owner: line.speaker, task: line.text.trim() });
    }
  }
  if (notesContent) {
    for (const raw of notesContent.split('\n')) {
      const trimmed = raw.trim();
      if (/^[-*]\s*(\[\s*\]|TODO|Action:)/i.test(trimmed)) {
        items.push({
          owner: 'Unassigned',
          task: trimmed.replace(/^[-*]\s*(\[\s*\]\s*)?/, ''),
        });
      }
    }
  }
  return items;
}

function extractMentionedPaths(
  lines: Array<{ text: string }>,
  notesContent?: string,
): string[] {
  const text = `${lines.map((l) => l.text).join(' ')} ${notesContent ?? ''}`;
  const matches = text.match(
    /\b(?:apps|packages|src|docs|supabase)\/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+\b/g,
  );
  return Array.from(new Set(matches ?? []));
}

function extractWhiteboardLabels(actions?: WhiteboardAction[]): string[] {
  if (!actions || actions.length === 0) return [];
  const labels: string[] = [];
  for (const action of actions) {
    if (action.type === 'text' && action.text) {
      labels.push(action.text);
    }
  }
  return Array.from(new Set(labels));
}

export function generateMeetingArtifact(
  input: MeetingArtifactInput,
): GeneratedMeetingArtifact {
  const title = input.title?.trim() || `Meeting ${input.roomCode}`;
  const decisions = extractDecisions(input.transcriptLines);
  const actionItems = extractActionItems(
    input.transcriptLines,
    input.notesContent,
  );
  const mentionedPaths = extractMentionedPaths(
    input.transcriptLines,
    input.notesContent,
  );
  const whiteboardLabels = extractWhiteboardLabels(input.whiteboardActions);

  if (input.mode === 'tickets') {
    const ticketLines =
      actionItems.length > 0
        ? actionItems.map(
            (a, idx) => `- [ ] **T-${idx + 1}** (${a.owner}): ${a.task}`,
          )
        : ['- [ ] **T-1** (Unassigned): Review meeting notes and define tasks'];
    const markdown = [
      `# Epic: ${title}`,
      '',
      '## Acceptance Criteria / Decisions',
      ...(decisions.length > 0
        ? decisions.map((d) => `- ${d}`)
        : ['- Confirm scope from meeting notes']),
      '',
      '## Child Tasks',
      ...ticketLines,
      ...(mentionedPaths.length > 0
        ? [
            '',
            '## Referenced Files',
            ...mentionedPaths.map((p) => `- \`${p}\``),
          ]
        : []),
    ].join('\n');

    return {
      mode: input.mode,
      title,
      markdown,
      decisions,
      actionItems,
      mentionedPaths,
    };
  }

  if (input.mode === 'pr_draft') {
    const markdown = [
      `# PR Draft: ${title}`,
      '',
      '## Summary',
      ...(decisions.length > 0
        ? decisions.map((d) => `- ${d}`)
        : ['- Implements changes discussed in meeting']),
      '',
      '## Target Files',
      ...(mentionedPaths.length > 0
        ? mentionedPaths.map((p) => `- \`${p}\``)
        : ['- TBD']),
      '',
      '## Checklist',
      ...(actionItems.length > 0
        ? actionItems.map((a) => `- [ ] ${a.task} (${a.owner})`)
        : ['- [ ] Add implementation and unit tests']),
    ].join('\n');

    return {
      mode: input.mode,
      title,
      markdown,
      decisions,
      actionItems,
      mentionedPaths,
    };
  }

  if (input.mode === 'follow_up_agenda') {
    const unfinished = (input.agenda ?? []).filter((a) => !a.completed);
    const tangents = input.parkedTangents ?? [];
    const markdown = [
      `# Follow-Up Agenda: ${title}`,
      '',
      '## Carryover Items',
      ...(unfinished.length > 0
        ? unfinished.map(
            (a) =>
              `- [ ] ${a.title} (${Math.max(5, a.durationMinutes || 5)} min)`,
          )
        : ['- None']),
      '',
      '## Parked Tangents',
      ...(tangents.length > 0 ? tangents.map((t) => `- [ ] ${t}`) : ['- None']),
    ].join('\n');

    return {
      mode: input.mode,
      title,
      markdown,
      decisions,
      actionItems,
      mentionedPaths,
    };
  }

  // Default: 'spec'
  const markdown = [
    `# Technical Spec: ${title}`,
    '',
    '## Context & Notes',
    input.notesContent?.trim() || '_No shared notes recorded._',
    '',
    '## Key Decisions',
    ...(decisions.length > 0
      ? decisions.map((d) => `- ${d}`)
      : ['- No explicit decisions detected in transcript.']),
    '',
    '## Action Items',
    ...(actionItems.length > 0
      ? actionItems.map((a) => `- **${a.owner}:** ${a.task}`)
      : ['- None']),
    ...(whiteboardLabels.length > 0
      ? ['', '## Whiteboard Concepts', ...whiteboardLabels.map((l) => `- ${l}`)]
      : []),
    ...(mentionedPaths.length > 0
      ? [
          '',
          '## Referenced Modules',
          ...mentionedPaths.map((p) => `- \`${p}\``),
        ]
      : []),
  ].join('\n');

  return {
    mode: input.mode,
    title,
    markdown,
    decisions,
    actionItems,
    mentionedPaths,
  };
}
