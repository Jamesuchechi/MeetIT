import React, { useState } from 'react';
import type { WebinarQaItem } from '@meetit/protocol';
import {
  MessageSquare,
  ChevronUp,
  Check,
  X,
  Send,
  CheckCircle2,
} from 'lucide-react';

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

  const filteredQuestions = questions
    .filter((q) => {
      if (filter === 'all') return true;
      return q.status === filter;
    })
    .sort((a, b) => b.upvotes.length - a.upvotes.length);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface)',
        color: 'var(--ink)',
      }}
    >
      {/* Header with filter tabs */}
      <div
        style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
              Audience Q&amp;A
            </strong>
          </div>

          {isHostOrModerator && (
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'var(--bg)',
                padding: '2px',
                borderRadius: '6px',
              }}
            >
              {(['all', 'pending', 'approved', 'answered'] as const).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilter(t)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      border: 'none',
                      cursor: 'pointer',
                      background:
                        filter === t ? 'var(--surface)' : 'transparent',
                      color: filter === t ? 'var(--ink)' : 'var(--muted)',
                    }}
                  >
                    {t}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '11.5px',
            color: 'var(--muted)',
          }}
        >
          {isHostOrModerator
            ? 'Moderate audience questions, approve for broadcast, and reply live.'
            : 'Submit questions and upvote questions you want answered.'}
        </p>
      </div>

      {/* Ask Input Bar */}
      <form
        onSubmit={handleAskSubmit}
        style={{
          display: 'flex',
          gap: '8px',
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg)',
        }}
      >
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Ask a question to speakers..."
          className="panel-input"
          style={{ flex: 1, padding: '7px 10px', fontSize: '12.5px' }}
        />
        <button
          type="submit"
          disabled={!newQuestion.trim()}
          className="panel-btn-primary"
          style={{ padding: '7px 12px', fontSize: '12.5px' }}
        >
          <Send size={13} /> Ask
        </button>
      </form>

      {/* Questions Stream */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {filteredQuestions.length === 0 ? (
          <div className="panel-empty-state">
            <MessageSquare className="panel-empty-icon" />
            <strong className="panel-empty-text">
              No questions in this queue
            </strong>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Be the first to submit a question!
            </span>
          </div>
        ) : (
          filteredQuestions.map((q) => (
            <div
              key={q.id}
              className="panel-card"
              style={{ gap: '8px', padding: '12px' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <strong style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                    {q.authorName}
                  </strong>
                  <span
                    style={{
                      fontSize: '10.5px',
                      color: 'var(--muted)',
                      marginLeft: '8px',
                    }}
                  >
                    {new Date(q.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span
                    className={`panel-badge ${
                      q.status === 'answered'
                        ? 'active'
                        : q.status === 'approved'
                          ? 'active'
                          : 'muted'
                    }`}
                    style={{ fontSize: '10px' }}
                  >
                    {q.status}
                  </span>

                  <button
                    type="button"
                    onClick={() => onUpvoteQuestion(q.id)}
                    className="panel-btn-secondary"
                    style={{ padding: '2px 6px', fontSize: '11px', gap: '3px' }}
                  >
                    <ChevronUp size={12} />
                    <span>{q.upvotes.length}</span>
                  </button>
                </div>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: 'var(--ink)',
                  lineHeight: 1.45,
                }}
              >
                {q.question}
              </p>

              {/* Answer display */}
              {q.answer && (
                <div
                  style={{
                    marginTop: '4px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    fontSize: '12px',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: '#22c55e',
                      fontSize: '11px',
                      marginBottom: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <CheckCircle2 size={12} /> Answered by{' '}
                    {q.answeredBy || 'Speaker'}:
                  </div>
                  <div style={{ color: 'var(--ink)' }}>{q.answer}</div>
                </div>
              )}

              {/* Moderator Action Buttons */}
              {isHostOrModerator && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    paddingTop: '6px',
                    borderTop: '1px solid var(--line)',
                    marginTop: '4px',
                  }}
                >
                  {q.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => onModerateQuestion(q.id, 'approved')}
                      className="panel-btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      <Check size={12} /> Approve
                    </button>
                  )}
                  {q.status !== 'answered' && (
                    <button
                      type="button"
                      onClick={() =>
                        setReplyingId(replyingId === q.id ? null : q.id)
                      }
                      className="panel-btn-primary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      {replyingId === q.id ? 'Cancel' : 'Answer'}
                    </button>
                  )}
                  {q.status !== 'dismissed' && (
                    <button
                      type="button"
                      onClick={() => onModerateQuestion(q.id, 'dismissed')}
                      className="panel-btn-danger"
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        marginLeft: 'auto',
                      }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}

              {/* Reply Input Box */}
              {replyingId === q.id && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type official answer..."
                    className="panel-input"
                    style={{ flex: 1, padding: '5px 8px', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAnswerSubmit(q.id)}
                    className="panel-btn-primary"
                    style={{ padding: '5px 10px', fontSize: '11.5px' }}
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
