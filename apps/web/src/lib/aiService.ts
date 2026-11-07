/**
 * AI Meeting Intelligence Service
 *
 * Supports:
 * - Groq API (ultra-fast Llama-3.3-70b / Llama-3.1-8b)
 * - Mistral API (Mistral Small / Large)
 * - Structured heuristic fallback when offline or no API key is provided
 *
 * Capabilities:
 * 1. Post-meeting automated notes (executive summary, key decisions, action items with owners)
 * 2. Chapters and highlights with timestamp links
 * 3. "Ask the Meeting": Interactive Q&A over meeting transcripts with timestamp citations
 * 4. Email digest generator
 */

export interface MeetingChapter {
  timestampMs: number;
  timecode: string; // e.g. "01:25"
  title: string;
  summary: string;
}

export interface MeetingActionItemAI {
  task: string;
  owner?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface GeneratedMeetingIntelligence {
  executiveSummary: string;
  keyDecisions: string[];
  actionItems: MeetingActionItemAI[];
  chapters: MeetingChapter[];
  providerUsed: 'groq' | 'mistral' | 'heuristic';
  modelUsed: string;
}

export type AIProvider = 'groq' | 'mistral' | 'auto';

export function getEffectiveApiKeys(): {
  groqKey: string;
  mistralKey: string;
  preferredProvider: AIProvider;
} {
  let groqKey = '';
  let mistralKey = '';
  let preferredProvider: AIProvider = 'auto';

  if (typeof window !== 'undefined') {
    groqKey =
      window.localStorage.getItem('meetit_groq_api_key') ||
      (import.meta.env.VITE_GROQ_API_KEY as string) ||
      '';
    mistralKey =
      window.localStorage.getItem('meetit_mistral_api_key') ||
      (import.meta.env.VITE_MISTRAL_API_KEY as string) ||
      '';
    preferredProvider =
      (window.localStorage.getItem(
        'meetit_ai_preferred_provider',
      ) as AIProvider) || 'auto';
  } else {
    groqKey = (import.meta.env.VITE_GROQ_API_KEY as string) || '';
    mistralKey = (import.meta.env.VITE_MISTRAL_API_KEY as string) || '';
  }

  return {
    groqKey: groqKey.trim(),
    mistralKey: mistralKey.trim(),
    preferredProvider,
  };
}

export function saveUserApiKey(
  provider: 'groq' | 'mistral',
  key: string,
): void {
  if (typeof window === 'undefined') return;
  const storageKey =
    provider === 'groq' ? 'meetit_groq_api_key' : 'meetit_mistral_api_key';
  if (key.trim()) {
    window.localStorage.setItem(storageKey, key.trim());
  } else {
    window.localStorage.removeItem(storageKey);
  }
}

export function savePreferredProvider(provider: AIProvider): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('meetit_ai_preferred_provider', provider);
}

export async function testAIConnectivity(targetProvider?: AIProvider): Promise<{
  success: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  message: string;
}> {
  const { groqKey, mistralKey, preferredProvider } = getEffectiveApiKeys();
  const provider = targetProvider || preferredProvider;
  const start = Date.now();

  if ((provider === 'groq' || provider === 'auto') && groqKey) {
    try {
      const response = await callGroqChat(
        groqKey,
        [{ role: 'user', content: 'Say "MeetIT Groq online" in 3 words.' }],
        false,
      );
      const latencyMs = Date.now() - start;
      return {
        success: true,
        provider: 'Groq',
        model: 'llama-3.3-70b-versatile',
        latencyMs,
        message: `Connected successfully: "${response.trim()}" (${latencyMs}ms)`,
      };
    } catch (err) {
      if (provider === 'groq') {
        return {
          success: false,
          provider: 'Groq',
          model: 'llama-3.3-70b-versatile',
          latencyMs: Date.now() - start,
          message: (err as Error).message,
        };
      }
    }
  }

  if ((provider === 'mistral' || provider === 'auto') && mistralKey) {
    try {
      const response = await callMistralChat(
        mistralKey,
        [{ role: 'user', content: 'Say "MeetIT Mistral online" in 3 words.' }],
        false,
      );
      const latencyMs = Date.now() - start;
      return {
        success: true,
        provider: 'Mistral AI',
        model: 'mistral-small-latest',
        latencyMs,
        message: `Connected successfully: "${response.trim()}" (${latencyMs}ms)`,
      };
    } catch (err) {
      return {
        success: false,
        provider: 'Mistral AI',
        model: 'mistral-small-latest',
        latencyMs: Date.now() - start,
        message: (err as Error).message,
      };
    }
  }

  return {
    success: false,
    provider: 'None',
    model: 'heuristic-only',
    latencyMs: 0,
    message:
      'No API keys configured. Set Groq or Mistral key in settings or .env.',
  };
}

