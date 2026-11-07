import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractHeuristicIntelligence,
  formatEmailDigest,
  generateMeetingNotes,
  askMeeting,
  getEffectiveApiKeys,
  saveUserApiKey,
} from './aiService';

describe('aiService: Groq, Mistral, and Meeting Intelligence suite', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    };

    globalThis.window = {
      localStorage: mockStorage as Storage,
    } as unknown as Window & typeof globalThis;
  });

  const sampleTranscript = `
[00:00] Alice: Welcome everyone to our sprint review.
[00:15] Bob: Thanks Alice. We will deploy the new signaling server to Fly.io on Friday.
[00:45] Alice: Great, we decided to use Groq for ultra low-latency meeting notes.
[01:10] Charlie: I will review the pull request for LiveKit egress today.
[01:45] Alice: Sounds good, let's follow up on Monday.
`;

  it('heuristically extracts decisions, action items, and chapters from transcript', () => {
    const intel = extractHeuristicIntelligence(
      sampleTranscript,
      'Sprint Review',
    );
    expect(intel.executiveSummary).toContain('Sprint Review');
    expect(intel.keyDecisions.length).toBeGreaterThan(0);
    expect(intel.actionItems.length).toBeGreaterThan(0);
    expect(intel.chapters.length).toBeGreaterThan(0);
    expect(intel.providerUsed).toBe('heuristic');
  });

  it('formats an email digest with proper mailto URL and markdown/HTML structure', () => {
    const intel = extractHeuristicIntelligence(
      sampleTranscript,
      'Sprint Review',
    );
    const digest = formatEmailDigest(
      intel,
      'Sprint Review',
      'abc-defg-hij',
      '2026-11-07T14:00:00.000Z',
      ['Alice', 'Bob'],
    );

    expect(digest.subject).toContain('[Meeting Recap] Sprint Review');
    expect(digest.bodyText).toContain('EXECUTIVE SUMMARY:');
    expect(digest.bodyText).toContain('KEY DECISIONS:');
    expect(digest.bodyText).toContain('ACTION ITEMS:');
    expect(digest.bodyHtml).toContain('Meeting Recap: Sprint Review');
    expect(digest.mailtoUrl).toContain('mailto:?subject=');
  });

  it('stores and retrieves user API keys in localStorage', () => {
    saveUserApiKey('groq', 'gsk_test_key_123');
    saveUserApiKey('mistral', 'mis_test_key_456');

    const keys = getEffectiveApiKeys();
    expect(keys.groqKey).toBe('gsk_test_key_123');
    expect(keys.mistralKey).toBe('mis_test_key_456');

    saveUserApiKey('groq', '');
    saveUserApiKey('mistral', '');
  });

  it('generates meeting notes using mock AI completion', async () => {
    const mockJson = JSON.stringify({
      executiveSummary: 'Team agreed to deploy signaling server on Friday.',
      keyDecisions: ['Use Groq for meeting intelligence.'],
      actionItems: [
        {
          task: 'Deploy signaling server to Fly.io',
          owner: 'Bob',
          dueDate: 'Friday',
        },
      ],
      chapters: [
        {
          timestampMs: 0,
          timecode: '00:00',
          title: 'Kickoff',
          summary: 'Welcome',
        },
      ],
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockJson } }],
      }),
    });

    saveUserApiKey('groq', 'gsk_test_mock_123');

    const result = await generateMeetingNotes(
      sampleTranscript,
      'Sprint Review',
    );
    expect(result.executiveSummary).toBe(
      'Team agreed to deploy signaling server on Friday.',
    );
    expect(result.keyDecisions).toContain('Use Groq for meeting intelligence.');
    expect(result.providerUsed).toBe('groq');

    saveUserApiKey('groq', '');
    globalThis.fetch = originalFetch;
  });

  it('answers "Ask the Meeting" questions with citations', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'The team decided to use Groq for meeting notes [00:45]. Bob will deploy on Friday [00:15].',
            },
          },
        ],
      }),
    });

    saveUserApiKey('groq', 'gsk_test_mock_123');

    const answer = await askMeeting(
      'When will the server be deployed?',
      sampleTranscript,
      'Sprint Review',
    );
    expect(answer.answer).toContain('Bob will deploy on Friday');
    expect(answer.citations).toContain('[00:45]');
    expect(answer.citations).toContain('[00:15]');

    saveUserApiKey('groq', '');
    globalThis.fetch = originalFetch;
  });
});
