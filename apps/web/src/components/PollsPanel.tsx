import React, { useState } from 'react';
import type { PollItem } from '@meetit/protocol';

interface PollsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  selfId: string;
  polls: PollItem[];
  onCreatePoll: (params: {
    question: string;
    options: string[];
    isQuiz?: boolean;
    correctOptionIndex?: number;
    allowMultiple?: boolean;
  }) => void;
  onVotePoll: (pollId: string, optionIndices: number[]) => void;
  onClosePoll: (pollId: string) => void;
  onDeletePoll: (pollId: string) => void;
  onOpenFormItSurvey?: () => void;
}

export function PollsPanel({
  isOpen,
  onClose,
  isHost,
  selfId,
  polls,
  onCreatePoll,
  onVotePoll,
  onClosePoll,
  onDeletePoll,
  onOpenFormItSurvey,
}: PollsPanelProps) {
  if (!isOpen) return null;

  const [isCreating, setIsCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correctOption, setCorrectOption] = useState(0);
  const [allowMultiple, setAllowMultiple] = useState(false);

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (idx: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx));
      if (correctOption >= idx && correctOption > 0) {
        setCorrectOption(correctOption - 1);
      }
    }
  };

  const handleOptionChange = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;

    onCreatePoll({
      question: question.trim(),
      options: cleanOptions,
      isQuiz,
      ...(isQuiz && correctOption !== undefined
        ? { correctOptionIndex: correctOption }
        : {}),
      allowMultiple,
    });

    setQuestion('');
    setOptions(['', '']);
    setIsQuiz(false);
    setCorrectOption(0);
    setAllowMultiple(false);
    setIsCreating(false);
  };

  const exportPollCsv = (poll: PollItem) => {
    const totalVotes = Object.keys(poll.votes || {}).length;
    let csv = `Question,"${poll.question.replace(/"/g, '""')}"\n`;
    csv += `Total Voters,${totalVotes}\n`;
    csv += `Status,${poll.closed ? 'Closed' : 'Active'}\n\n`;
    csv += 'Option,Votes,Percentage\n';

    poll.options.forEach((opt, idx) => {
      let count = 0;
      Object.values(poll.votes || {}).forEach((userVotes) => {
        if (userVotes.includes(idx)) count++;
      });
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      csv += `"${opt.replace(/"/g, '""')}",${count},${pct}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `poll-${poll.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col text-neutral-100"
      role="region"
      aria-label="Polls and Quizzes Panel"
    >
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="font-bold text-white">Polls & Quizzes</h3>
          <span className="text-xs bg-neutral-800 px-2 py-0.5 rounded-full text-neutral-400 font-mono">
            {polls.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenFormItSurvey && (
            <button
              onClick={onOpenFormItSurvey}
              className="text-xs px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded-lg transition"
              title="Launch FormIT survey"
            >
              FormIT
            </button>
          )}
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Creation form toggle for hosts */}
        {isHost && (
          <div>
            {!isCreating ? (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm rounded-xl text-white shadow-md transition flex items-center justify-center gap-2"
              >
                <span>➕</span> Create New Poll / Quiz
              </button>
            ) : (
              <form
                onSubmit={handleCreateSubmit}
                className="p-4 bg-neutral-800/80 border border-neutral-700 rounded-2xl flex flex-col gap-3"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    New Poll
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-400 mb-1 block">
                    Question
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Which design approach do you prefer?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-neutral-400">
                    Options
                  </label>
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {isQuiz && (
                        <input
                          type="radio"
                          name="correctOption"
                          checked={correctOption === idx}
                          onChange={() => setCorrectOption(idx)}
                          title="Mark as correct answer"
                          className="accent-emerald-500 cursor-pointer"
                        />
                      )}
                      <input
                        type="text"
                        required
                        placeholder={`Option ${idx + 1}`}
                        value={opt}
                        onChange={(e) =>
                          handleOptionChange(idx, e.target.value)
                        }
                        className="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="text-neutral-500 hover:text-rose-400 text-xs p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {options.length < 10 && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs text-indigo-400 hover:text-indigo-300 text-left py-1 font-medium"
                    >
                      + Add Option
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-neutral-700 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
                    <input
                      type="checkbox"
                      checked={isQuiz}
                      onChange={(e) => setIsQuiz(e.target.checked)}
                      className="accent-indigo-500 rounded"
                    />
                    <span>Make this a graded quiz (select correct answer)</span>
                  </label>
                  {!isQuiz && (
                    <label className="flex items-center gap-2 cursor-pointer text-neutral-300">
                      <input
                        type="checkbox"
                        checked={allowMultiple}
                        onChange={(e) => setAllowMultiple(e.target.checked)}
                        className="accent-indigo-500 rounded"
                      />
                      <span>Allow multiple answers</span>
                    </label>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-bold text-sm rounded-xl text-white shadow-md transition mt-1"
                >
                  Publish Poll
                </button>
              </form>
            )}
          </div>
        )}

        {/* List of active and past polls */}
        {polls.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-500">
            <span className="text-4xl mb-2">🗳️</span>
            <p className="text-sm font-medium">No polls launched yet</p>
            <p className="text-xs mt-1">
              Polls and quizzes will appear here live during the meeting.
            </p>
          </div>
        ) : (
          polls.map((poll) => {
            const userVotes = poll.votes?.[selfId] ?? [];
            const hasVoted = userVotes.length > 0;
            const totalVoters = Object.keys(poll.votes || {}).length;

            return (
              <div
                key={poll.id}
                className={`p-4 rounded-2xl border flex flex-col gap-3 transition ${
                  poll.closed
                    ? 'bg-neutral-900/90 border-neutral-800'
                    : 'bg-neutral-800/60 border-neutral-700 shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-sm">
                        {poll.question}
                      </h4>
                      {poll.isQuiz && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                          Quiz
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-neutral-400">
                      by {poll.creatorName} • {totalVoters}{' '}
                      {totalVoters === 1 ? 'vote' : 'votes'}
                      {poll.closed && ' • Closed'}
                    </span>
                  </div>

                  {isHost && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => exportPollCsv(poll)}
                        className="text-xs text-neutral-400 hover:text-white p-1"
                        title="Export CSV"
                      >
                        📥
                      </button>
                      {!poll.closed ? (
                        <button
                          onClick={() => onClosePoll(poll.id)}
                          className="text-xs text-amber-400 hover:text-amber-300 px-2 py-0.5 rounded bg-amber-500/10"
                        >
                          Close
                        </button>
                      ) : (
                        <button
                          onClick={() => onDeletePoll(poll.id)}
                          className="text-xs text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded bg-rose-500/10"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Options / Live Results */}
                <div className="flex flex-col gap-2">
                  {poll.options.map((opt, optIdx) => {
                    let voteCount = 0;
                    Object.values(poll.votes || {}).forEach((selected) => {
                      if (selected.includes(optIdx)) voteCount++;
                    });
                    const percentage =
                      totalVoters > 0
                        ? Math.round((voteCount / totalVoters) * 100)
                        : 0;
                    const isUserChoice = userVotes.includes(optIdx);
                    const isCorrectAnswer =
                      poll.isQuiz && poll.correctOptionIndex === optIdx;

                    return (
                      <div key={optIdx} className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={poll.closed}
                          onClick={() => {
                            if (poll.allowMultiple) {
                              const next = isUserChoice
                                ? userVotes.filter((i) => i !== optIdx)
                                : [...userVotes, optIdx];
                              if (next.length > 0) onVotePoll(poll.id, next);
                            } else {
                              onVotePoll(poll.id, [optIdx]);
                            }
                          }}
                          className={`relative w-full text-left p-2.5 rounded-xl border text-sm transition overflow-hidden ${
                            isUserChoice
                              ? 'border-indigo-500 bg-indigo-950/40 text-white font-medium'
                              : 'border-neutral-700 bg-neutral-800/80 hover:border-neutral-600 text-neutral-200'
                          } ${poll.closed ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          {/* Progress fill bar */}
                          {(hasVoted || poll.closed) && (
                            <div
                              className={`absolute inset-y-0 left-0 transition-all duration-500 opacity-20 ${
                                isCorrectAnswer && poll.closed
                                  ? 'bg-emerald-500'
                                  : 'bg-indigo-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          )}

                          <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                                  isUserChoice
                                    ? 'bg-indigo-600 border-indigo-400 text-white'
                                    : 'border-neutral-500'
                                }`}
                              >
                                {isUserChoice ? '✓' : ''}
                              </span>
                              <span>{opt}</span>
                              {poll.closed && isCorrectAnswer && (
                                <span className="text-[10px] font-bold text-emerald-400 ml-1">
                                  (Correct)
                                </span>
                              )}
                            </div>
                            {(hasVoted || poll.closed) && (
                              <span className="text-xs font-mono text-neutral-400">
                                {percentage}% ({voteCount})
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
