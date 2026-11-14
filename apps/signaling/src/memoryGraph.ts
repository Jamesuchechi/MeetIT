import { randomUUID } from 'node:crypto';
import { generateMeetingArtifact } from './meetingArtifacts.js';

export type MemoryNodeKind = 'topic' | 'decision' | 'action_item' | 'person';
export type MemoryEdgeRelation =
  'decided_in' | 'assigned_to' | 'supersedes' | 'relates_to';

export interface MemoryNode {
  id: string;
  roomCode: string;
  meetingTitle: string;
  participantIds: string[];
  kind: MemoryNodeKind;
  label: string;
  summary: string;
  ts: number;
}

export interface MemoryEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: MemoryEdgeRelation;
}

export class MeetingMemoryGraph {
  private readonly nodes: MemoryNode[] = [];
  private readonly edges: MemoryEdge[] = [];

  indexMeeting(params: {
    roomCode: string;
    title?: string | undefined;
    participantIds: string[];
    transcriptLines: Array<{ speaker: string; text: string; ts?: number }>;
    notesContent?: string | undefined;
  }): { nodesAdded: number; edgesAdded: number } {
    const artifact = generateMeetingArtifact({
      roomCode: params.roomCode,
      title: params.title,
      mode: 'spec',
      transcriptLines: params.transcriptLines,
      notesContent: params.notesContent,
    });

    const now = Date.now();
    let nodesAdded = 0;
    let edgesAdded = 0;

    const speakerSet = new Set(
      params.transcriptLines.map((l) => l.speaker.trim()).filter(Boolean),
    );
    const personNodes = new Map<string, MemoryNode>();
    for (const speaker of speakerSet) {
      const node: MemoryNode = {
        id: randomUUID(),
        roomCode: params.roomCode,
        meetingTitle: artifact.title,
        participantIds: params.participantIds,
        kind: 'person',
        label: speaker,
        summary: `Participated in ${artifact.title}`,
        ts: now,
      };
      this.nodes.push(node);
      personNodes.set(speaker, node);
      nodesAdded++;
    }

    for (const decision of artifact.decisions) {
      const node: MemoryNode = {
        id: randomUUID(),
        roomCode: params.roomCode,
        meetingTitle: artifact.title,
        participantIds: params.participantIds,
        kind: 'decision',
        label: decision.slice(0, 80),
        summary: decision,
        ts: now,
      };
      this.nodes.push(node);
      nodesAdded++;
    }

    for (const item of artifact.actionItems) {
      const node: MemoryNode = {
        id: randomUUID(),
        roomCode: params.roomCode,
        meetingTitle: artifact.title,
        participantIds: params.participantIds,
        kind: 'action_item',
        label: item.task.slice(0, 80),
        summary: `${item.owner}: ${item.task}`,
        ts: now,
      };
      this.nodes.push(node);
      nodesAdded++;

      const ownerNode = personNodes.get(item.owner);
      if (ownerNode) {
        this.edges.push({
          id: randomUUID(),
          fromNodeId: node.id,
          toNodeId: ownerNode.id,
          relation: 'assigned_to',
        });
        edgesAdded++;
      }
    }

    return { nodesAdded, edgesAdded };
  }

  query(params: {
    q: string;
    requesterId?: string | undefined;
    limit?: number | undefined;
  }): Array<MemoryNode & { score: number }> {
    const terms = params.q
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    if (terms.length === 0) return [];

    const scored: Array<MemoryNode & { score: number }> = [];
    for (const node of this.nodes) {
      if (
        params.requesterId &&
        node.participantIds.length > 0 &&
        !node.participantIds.includes(params.requesterId)
      ) {
        continue;
      }
      const haystack =
        `${node.meetingTitle} ${node.label} ${node.summary}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += 1;
      }
      if (score > 0) {
        scored.push({ ...node, score });
      }
    }

    scored.sort((a, b) => b.score - a.score || b.ts - a.ts);
    return scored.slice(0, params.limit ?? 10);
  }
}