/**
 * Heuristic fallback engine: extracts key topics, decisions, and action items
 * from raw meeting text or chat transcript when no AI API key is configured.
 */
export function extractHeuristicIntelligence(
  transcriptText: string,
  roomTitle: string,
): GeneratedMeetingIntelligence {
  const lines = transcriptText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const keyDecisions: string[] = [];
  const actionItems: MeetingActionItemAI[] = [];
  const chapters: MeetingChapter[] = [];

  const decisionKeywords = [
    'agree',
    'decided',
    'resolve',
    'approve',
    'conclusion',
    'chosen',
    'will use',
    'we will go with',
  ];
  const actionKeywords = [
    'will',
    'action',
    'todo',
    'follow up',
    'investigate',
    'deploy',
    'review',
    'create',
    'write',
    'fix',
  ];

  let chapterIdx = 1;

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();

    // Check for decision signals
    if (decisionKeywords.some((k) => lower.includes(k))) {
      const clean = line
        .replace(/^[-*•0-9.)\s]+/, '')
        .replace(/^\[[^\]]+\]\s*/, '');
      if (clean && !keyDecisions.includes(clean)) {
        keyDecisions.push(clean);
      }
    }

    // Check for action signals
    if (actionKeywords.some((k) => lower.includes(k))) {
      const clean = line
        .replace(/^[-*•0-9.)\s]+/, '')
        .replace(/^\[[^\]]+\]\s*/, '');
      // Try to extract speaker name if formatted like [0:15] Name: Task
      const matchSpeaker = clean.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?):/);
      const owner = matchSpeaker ? matchSpeaker[1] : undefined;
      const taskText = matchSpeaker ? clean.replace(/^[^:]+:\s*/, '') : clean;

      if (taskText && !actionItems.some((a) => a.task === taskText)) {
        actionItems.push({
          task: taskText,
          ...(owner ? { owner } : {}),
          priority: 'medium',
        });
      }
    }

    // Generate periodic chapters
    if (index === 0 || index % 5 === 0) {
      const timecodeMatch = line.match(/\[([0-9:]+)\]/);
      const timecode = timecodeMatch ? timecodeMatch[1] : `0${chapterIdx}:00`;
      chapters.push({
        timestampMs: chapterIdx * 60000,
        timecode: timecode || '00:00',
        title:
          index === 0
            ? 'Meeting Kickoff & Context'
            : `Topic ${chapterIdx}: Discussion & Review`,
        summary: line.slice(0, 100),
      });
      chapterIdx++;
    }
  });

  const totalLines = lines.length;
  const executiveSummary =
    totalLines > 0
      ? `Discussion session for "${roomTitle}" covering ${totalLines} spoken exchanges. Key focal areas included architecture alignment, requirements, and next steps.`
      : `Meeting session for "${roomTitle}". No transcript lines available to summarize.`;

  return {
    executiveSummary,
    keyDecisions:
      keyDecisions.length > 0
        ? keyDecisions.slice(0, 5)
        : [
            'Aligned on immediate project priorities and operational checklist.',
          ],
    actionItems:
      actionItems.length > 0
        ? actionItems.slice(0, 8)
        : [
            {
              task: `Follow up on action items discussed in ${roomTitle}`,
              priority: 'medium',
            },
          ],
    chapters:
      chapters.length > 0
        ? chapters.slice(0, 6)
        : [
            {
              timestampMs: 0,
              timecode: '00:00',
              title: 'Opening & Overview',
              summary: 'Initial sync and team greeting.',
            },
          ],
    providerUsed: 'heuristic',
    modelUsed: 'heuristic-rule-engine',
  };
}

