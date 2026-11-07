import React, { useState } from 'react';
import { askMeeting } from '../lib/aiService';
import { CloseIcon } from './Icons';

interface AskMeetingModalProps {
  roomTitle: string;
  transcriptText: string;
  onClose: () => void;
  onEnterTimecode?: (timecode: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  provider?: string;
}

export function AskMeetingModal({
  roomTitle,
  transcriptText,
  onClose,
}: AskMeetingModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hello! I am your AI assistant for "${roomTitle}". You can ask me anything about what was discussed, decisions made, or who was assigned what task. I will cite the exact timestamps from the meeting.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: question },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const history = newMessages
        .slice(1, -1)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await askMeeting(
        question,
        transcriptText,
        roomTitle,
        history,
      );

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: res.answer,
          citations: res.citations,
          provider: res.provider,
        },
      ]);
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Sorry, an error occurred while processing your question: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="shortcuts-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-meeting-title"
      data-testid="ask-meeting-modal"
    >
      <div
        className="shortcuts-modal-card"
        style={{
          maxWidth: 640,
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-head">
          <div>
            <span className="eyebrow" style={{ fontSize: 11 }}>
              AI Meeting Intelligence
            </span>
            <h3 id="ask-meeting-title" style={{ margin: '2px 0 0' }}>
              Ask the Meeting
            </h3>
          </div>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Messages Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
          data-testid="ask-meeting-chat"
        >
          {messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={idx}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: isUser
                    ? 'var(--primary, #3b82f6)'
                    : 'var(--surface)',
                  color: isUser ? '#ffffff' : 'var(--ink)',
                  border: isUser ? 'none' : '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  lineHeight: 1.5,
                  fontSize: '0.925rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

                {m.citations && m.citations.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 6,
                      borderTop: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '0.8rem',
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ opacity: 0.8 }}>Citations:</span>
                    {m.citations.map((c, cIdx) => (
                      <span
                        key={cIdx}
                        style={{
                          background: 'rgba(56, 189, 248, 0.2)',
                          color: '#38bdf8',
                          padding: '1px 5px',
                          borderRadius: 4,
                          fontFamily: 'monospace',
                          fontWeight: 600,
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {m.provider && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: '0.725rem',
                      opacity: 0.6,
                      textAlign: 'right',
                    }}
                  >
                    Powered by {m.provider}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '10px 16px',
                fontSize: '0.875rem',
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div className="spinner" style={{ width: 14, height: 14 }} />
              <span>Analyzing transcript...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: 8,
            paddingTop: 12,
            borderTop: '1px solid var(--line)',
          }}
        >
          <input
            type="text"
            placeholder="e.g. What were the key conclusions? What did Bob commit to?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="input"
            style={{ flex: 1, padding: '9px 12px', fontSize: '0.9rem' }}
            data-testid="ask-meeting-input"
          />
          <button
            type="submit"
            className="btn primary"
            disabled={loading || !input.trim()}
            data-testid="ask-meeting-send-btn"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
