import React, { useState } from 'react';
import type { QaItem } from '@meetit/protocol';
import {
  HelpCircle,
  X,
  ChevronUp,
  Check,
  Trash2,
  RotateCcw,
  Send,
  MessageSquare,
} from 'lucide-react';

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
    <aside
      className="app-side-panel"
      role="region"
      aria-label="Q&A Panel"
      data-testid="qa-panel-container"
    >
      <div className="app-side-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className="app-modal-icon"
            style={{ width: '28px', height: '28px', borderRadius: '6px' }}
          >
            <HelpCircle size={16} />
          </div>
          <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>
            Q&amp;A
          </strong>
          <span className="panel-badge muted" style={{ fontSize: '11px' }}>
            {questions.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="app-modal-close"
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '8px 14px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg)',
        }}
      >
        <button
          type="button"
          onClick={() => setFilter('all')}
          style={{
            flex: 1,
            padding: '5px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background: filter === 'all' ? 'var(--surface)' : 'transparent',
            color: filter === 'all' ? 'var(--ink)' : 'var(--muted)',
            boxShadow: filter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          All ({questions.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unanswered')}
          style={{
            flex: 1,
            padding: '5px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background:
              filter === 'unanswered' ? 'var(--surface)' : 'transparent',
            color: filter === 'unanswered' ? 'var(--ink)' : 'var(--muted)',
            boxShadow:
              filter === 'unanswered' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          Open ({questions.filter((q) => !q.answered && !q.dismissed).length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('answered')}
          style={{
            flex: 1,
            padding: '5px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background:
              filter === 'answered' ? 'var(--surface)' : 'transparent',
            color: filter === 'answered' ? 'var(--ink)' : 'var(--muted)',
            boxShadow:
              filter === 'answered' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          Answered ({questions.filter((q) => q.answered).length})
        </button>
      </div>

      {/* Questions list */}
      <div className="app-side-panel-body">
        {filteredQuestions.length === 0 ? (
          <div className="panel-empty-state">
            <MessageSquare className="panel-empty-icon" />
            <strong className="panel-empty-text">No questions yet</strong>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Ask a question below to start the audience Q&amp;A.
            </span>
          </div>
        ) : (
          filteredQuestions.map((item) => {
            const hasUpvoted = item.upvotes?.includes(selfId);
            return (
              <div
                key={item.id}
                className="panel-card"
                style={{
                  gap: '8px',
                  opacity: item.dismissed ? 0.6 : 1,
                  background: item.answered
                    ? 'rgba(34, 197, 94, 0.05)'
                    : 'var(--surface)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13.5px',
                        fontWeight: 500,
                        color: 'var(--ink)',
                        lineHeight: 1.4,
                      }}
                    >
                      {item.question}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '6px',
                        fontSize: '11.5px',
                        color: 'var(--muted)',
                      }}
                    >
                      <span>{item.displayName}</span>
                      <span>·</span>
                      <span>
                        {new Date(item.ts).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {item.answered && (
                        <span
                          className="panel-badge active"
                          style={{ fontSize: '10px', marginLeft: '4px' }}
                        >
                          <Check size={10} /> Answered
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Upvote button */}
                  <button
                    type="button"
                    onClick={() => onUpvoteQuestion(item.id)}
                    className="panel-btn-secondary"
                    style={{
                      flexDirection: 'column',
                      padding: '4px 8px',
                      gap: '2px',
                      background: hasUpvoted ? 'var(--soft)' : 'var(--surface)',
                      borderColor: hasUpvoted ? 'var(--accent)' : 'var(--line)',
                      color: hasUpvoted ? 'var(--accent)' : 'var(--muted)',
                    }}
                    title={hasUpvoted ? 'Remove upvote' : 'Upvote question'}
                  >
                    <ChevronUp size={14} />
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}
                    >
                      {item.upvotes?.length || 0}
                    </span>
                  </button>
                </div>

                {/* Host controls */}
                {isHost && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '6px',
                      paddingTop: '6px',
                      borderTop: '1px solid var(--line)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onAnswerQuestion(item.id, !item.answered)}
                      className="panel-btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      <Check size={12} />
                      {item.answered ? 'Mark Open' : 'Mark Answered'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onDismissQuestion(item.id, !item.dismissed)
                      }
                      className="panel-btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      <RotateCcw size={12} />
                      {item.dismissed ? 'Restore' : 'Dismiss'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteQuestion(item.id)}
                      className="panel-btn-danger"
                      style={{ padding: '3px 6px' }}
                      title="Delete question"
                    >
                      <Trash2 size={12} />
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
        className="app-side-panel-footer"
        style={{ display: 'flex', gap: '8px' }}
      >
        <input
          type="text"
          placeholder="Ask a question..."
          value={questionDraft}
          onChange={(e) => setQuestionDraft(e.target.value)}
          className="panel-input"
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          disabled={!questionDraft.trim()}
          className="panel-btn-primary"
          style={{ padding: '0 14px' }}
        >
          <Send size={15} />
        </button>
      </form>
    </aside>
  );
}