/**
 * Call Groq API via standard OpenAI-compatible completions endpoint
 */
async function callGroqChat(
  apiKey: string,
  messages: { role: string; content: string }[],
  jsonMode = false,
): Promise<string> {
  const model = 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/**
 * Call Mistral API via standard completions endpoint
 */
async function callMistralChat(
  apiKey: string,
  messages: { role: string; content: string }[],
  jsonMode = false,
): Promise<string> {
  const model = 'mistral-small-latest';
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Mistral API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/**
 * Generate meeting intelligence (notes, decisions, action items, chapters)
 */
export async function generateMeetingNotes(
  transcriptText: string,
  roomTitle: string,
): Promise<GeneratedMeetingIntelligence> {
  if (!transcriptText || transcriptText.trim().length === 0) {
    return extractHeuristicIntelligence('', roomTitle);
  }

  const { groqKey, mistralKey, preferredProvider } = getEffectiveApiKeys();

  const useGroqFirst =
    (preferredProvider === 'groq' && groqKey) ||
    (preferredProvider !== 'mistral' && groqKey) ||
    (!mistralKey && groqKey);

  const useMistralFirst =
    (preferredProvider === 'mistral' && mistralKey) || (!groqKey && mistralKey);

  const prompt = `You are an elite executive meeting assistant. Analyze the provided transcript of meeting "${roomTitle}".
Produce a concise, professional intelligence report in JSON format with exactly the following schema:

{
  "executiveSummary": "A crisp, high-value 2-4 sentence executive overview of what occurred.",
  "keyDecisions": ["Clear, bulleted decisions agreed upon by the participants."],
  "actionItems": [
    {
      "task": "Description of actionable task",
      "owner": "Name of assigned person if mentioned, otherwise leave undefined or null",
      "dueDate": "Due date if mentioned e.g. 'Friday' or 'next week', otherwise leave undefined or null",
      "priority": "low" | "medium" | "high"
    }
  ],
  "chapters": [
    {
      "timestampMs": 0,
      "timecode": "MM:SS",
      "title": "Topic or Section Title",
      "summary": "1 sentence recap of this section"
    }
  ]
}

TRANSCRIPT:
${transcriptText.slice(0, 30000)}
`;

  const messages = [
    {
      role: 'system',
      content:
        'You are an expert AI meeting scribe. Always respond with strict, valid JSON matching the requested schema without markdown backticks or extra prose.',
    },
    { role: 'user', content: prompt },
  ];

  // Try Groq if available
  if (useGroqFirst) {
    try {
      const raw = await callGroqChat(groqKey, messages, true);
      const parsed = JSON.parse(raw);
      return {
        executiveSummary: parsed.executiveSummary || 'No summary generated.',
        keyDecisions: Array.isArray(parsed.keyDecisions)
          ? parsed.keyDecisions
          : [],
        actionItems: Array.isArray(parsed.actionItems)
          ? parsed.actionItems
          : [],
        chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
        providerUsed: 'groq',
        modelUsed: 'llama-3.3-70b-versatile',
      };
    } catch (err) {
      console.warn('Groq generation failed, attempting fallback...', err);
      if (mistralKey) {
        try {
          const raw = await callMistralChat(mistralKey, messages, true);
          const parsed = JSON.parse(raw);
          return {
            executiveSummary:
              parsed.executiveSummary || 'No summary generated.',
            keyDecisions: Array.isArray(parsed.keyDecisions)
              ? parsed.keyDecisions
              : [],
            actionItems: Array.isArray(parsed.actionItems)
              ? parsed.actionItems
              : [],
            chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
            providerUsed: 'mistral',
            modelUsed: 'mistral-small-latest',
          };
        } catch (mistralErr) {
          console.warn('Mistral fallback failed:', mistralErr);
        }
      }
    }
  }

  // Try Mistral if preferred or sole key
  if (useMistralFirst) {
    try {
      const raw = await callMistralChat(mistralKey, messages, true);
      const parsed = JSON.parse(raw);
      return {
        executiveSummary: parsed.executiveSummary || 'No summary generated.',
        keyDecisions: Array.isArray(parsed.keyDecisions)
          ? parsed.keyDecisions
          : [],
        actionItems: Array.isArray(parsed.actionItems)
          ? parsed.actionItems
          : [],
        chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
        providerUsed: 'mistral',
        modelUsed: 'mistral-small-latest',
      };
    } catch (err) {
      console.warn('Mistral generation failed, attempting fallback...', err);
      if (groqKey) {
        try {
          const raw = await callGroqChat(groqKey, messages, true);
          const parsed = JSON.parse(raw);
          return {
            executiveSummary:
              parsed.executiveSummary || 'No summary generated.',
            keyDecisions: Array.isArray(parsed.keyDecisions)
              ? parsed.keyDecisions
              : [],
            actionItems: Array.isArray(parsed.actionItems)
              ? parsed.actionItems
              : [],
            chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
            providerUsed: 'groq',
            modelUsed: 'llama-3.3-70b-versatile',
          };
        } catch (groqErr) {
          console.warn('Groq fallback failed:', groqErr);
        }
      }
    }
  }

  // Graceful rule-based heuristic extraction
  return extractHeuristicIntelligence(transcriptText, roomTitle);
}

/**
 * "Ask the Meeting": Q&A over meeting transcript with citations
 */
export async function askMeeting(
  question: string,
  transcriptText: string,
  roomTitle: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<{ answer: string; citations: string[]; provider: string }> {
  const { groqKey, mistralKey, preferredProvider } = getEffectiveApiKeys();

  const systemPrompt = `You are "Ask the Meeting", an AI assistant answering questions about the meeting "${roomTitle}".
Use ONLY the provided meeting transcript to answer the user's questions.
Whenever you reference something spoken, include timestamp citations like [02:15] or [08:30] corresponding to where in the transcript it occurred.
If the transcript does not contain the answer, politely state that it was not discussed during the meeting.

TRANSCRIPT:
${transcriptText.slice(0, 28000)}
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: question },
  ];

  if ((preferredProvider === 'groq' || !mistralKey) && groqKey) {
    try {
      const answer = await callGroqChat(groqKey, messages);
      const citations = Array.from(answer.matchAll(/\[([0-9:]+)\]/g)).map(
        (m) => m[0],
      );
      return { answer, citations, provider: 'Groq (Llama 3.3)' };
    } catch (err) {
      console.warn('Groq Q&A failed, checking Mistral...', err);
    }
  }

  if (mistralKey) {
    try {
      const answer = await callMistralChat(mistralKey, messages);
      const citations = Array.from(answer.matchAll(/\[([0-9:]+)\]/g)).map(
        (m) => m[0],
      );
      return { answer, citations, provider: 'Mistral AI' };
    } catch (err) {
      console.warn('Mistral Q&A failed...', err);
    }
  }

  // Heuristic Q&A matcher if offline or no keys available
  const lowerQ = question.toLowerCase();
  const matchedLines = transcriptText
    .split('\n')
    .filter((line) => {
      const words = lowerQ.split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => line.toLowerCase().includes(w));
    })
    .slice(0, 3);

  if (matchedLines.length > 0) {
    const citations = matchedLines
      .map((l) => (l.match(/\[([0-9:]+)\]/) || [])[0])
      .filter((c): c is string => Boolean(c));
    return {
      answer: `Based on the transcript excerpts:\n\n${matchedLines.join('\n\n')}`,
      citations,
      provider: 'Local Search Index',
    };
  }

  return {
    answer: `I could not find a direct mention of "${question}" in the recorded transcript.`,
    citations: [],
    provider: 'Local Search Index',
  };
}

/**
 * Format email digest for meeting attendees
 */
export function formatEmailDigest(
  intelligence: GeneratedMeetingIntelligence,
  roomTitle: string,
  roomCode: string,
  meetingDate: string,
  attendees: string[] = [],
): { subject: string; bodyText: string; bodyHtml: string; mailtoUrl: string } {
  const formattedDate = new Date(meetingDate).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
  const subject = `[Meeting Recap] ${roomTitle} (${formattedDate})`;

  const attendeeList =
    attendees.length > 0 ? attendees.join(', ') : 'Meeting Attendees';

  const decisionsList =
    intelligence.keyDecisions.length > 0
      ? intelligence.keyDecisions.map((d) => `• ${d}`).join('\n')
      : '• Aligned on meeting agenda and follow-up steps.';

  const actionList =
    intelligence.actionItems.length > 0
      ? intelligence.actionItems
          .map(
            (a) =>
              `• [ ] ${a.task}${a.owner ? ` (@${a.owner})` : ''}${a.dueDate ? ` - Due: ${a.dueDate}` : ''}`,
          )
          .join('\n')
      : '• [ ] Review meeting summary.';

  const chaptersList =
    intelligence.chapters.length > 0
      ? intelligence.chapters
          .map((c) => `[${c.timecode}] ${c.title}: ${c.summary}`)
          .join('\n')
      : '';

  const bodyText = `Hi team,

Here is the meeting digest for "${roomTitle}" (${formattedDate}):

Room Code: ${roomCode}
Attendees: ${attendeeList}

EXECUTIVE SUMMARY:
${intelligence.executiveSummary}

KEY DECISIONS:
${decisionsList}

ACTION ITEMS:
${actionList}
${chaptersList ? `\nCHAPTERS & TIMESTAMPS:\n${chaptersList}` : ''}

Generated automatically by MeetIT Intelligence.
`;

  const bodyHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
  <h2 style="color: #0f172a; margin-bottom: 4px;">Meeting Recap: ${roomTitle}</h2>
  <p style="color: #64748b; font-size: 14px; margin-top: 0;">${formattedDate} · Room Code: <code>${roomCode}</code></p>
  
  <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <h3 style="margin: 0 0 6px; font-size: 15px; color: #1e3a8a;">Executive Summary</h3>
    <p style="margin: 0; font-size: 14px; color: #334155;">${intelligence.executiveSummary}</p>
  </div>

  <h3 style="font-size: 15px; margin: 16px 0 8px; color: #0f172a;">Key Decisions</h3>
  <ul style="padding-left: 20px; margin: 0 0 16px;">
    ${intelligence.keyDecisions.map((d) => `<li style="font-size: 14px; margin-bottom: 4px;">${d}</li>`).join('')}
  </ul>

  <h3 style="font-size: 15px; margin: 16px 0 8px; color: #0f172a;">Action Items</h3>
  <ul style="padding-left: 20px; margin: 0 0 16px; list-style-type: none;">
    ${intelligence.actionItems
      .map(
        (a) =>
          `<li style="font-size: 14px; margin-bottom: 6px;">
            <input type="checkbox" disabled /> <strong>${a.task}</strong>
            ${a.owner ? `<span style="color: #3b82f6; font-size: 12px;"> @${a.owner}</span>` : ''}
            ${a.dueDate ? `<span style="color: #f59e0b; font-size: 12px;"> (Due: ${a.dueDate})</span>` : ''}
          </li>`,
      )
      .join('')}
  </ul>

  <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 24px;">
    Sent via MeetIT AI Meeting Intelligence.
  </p>
</div>
`;

  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

  return {
    subject,
    bodyText,
    bodyHtml,
    mailtoUrl,
  };
}
