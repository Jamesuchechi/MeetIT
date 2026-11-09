import React, { useState } from 'react';
import type { PollItem } from '@meetit/protocol';
import {
  BarChart3,
  Vote,
  Plus,
  X,
  Download,
  Check,
  FileText,
  Trash2,
  Lock,
} from 'lucide-react';

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
    <aside
      className="app-side-panel"
      role="region"
      aria-label="Polls and Quizzes Panel"
      data-testid="polls-panel-container"
    >
      <div className="app-side-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className="app-modal-icon"
            style={{ width: '28px', height: '28px', borderRadius: '6px' }}
          >
            <BarChart3 size={16} />
          </div>
          <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>
            Polls &amp; Quizzes
          </strong>
          <span className="panel-badge muted" style={{ fontSize: '11px' }}>
            {polls.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onOpenFormItSurvey && (
            <button
              type="button"
              onClick={onOpenFormItSurvey}
              className="panel-btn-secondary"
              style={{ padding: '4px 8px', fontSize: '11.5px' }}
              title="Launch FormIT survey"
            >
              <FileText size={12} />
              FormIT
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="app-modal-close"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="app-side-panel-body">
        {/* Creation form toggle for hosts */}
        {isHost && (
          <div>
            {!isCreating ? (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="panel-btn-primary"
                style={{ width: '100%' }}
                data-testid="create-poll-btn"
              >
                <Plus size={16} />
                Create New Poll / Quiz
              </button>
            ) : (
              <form
                onSubmit={handleCreateSubmit}
                className="panel-card"
                style={{ gap: '12px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--muted)',
                    }}
                  >
                    New Poll
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="app-modal-close"
                    style={{ fontSize: '12px', padding: '2px 6px' }}
                  >
                    Cancel
                  </button>
                </div>

                <div className="panel-form-group">
                  <label htmlFor="poll-question-input">Question</label>
                  <input
                    id="poll-question-input"
                    type="text"
                    required
                    placeholder="e.g. Which design approach do you prefer?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="panel-input"
                  />
                </div>

                <div className="panel-form-group">
                  <label>Options</label>
                  {options.map((opt, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {isQuiz && (
                        <input
                          type="radio"
                          name="correctOption"
                          checked={correctOption === idx}
                          onChange={() => setCorrectOption(idx)}
                          title="Mark as correct answer"
                          style={{ cursor: 'pointer' }}
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
                        className="panel-input"
                        style={{ flex: 1 }}
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="app-modal-close"
                          title="Remove option"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {options.length < 10 && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '4px 0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Plus size={14} /> Add Option
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--line)',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12.5px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isQuiz}
                      onChange={(e) => setIsQuiz(e.target.checked)}
                    />
                    <span>Make this a graded quiz (select correct answer)</span>
                  </label>
                  {!isQuiz && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={allowMultiple}
                        onChange={(e) => setAllowMultiple(e.target.checked)}
                      />
                      <span>Allow multiple answers</span>
                    </label>
                  )}
                </div>

                <button
                  type="submit"
                  className="panel-btn-primary"
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  Publish Poll
                </button>
              </form>
            )}
          </div>
        )}

        {/* List of active and past polls */}
        {polls.length === 0 ? (
          <div className="panel-empty-state">
            <Vote className="panel-empty-icon" />
            <strong className="panel-empty-text">No polls launched yet</strong>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Polls and quizzes will appear here live during the meeting.
            </span>
          </div>
        ) : (
          polls.map((poll) => {
            const userVotes = poll.votes?.[selfId] ?? [];
            const hasVoted = userVotes.length > 0;
            const totalVoters = Object.keys(poll.votes || {}).length;

            return (
              <div key={poll.id} className="panel-card" style={{ gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                        {poll.question}
                      </strong>
                      {poll.isQuiz && (
                        <span
                          className="panel-badge muted"
                          style={{ fontSize: '10px' }}
                        >
                          Quiz
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--muted)',
                        display: 'block',
                        marginTop: '2px',
                      }}
                    >
                      by {poll.creatorName} · {totalVoters}{' '}
                      {totalVoters === 1 ? 'vote' : 'votes'}
                      {poll.closed && ' · Closed'}
                    </span>
                  </div>

                  {isHost && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => exportPollCsv(poll)}
                        className="app-modal-close"
                        title="Export CSV"
                      >
                        <Download size={14} />
                      </button>
                      {!poll.closed ? (
                        <button
                          type="button"
                          onClick={() => onClosePoll(poll.id)}
                          className="panel-btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          title="Close poll"
                        >
                          <Lock size={12} /> Close
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDeletePoll(poll.id)}
                          className="panel-btn-danger"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          title="Delete poll"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Options / Live Results */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
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
                      <button
                        key={optIdx}
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
                        style={{
                          position: 'relative',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${isUserChoice ? 'var(--accent)' : 'var(--line)'}`,
                          background: isUserChoice
                            ? 'var(--soft)'
                            : 'var(--surface)',
                          cursor: poll.closed ? 'default' : 'pointer',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          fontFamily: 'inherit',
                          fontSize: '13px',
                          color: 'var(--ink)',
                        }}
                      >
                        {/* Progress fill bar */}
                        {(hasVoted || poll.closed) && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: 0,
                              width: `${percentage}%`,
                              background:
                                isCorrectAnswer && poll.closed
                                  ? 'rgba(34, 197, 94, 0.2)'
                                  : 'rgba(36, 87, 255, 0.15)',
                              zIndex: 0,
                              transition: 'width 0.4s ease',
                            }}
                          />
                        )}

                        <div
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              border: `1px solid ${isUserChoice ? 'var(--accent)' : 'var(--muted)'}`,
                              background: isUserChoice
                                ? 'var(--accent)'
                                : 'transparent',
                              color: 'var(--on-accent)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                            }}
                          >
                            {isUserChoice ? <Check size={10} /> : null}
                          </span>
                          <span
                            style={{ fontWeight: isUserChoice ? 600 : 400 }}
                          >
                            {opt}
                          </span>
                          {poll.closed && isCorrectAnswer && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#22c55e',
                              }}
                            >
                              (Correct)
                            </span>
                          )}
                        </div>

                        {(hasVoted || poll.closed) && (
                          <span
                            style={{
                              position: 'relative',
                              zIndex: 1,
                              fontSize: '12px',
                              color: 'var(--muted)',
                              fontFamily: 'monospace',
                            }}
                          >
                            {percentage}% ({voteCount})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
