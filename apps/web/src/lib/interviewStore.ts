export interface InterviewQuestion {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: 'Algorithms' | 'Frontend' | 'System Design' | 'Behavioral';
  prompt: string;
  starterCode: string;
  isCustom?: boolean;
}

export type HireRecommendation = 'Strong Hire' | 'Hire' | 'Lean No' | 'No Hire';

export interface InterviewScorecard {
  id: string;
  roomCode: string;
  candidateName: string;
  interviewerName: string;
  questionTitle: string;
  ratings: {
    problemSolving: number;
    codeQuality: number;
    communication: number;
    systemThinking: number;
  };
  recommendation: HireRecommendation;
  notes: string;
  createdAt: string;
}

const QUESTIONS_STORAGE_KEY = 'meetit_interview_questions_v1';
const SCORECARDS_STORAGE_KEY = 'meetit_interview_scorecards_v1';

export const DEFAULT_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'q-two-sum',
    title: 'Two Sum Indices',
    difficulty: 'Easy',
    category: 'Algorithms',
    prompt:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    starterCode: `function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\n\nconsole.log(twoSum([2, 7, 11, 15], 9));`,
  },
  {
    id: 'q-debounce',
    title: 'Implement Debounce',
    difficulty: 'Medium',
    category: 'Frontend',
    prompt:
      'Implement a debounce(fn, delayMs) utility that delays invoking fn until delayMs milliseconds have elapsed since the last call.',
    starterCode: `function debounce(fn, delayMs) {\n  let timer;\n  return function (...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), delayMs);\n  };\n}\n\nconst log = debounce((msg) => console.log('debounced:', msg), 50);\nlog('first');\nlog('final');`,
  },
  {
    id: 'q-lru-cache',
    title: 'LRU Cache',
    difficulty: 'Medium',
    category: 'Algorithms',
    prompt:
      'Design a Least Recently Used (LRU) cache with O(1) get(key) and put(key, value) operations.',
    starterCode: `class LRUCache {\n  constructor(capacity) {\n    this.capacity = capacity;\n    this.map = new Map();\n  }\n  get(key) {\n    if (!this.map.has(key)) return -1;\n    const val = this.map.get(key);\n    this.map.delete(key);\n    this.map.set(key, val);\n    return val;\n  }\n  put(key, val) {\n    if (this.map.has(key)) this.map.delete(key);\n    this.map.set(key, val);\n    if (this.map.size > this.capacity) {\n      const oldest = this.map.keys().next().value;\n      this.map.delete(oldest);\n    }\n  }\n}\n\nconst cache = new LRUCache(2);\ncache.put('a', 1);\ncache.put('b', 2);\ncache.get('a');\ncache.put('c', 3);\nconsole.log('b evicted:', cache.get('b'), 'a kept:', cache.get('a'));`,
  },
  {
    id: 'q-rate-limiter',
    title: 'Sliding Window Rate Limiter',
    difficulty: 'Hard',
    category: 'System Design',
    prompt:
      'Implement allowRequest(userId, timestampMs) allowing at most N requests in a sliding W-millisecond window.',
    starterCode: `function createRateLimiter(limit, windowMs) {\n  const hits = new Map();\n  return (userId, nowMs) => {\n    const list = (hits.get(userId) || []).filter((t) => nowMs - t < windowMs);\n    if (list.length >= limit) {\n      hits.set(userId, list);\n      return false;\n    }\n    list.push(nowMs);\n    hits.set(userId, list);\n    return true;\n  };\n}\n\nconst allow = createRateLimiter(2, 1000);\nconsole.log(allow('u1', 100), allow('u1', 200), allow('u1', 300), allow('u1', 1200));`,
  },
];

