import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, Video } from 'lucide-react';

interface AsyncReply {
  id: string;
  authorName: string;
  text: string;
  reaction?: string;
  transcriptTimestampMs: number;
  createdAt: number;
}

interface AsyncMessage {
  id: string;
  title: string;
  authorName: string;
  mediaUrl: string;
  durationSeconds: number;
  replies: AsyncReply[];
  createdAt: number;
}

export function AsyncMeetingsPanel({
  authorName,
  onToast,
}: {
  authorName: string;
  onToast: (msg: string) => void;
}) {
  const [messages, setMessages] = useState<AsyncMessage[]>([]);
  const [title, setTitle] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTextById, setReplyTextById] = useState<Record<string, string>>(
    {},
  );

  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const loadMessages = async () => {
    try {
      const res = await fetch(`${baseUrl}/async-meetings`);
      if (res.ok) {
        const data = (await res.json()) as { messages?: AsyncMessage[] };
        setMessages(data.messages ?? []);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    void loadMessages();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`${baseUrl}/async-meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          authorName,
          mediaUrl: 'local://async-clip',
          durationSeconds: 30,
        }),
      });
      if (res.ok) {
        setTitle('');
        onToast('Async video update posted.');
        await loadMessages();
      }
    } catch {
      onToast('Failed to post async update.');
    } finally {
      setPosting(false);
    }
  };

  const handleReply = async (messageId: string, reaction?: string) => {
    const text = (replyTextById[messageId] ?? '').trim();
    if (!text && !reaction) return;
    try {
      const res = await fetch(
        `${baseUrl}/async-meetings/${encodeURIComponent(messageId)}/replies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorName,
            text,
            ...(reaction ? { reaction } : {}),
            transcriptTimestampMs: 0,
          }),
        },
      );
      if (res.ok) {
        setReplyTextById((prev) => ({ ...prev, [messageId]: '' }));
        await loadMessages();
      }
    } catch {
      onToast('Failed to post reply.');
    }
  };

  return (
    <div
      className="card"
      style={{
        marginTop: 20,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Video size={18} style={{ color: 'var(--accent)' }} />
        <div>
          <h3 style={{ margin: 0, fontSize: '1.02rem' }}>
            Async-First Video Updates
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Share short async updates and let teammates reply with comments or
            reactions pinned to transcript moments.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title your async update (e.g. Sprint Demo Walkthrough)…"
          style={{
            flex: 1,
            minWidth: 220,
            padding: '7px 10px',
            borderRadius: 6,
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            color: 'var(--ink)',
            fontSize: '0.84rem',
          }}
        />
        <button
          type="submit"
          className="btn primary sm"
          disabled={posting || !title.trim()}
        >
          {posting ? 'Posting…' : 'Post Async Update'}
        </button>
      </form>

      {messages.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
          No async updates yet. Post one above to start an async thread.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                padding: 12,
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                display: 'grid',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.84rem',
                }}
              >
                <strong>{m.title}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {m.authorName} · {m.durationSeconds}s
                </span>
              </div>

              {m.replies.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gap: 4,
                    paddingLeft: 10,
                    borderLeft: '2px solid var(--line)',
                  }}
                >
                  {m.replies.map((r) => (
                    <div key={r.id} style={{ fontSize: '0.78rem' }}>
                      <strong>{r.authorName}</strong>{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        [{Math.round(r.transcriptTimestampMs / 1000)}s]
                      </span>
                      : {r.reaction ? `${r.reaction} ` : ''}
                      {r.text}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <MessageSquare size={14} style={{ color: 'var(--muted)' }} />
                <input
                  value={replyTextById[m.id] ?? ''}
                  onChange={(e) =>
                    setReplyTextById((prev) => ({
                      ...prev,
                      [m.id]: e.target.value,
                    }))
                  }
                  placeholder="Reply pinned to transcript…"
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: '0.78rem',
                  }}
                />
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => void handleReply(m.id, '👍')}
                  title="React 👍"
                >
                  👍
                </button>
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => void handleReply(m.id)}
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
