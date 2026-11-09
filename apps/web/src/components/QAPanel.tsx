import React, { useState } from 'react';
import type { QaItem } from '@meetit/protocol';

interface QAPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  selfId: string;
  questions: QaItem[];
  onAskQuestion: (question: string) => void;
  onUpvoteQuestion: (questionId: string) => void;
  onAnswerQuestion: (questionId: string, answered: boolean) => void;
  onDismissQuestion: (questionId: string, dismissed: boolean) => void;
  onDeleteQuestion: (questionId: string) => void;
}

export function QAPanel({
  isOpen,
  onClose,
  isHost,
  selfId,
  questions,
  onAskQuestion,
  onUpvoteQuestion,
  onAnswerQuestion,
  onDismissQuestion,
  onDeleteQuestion,
}: QAPanelProps) {
  if (!isOpen) return null;

  const [questionDraft, setQuestionDraft] = useState('');
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'answered'>(
    'all',
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionDraft.trim()) return;
    onAskQuestion(questionDraft.trim());
    setQuestionDraft('');
  };

  const filteredQuestions = questions
    .filter((q) => {
      if (filter === 'unanswered') return !q.answered && !q.dismissed;
      if (filter === 'answered') return q.answered;
      return true;
    })
    .sort((a, b) => (b.upvotes?.length || 0) - (a.upvotes?.length || 0));

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col text-neutral-100"
      role="region"
      aria-label="Q&A Panel"
    >
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="font-bold text-white">Q&A</h3>
          <span className="text-xs bg-neutral-800 px-2 py-0.5 rounded-full text-neutral-400 font-mono">
            {questions.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-2 bg-neutral-950 border-b border-neutral-800 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1.5 rounded-lg font-medium transition ${
            filter === 'all'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          All ({questions.length})
        </button>
        <button
          onClick={() => setFilter('unanswered')}
          className={`flex-1 py-1.5 rounded-lg font-medium transition ${
            filter === 'unanswered'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Open ({questions.filter((q) => !q.answered && !q.dismissed).length})
        </button>
        <button
          onClick={() => setFilter('answered')}
          className={`flex-1 py-1.5 rounded-lg font-medium transition ${
            filter === 'answered'
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Answered ({questions.filter((q) => q.answered).length})
        </button>
      </div>

      {/* Questions list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {filteredQuestions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-500">
            <span className="text-4xl mb-2">🙋</span>
            <p className="text-sm font-medium">No questions yet</p>
            <p className="text-xs mt-1">
              Ask a question to start the conversation.
            </p>
          </div>
        ) : (
          filteredQuestions.map((item) => {
            const hasUpvoted = item.upvotes?.includes(selfId);
            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl border flex flex-col gap-2 transition ${
                  item.answered
                    ? 'bg-neutral-900/80 border-emerald-500/20'
                    : item.dismissed
                      ? 'bg-neutral-950/60 border-neutral-800 opacity-60'
                      : 'bg-neutral-800/60 border-neutral-700 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-neutral-100 font-medium leading-snug">
                      {item.question}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-neutral-400">
                      <span>{item.displayName}</span>
                      <span>•</span>
                      <span>
                        {new Date(item.ts).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {item.answered && (
                        <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.2 rounded text-[10px]">
                          ✓ Answered
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Upvote button */}
                  <button
                    onClick={() => onUpvoteQuestion(item.id)}
                    className={`flex flex-col items-center justify-center px-2 py-1.5 rounded-xl border transition ${
                      hasUpvoted
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 font-bold'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-600'
                    }`}
                    title={hasUpvoted ? 'Remove upvote' : 'Upvote question'}
                  >
                    <span className="text-xs">▲</span>
                    <span className="text-xs font-mono">
                      {item.upvotes?.length || 0}
                    </span>
                  </button>
                </div>

                {/* Host controls */}
                {isHost && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-700/60 text-xs">
                    <button
                      onClick={() => onAnswerQuestion(item.id, !item.answered)}
                      className={`px-2 py-1 rounded transition ${
                        item.answered
                          ? 'text-neutral-400 hover:text-white'
                          : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40'
                      }`}
                    >
                      {item.answered ? 'Mark Unanswered' : 'Mark Answered'}
                    </button>
                    <button
                      onClick={() =>
                        onDismissQuestion(item.id, !item.dismissed)
                      }
                      className="px-2 py-1 rounded text-neutral-400 hover:text-neutral-200"
                    >
                      {item.dismissed ? 'Restore' : 'Dismiss'}
                    </button>
                    <button
                      onClick={() => onDeleteQuestion(item.id)}
                      className="px-1.5 py-1 text-rose-400 hover:text-rose-300"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Ask Question Input */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-neutral-800 bg-neutral-950 flex gap-2"
      >
        <input
          type="text"
          placeholder="Ask a question..."
          value={questionDraft}
          onChange={(e) => setQuestionDraft(e.target.value)}
          className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={!questionDraft.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold text-sm rounded-xl text-white transition"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
