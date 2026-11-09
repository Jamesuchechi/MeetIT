import React, { useState } from 'react';
import type { WebinarQaItem } from '@meetit/protocol';

interface WebinarQaPanelProps {
  questions: WebinarQaItem[];
  isHostOrModerator: boolean;
  onAskQuestion: (question: string) => void;
  onUpvoteQuestion: (questionId: string) => void;
  onModerateQuestion: (
    questionId: string,
    status: 'pending' | 'approved' | 'dismissed' | 'answered',
    answer?: string,
  ) => void;
}

export const WebinarQaPanel: React.FC<WebinarQaPanelProps> = ({
  questions,
  isHostOrModerator,
  onAskQuestion,
  onUpvoteQuestion,
  onModerateQuestion,
}) => {
  const [newQuestion, setNewQuestion] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'pending' | 'approved' | 'answered'
  >('all');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    onAskQuestion(newQuestion.trim());
    setNewQuestion('');
  };

  const handleAnswerSubmit = (questionId: string) => {
    if (!replyText.trim()) return;
    onModerateQuestion(questionId, 'answered', replyText.trim());
    setReplyingId(null);
    setReplyText('');
  };

  const filteredQuestions = questions.filter((q) => {
    if (filter === 'all') return true;
    return q.status === filter;
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-100">
      {/* Header with filter tabs */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <span>💬</span> Audience Q&A
          </h3>
          <p className="text-xs text-slate-400">
            {isHostOrModerator
              ? 'Moderate audience questions, approve for broadcast, and reply live.'
              : 'Submit questions and upvote questions you want answered.'}
          </p>
        </div>

        {isHostOrModerator && (
          <div className="flex gap-1 text-[11px] bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            {(['all', 'pending', 'approved', 'answered'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-2 py-1 rounded font-medium capitalize ${
                  filter === t
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ask Input Bar */}
      <form
        onSubmit={handleAskSubmit}
        className="p-3 bg-slate-850 border-b border-slate-800 flex gap-2"
      >
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Ask a question to speakers..."
          className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20"
        >
          Ask
        </button>
      </form>

      {/* Questions Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            No questions in this queue yet. Be the first to ask!
          </div>
        ) : (
          filteredQuestions.map((q) => (
            <div
              key={q.id}
              className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-750 flex flex-col gap-2 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-300">
                    {q.authorName}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-2">
                    {new Date(q.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                      q.status === 'answered'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : q.status === 'approved'
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : q.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {q.status}
                  </span>

                  <button
                    onClick={() => onUpvoteQuestion(q.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold"
                  >
                    <span>▲</span>
                    <span>{q.upvotes.length}</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed font-normal">
                {q.question}
              </p>

              {/* Answer display */}
              {q.answer && (
                <div className="mt-1 p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-900/50 text-xs">
                  <div className="font-semibold text-indigo-400 text-[11px] mb-0.5">
                    Answered by {q.answeredBy || 'Speaker'}:
                  </div>
                  <div className="text-slate-300">{q.answer}</div>
                </div>
              )}

              {/* Moderator Action Buttons */}
              {isHostOrModerator && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-750 mt-1">
                  {q.status === 'pending' && (
                    <button
                      onClick={() => onModerateQuestion(q.id, 'approved')}
                      className="text-[11px] px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-medium"
                    >
                      Approve
                    </button>
                  )}
                  {q.status !== 'answered' && (
                    <button
                      onClick={() =>
                        setReplyingId(replyingId === q.id ? null : q.id)
                      }
                      className="text-[11px] px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 font-medium"
                    >
                      {replyingId === q.id ? 'Cancel Reply' : 'Answer Question'}
                    </button>
                  )}
                  {q.status !== 'dismissed' && (
                    <button
                      onClick={() => onModerateQuestion(q.id, 'dismissed')}
                      className="text-[11px] px-2.5 py-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 font-medium ml-auto"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}

              {/* Reply Input Box */}
              {replyingId === q.id && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type official answer..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => handleAnswerSubmit(q.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                  >
                    Post Answer
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
