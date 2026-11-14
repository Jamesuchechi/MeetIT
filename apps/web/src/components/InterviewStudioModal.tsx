import React, { useEffect, useState } from 'react';
import { Code2, Play, Download, Plus, RefreshCw, X, Lock } from 'lucide-react';
import {
  addInterviewQuestion,
  exportScorecardAsAtsJson,
  exportScorecardAsMarkdown,
  loadInterviewQuestions,
  loadScorecardsForRoom,
  runSandboxedJs,
  saveInterviewScorecard,
  type CodeRunResult,
  type HireRecommendation,
  type InterviewQuestion,
  type InterviewScorecard,
} from '../lib/interviewStore';

export interface InterviewStudioModalProps {
  roomCode: string;
  canModerate: boolean;
  selfDisplayName: string;
  candidateDefaultName?: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function InterviewStudioModal({
  roomCode,
  canModerate,
  selfDisplayName,
  candidateDefaultName = 'Candidate',
  onClose,
  onToast,
}: InterviewStudioModalProps) {
  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const [questions, setQuestions] = useState<InterviewQuestion[]>(() =>
    loadInterviewQuestions(),
  );
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    () => questions[0]?.id ?? 'q-two-sum',
  );
  const [code, setCode] = useState<string>(
    () => questions[0]?.starterCode ?? '',
  );
  const [language, setLanguage] = useState<'javascript' | 'typescript'>(
    'javascript',
  );
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Custom question draft (host only)
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQTitle, setNewQTitle] = useState('');
  const [newQPrompt, setNewQPrompt] = useState('');

  // Private Scorecard state (host/moderator only)
  const [candidateName, setCandidateName] = useState(candidateDefaultName);
  const [problemSolving, setProblemSolving] = useState(4);
  const [codeQuality, setCodeQuality] = useState(4);
  const [communication, setCommunication] = useState(4);
  const [systemThinking, setSystemThinking] = useState(3);
  const [recommendation, setRecommendation] =
    useState<HireRecommendation>('Hire');
  const [notes, setNotes] = useState('');
  const [savedScorecards, setSavedScorecards] = useState<InterviewScorecard[]>(
    () => loadScorecardsForRoom(roomCode),
  );

  const activeQuestion =
    questions.find((q) => q.id === selectedQuestionId) ?? questions[0];

  const syncFromServer = async () => {
    setSyncing(true);
    try {
      const res = await fetch(
        `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/interview-pad`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          pad?: {
            code: string;
            language: 'javascript' | 'typescript';
            activeQuestionId?: string;
          };
        };
        if (data.pad) {
          setCode(data.pad.code);
          setLanguage(data.pad.language);
          if (data.pad.activeQuestionId) {
            setSelectedQuestionId(data.pad.activeQuestionId);
          }
        }
      }
    } catch {
      // offline/local mode
    } finally {
      setSyncing(false);
    }
  };

  const pushToServer = async (
    nextCode: string,
    nextLang: 'javascript' | 'typescript',
    nextQId?: string,
  ) => {
    try {
      await fetch(
        `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/interview-pad`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: nextCode,
            language: nextLang,
            activeQuestionId: nextQId ?? selectedQuestionId,
            updatedBy: selfDisplayName,
          }),
        },
      );
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    void syncFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const handleSelectQuestion = (qId: string) => {
    setSelectedQuestionId(qId);
    const found = questions.find((q) => q.id === qId);
    if (found) {
      setCode(found.starterCode);
      setRunResult(null);
      void pushToServer(found.starterCode, language, qId);
    }
  };

  const handleRunCode = async () => {
    setRunning(true);
    const res = await runSandboxedJs(code);
    setRunResult(res);
    setRunning(false);
  };

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQTitle.trim() || !newQPrompt.trim()) return;
    const created = addInterviewQuestion({
      title: newQTitle.trim(),
      difficulty: 'Medium',
      category: 'Algorithms',
      prompt: newQPrompt.trim(),
      starterCode: `// ${newQTitle.trim()}\nfunction solution(input) {\n  return input;\n}\nconsole.log(solution('ready'));`,
    });
    const updated = loadInterviewQuestions();
    setQuestions(updated);
    setSelectedQuestionId(created.id);
    setCode(created.starterCode);
    setNewQTitle('');
    setNewQPrompt('');
    setShowAddQuestion(false);
    void pushToServer(created.starterCode, language, created.id);
    onToast(`Added question "${created.title}" to bank.`);
  };

  const handleSaveScorecard = () => {
    const saved = saveInterviewScorecard({
      roomCode,
      candidateName: candidateName.trim() || 'Candidate',
      interviewerName: selfDisplayName || 'Interviewer',
      questionTitle: activeQuestion?.title ?? 'Coding Exercise',
      ratings: {
        problemSolving,
        codeQuality,
        communication,
        systemThinking,
      },
      recommendation,
      notes: notes.trim(),
    });
    setSavedScorecards(loadScorecardsForRoom(roomCode));
    onToast('Private scorecard saved locally.');
    return saved;
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Interview Studio"
      data-testid="interview-studio-modal"
    >
      <div
        className="modal-card"
        style={{
          width: 'min(1040px, 96vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code2 size={20} />
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              Interview Studio · {roomCode}
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close Interview Studio"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: canModerate ? '1.35fr 1fr' : '1fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Left: Shared Code Editor + Question Prompt + Execution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <select
                aria-label="Select interview question"
                value={selectedQuestionId}
                onChange={(e) => handleSelectQuestion(e.target.value)}
                style={{ flex: 1, minWidth: 180 }}
              >
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    [{q.difficulty}] {q.title} ({q.category})
                  </option>
                ))}
              </select>
              <select
                aria-label="Code language"
                value={language}
                onChange={(e) => {
                  const nextLang = e.target.value as
                    'javascript' | 'typescript';
                  setLanguage(nextLang);
                  void pushToServer(code, nextLang);
                }}
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
              </select>
              {canModerate && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowAddQuestion((v) => !v)}
                  title="Add question to bank"
                >
                  <Plus size={14} />
                  <span>Question</span>
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => void syncFromServer()}
                disabled={syncing}
                title="Pull latest code from room"
              >
                <RefreshCw size={14} />
                <span>{syncing ? 'Syncing…' : 'Sync'}</span>
              </button>
            </div>

            {showAddQuestion && canModerate && (
              <form
                onSubmit={handleAddQuestion}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <input
                  type="text"
                  placeholder="Question title"
                  value={newQTitle}
                  onChange={(e) => setNewQTitle(e.target.value)}
                  required
                />
                <textarea
                  rows={2}
                  placeholder="Prompt description…"
                  value={newQPrompt}
                  onChange={(e) => setNewQPrompt(e.target.value)}
                  required
                />
                <button type="submit" className="btn primary">
                  Save to Question Bank
                </button>
              </form>
            )}

            {activeQuestion && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-elevated, rgba(99,102,241,0.08))',
                  fontSize: 13,
                }}
              >
                <strong>{activeQuestion.title}:</strong>{' '}
                <span>{activeQuestion.prompt}</span>
              </div>
            )}

            <textarea
              aria-label="Shared code editor"
              data-testid="interview-code-editor"
              rows={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => void pushToServer(code, language)}
              spellCheck={false}
              style={{
                width: '100%',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13,
                lineHeight: 1.5,
                padding: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => void handleRunCode()}
                disabled={running}
                data-testid="interview-run-code-btn"
              >
                <Play size={14} />
                <span>{running ? 'Running…' : 'Run Code'}</span>
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void pushToServer(code, language).then(() =>
                    onToast('Shared code synced to room.'),
                  );
                }}
              >
                Share / Sync Pad
              </button>
            </div>

            {runResult && (
              <div
                data-testid="interview-run-output"
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.2)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                }}
              >
                <div style={{ opacity: 0.7, marginBottom: 4 }}>
                  Output ({runResult.durationMs}ms)
                </div>
                {runResult.output.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                {runResult.error && (
                  <div style={{ color: '#ef4444' }}>
                    Error: {runResult.error}
                  </div>
                )}
                {!runResult.error && runResult.output.length === 0 && (
                  <div style={{ opacity: 0.6 }}>(no console output)</div>
                )}
              </div>
            )}
          </div>

          {/* Right: Private Interviewer Scorecard & ATS Export (Moderator only) */}
          {canModerate && (
            <div
              data-testid="interview-scorecard-panel"
              style={{
                padding: 14,
                borderRadius: 12,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <strong
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Lock size={14} /> Private Scorecard
                </strong>
                <small style={{ opacity: 0.7 }}>Hidden from candidate</small>
              </div>

              <label
                style={{
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                Candidate name
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                />
              </label>

              {(
                [
                  ['Problem Solving', problemSolving, setProblemSolving],
                  ['Code Quality', codeQuality, setCodeQuality],
                  ['Communication', communication, setCommunication],
                  ['System Thinking', systemThinking, setSystemThinking],
                ] as const
              ).map(([label, val, setter]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 13,
                  }}
                >
                  <span>{label}</span>
                  <select
                    aria-label={label}
                    value={val}
                    onChange={(e) => setter(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <label
                style={{
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                Recommendation
                <select
                  value={recommendation}
                  onChange={(e) =>
                    setRecommendation(e.target.value as HireRecommendation)
                  }
                >
                  <option value="Strong Hire">Strong Hire</option>
                  <option value="Hire">Hire</option>
                  <option value="Lean No">Lean No</option>
                  <option value="No Hire">No Hire</option>
                </select>
              </label>

              <label
                style={{
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                Private notes
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations, trade-offs discussed, follow-ups…"
                />
              </label>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSaveScorecard}
                  data-testid="save-scorecard-btn"
                >
                  Save Scorecard
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const card = savedScorecards[0] ?? handleSaveScorecard();
                    downloadTextFile(
                      `ats-scorecard-${roomCode}.json`,
                      exportScorecardAsAtsJson(card),
                      'application/json',
                    );
                    onToast('Exported ATS JSON scorecard.');
                  }}
                  data-testid="export-ats-json-btn"
                >
                  <Download size={14} />
                  <span>ATS JSON</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const card = savedScorecards[0] ?? handleSaveScorecard();
                    downloadTextFile(
                      `scorecard-${roomCode}.md`,
                      exportScorecardAsMarkdown(card),
                      'text/markdown',
                    );
                    onToast('Exported Markdown scorecard.');
                  }}
                >
                  <Download size={14} />
                  <span>Markdown</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