export function loadInterviewQuestions(): InterviewQuestion[] {
  try {
    const raw = window.localStorage.getItem(QUESTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_INTERVIEW_QUESTIONS;
    const custom = JSON.parse(raw) as InterviewQuestion[];
    if (!Array.isArray(custom)) return DEFAULT_INTERVIEW_QUESTIONS;
    return [...DEFAULT_INTERVIEW_QUESTIONS, ...custom];
  } catch {
    return DEFAULT_INTERVIEW_QUESTIONS;
  }
}

export function addInterviewQuestion(
  q: Omit<InterviewQuestion, 'id' | 'isCustom'>,
): InterviewQuestion {
  const created: InterviewQuestion = {
    ...q,
    id: `q-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    isCustom: true,
  };
  try {
    const raw = window.localStorage.getItem(QUESTIONS_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as InterviewQuestion[]) : [];
    const next = Array.isArray(existing) ? [...existing, created] : [created];
    window.localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota error
  }
  return created;
}

export function loadScorecardsForRoom(roomCode?: string): InterviewScorecard[] {
  try {
    const raw = window.localStorage.getItem(SCORECARDS_STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as InterviewScorecard[];
    if (!Array.isArray(all)) return [];
    if (!roomCode) return all;
    const norm = roomCode.trim().toUpperCase();
    return all.filter((s) => s.roomCode.trim().toUpperCase() === norm);
  } catch {
    return [];
  }
}

export function saveInterviewScorecard(
  input: Omit<InterviewScorecard, 'id' | 'createdAt'>,
): InterviewScorecard {
  const card: InterviewScorecard = {
    ...input,
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  try {
    const all = loadScorecardsForRoom();
    window.localStorage.setItem(
      SCORECARDS_STORAGE_KEY,
      JSON.stringify([card, ...all]),
    );
  } catch {
    // ignore quota error
  }
  return card;
}

export function exportScorecardAsAtsJson(card: InterviewScorecard): string {
  const avg =
    (card.ratings.problemSolving +
      card.ratings.codeQuality +
      card.ratings.communication +
      card.ratings.systemThinking) /
    4;
  return JSON.stringify(
    {
      schema: 'meetit.ats.scorecard.v1',
      id: card.id,
      roomCode: card.roomCode,
      candidate: { name: card.candidateName },
      interviewer: { name: card.interviewerName },
      questionTitle: card.questionTitle,
      overallRecommendation: card.recommendation,
      averageScore: Number(avg.toFixed(2)),
      rubric: [
        {
          criterion: 'Problem Solving',
          score: card.ratings.problemSolving,
          max: 5,
        },
        { criterion: 'Code Quality', score: card.ratings.codeQuality, max: 5 },
        {
          criterion: 'Communication',
          score: card.ratings.communication,
          max: 5,
        },
        {
          criterion: 'System Thinking',
          score: card.ratings.systemThinking,
          max: 5,
        },
      ],
      notes: card.notes,
      submittedAt: card.createdAt,
    },
    null,
    2,
  );
}

export function exportScorecardAsMarkdown(card: InterviewScorecard): string {
  return [
    `# Interview Scorecard: ${card.candidateName}`,
    `- **Room:** ${card.roomCode}`,
    `- **Interviewer:** ${card.interviewerName}`,
    `- **Question:** ${card.questionTitle}`,
    `- **Recommendation:** ${card.recommendation}`,
    `- **Date:** ${new Date(card.createdAt).toLocaleString()}`,
    '',
    '## Rubric (1–5)',
    `- Problem Solving: ${card.ratings.problemSolving}/5`,
    `- Code Quality: ${card.ratings.codeQuality}/5`,
    `- Communication: ${card.ratings.communication}/5`,
    `- System Thinking: ${card.ratings.systemThinking}/5`,
    '',
    '## Notes',
    card.notes || '_No additional notes._',
  ].join('\n');
}

export interface CodeRunResult {
  output: string[];
  error?: string;
  durationMs: number;
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export async function runSandboxedJs(code: string): Promise<CodeRunResult> {
  const started = Date.now();
  // Use isolated Web Worker when available so infinite loops can be terminated cleanly
  if (
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    return new Promise((resolve) => {
      const workerSource = `
        self.onmessage = function(e) {
          const logs = [];
          const console = {
            log: (...args) => logs.push(args.map(a => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' ')),
            error: (...args) => logs.push('[err] ' + args.map(a => String(a)).join(' ')),
            warn: (...args) => logs.push('[warn] ' + args.map(a => String(a)).join(' ')),
          };
          try {
            const fn = new Function('console', e.data);
            const ret = fn(console);
            if (ret !== undefined) {
              logs.push('=> ' + (typeof ret === 'string' ? ret : JSON.stringify(ret)));
            }
            self.postMessage({ ok: true, logs });
          } catch (err) {
            self.postMessage({ ok: false, logs, error: err && err.message ? err.message : String(err) });
          }
        };
      `;
      const blob = new Blob([workerSource], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl);
      const timer = setTimeout(() => {
        worker.terminate();
        URL.revokeObjectURL(blobUrl);
        resolve({
          output: [],
          error: 'Execution timed out after 2000ms.',
          durationMs: Date.now() - started,
        });
      }, 2000);

      worker.onmessage = (
        ev: MessageEvent<{ ok: boolean; logs: string[]; error?: string }>,
      ) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(blobUrl);
        resolve({
          output: ev.data.logs ?? [],
          ...(ev.data.error ? { error: ev.data.error } : {}),
          durationMs: Date.now() - started,
        });
      };

      worker.onerror = (err) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(blobUrl);
        resolve({
          output: [],
          error: err.message || 'Worker execution error',
          durationMs: Date.now() - started,
        });
      };

      worker.postMessage(code);
    });
  }

  // Fallback for test environments without Worker/createObjectURL
  const logs: string[] = [];
  const fakeConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatLogArg).join(' ')),
    error: (...args: unknown[]) =>
      logs.push(`[err] ${args.map(formatLogArg).join(' ')}`),
    warn: (...args: unknown[]) =>
      logs.push(`[warn] ${args.map(formatLogArg).join(' ')}`),
  };
  try {
    const fn = new Function('console', code);
    const ret = fn(fakeConsole);
    if (ret !== undefined) {
      logs.push(`=> ${formatLogArg(ret)}`);
    }
    return { output: logs, durationMs: Date.now() - started };
  } catch (err) {
    return {
      output: logs,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}
