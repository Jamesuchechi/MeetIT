import { randomUUID } from 'node:crypto';

export interface AiProxyDebriefEntry {
  askedBy: string;
  question: string;
  response: string;
  escalated: boolean;
  ts: number;
}

export interface AiProxyConfig {
  roomCode: string;
  ownerDisplayName: string;
  allowedTopics: string[];
  contextFacts: Record<string, string>;
}

export class AiProxySession {
  readonly id = randomUUID();
  readonly roomCode: string;
  readonly ownerDisplayName: string;
  readonly displayName: string;
  readonly allowedTopics: string[];
  readonly contextFacts: Record<string, string>;
  readonly debrief: AiProxyDebriefEntry[] = [];
  active = true;

  constructor(config: AiProxyConfig) {
    this.roomCode = config.roomCode;
    this.ownerDisplayName = config.ownerDisplayName;
    this.displayName = `AI Proxy for ${config.ownerDisplayName}`;
    this.allowedTopics = config.allowedTopics.map((t) => t.toLowerCase());
    this.contextFacts = config.contextFacts;
  }

  private isAddressed(text: string): boolean {
    const lower = text.toLowerCase();
    const firstName = this.ownerDisplayName.toLowerCase().split(/\s+/)[0] ?? '';
    return (
      lower.includes('proxy') ||
      (firstName.length >= 2 && lower.includes(firstName))
    );
  }

  handleCaption(params: {
    speaker: string;
    text: string;
    ts?: number;
  }): { response: string; escalated: boolean } | null {
    if (!this.active) return null;
    if (params.speaker === this.displayName) return null;
    if (!this.isAddressed(params.text)) return null;

    const lower = params.text.toLowerCase();
    const matchedTopic = this.allowedTopics.find((topic) =>
      lower.includes(topic),
    );

    let response: string;
    let escalated = false;

    if (matchedTopic) {
      const factEntry = Object.entries(this.contextFacts).find(
        ([k]) =>
          k.toLowerCase().includes(matchedTopic) ||
          lower.includes(k.toLowerCase()),
      );
      response = factEntry
        ? `[${this.displayName}] ${factEntry[1]}`
        : `[${this.displayName}] On ${matchedTopic}: ${this.ownerDisplayName} has noted this is in scope and will share details shortly.`;
    } else {
      escalated = true;
      response = `[${this.displayName}] I'm not authorized to answer or commit on that topic. I've logged this question for ${this.ownerDisplayName} to follow up.`;
    }

    this.debrief.push({
      askedBy: params.speaker,
      question: params.text,
      response,
      escalated,
      ts: params.ts ?? Date.now(),
    });

    return { response, escalated };
  }
}
