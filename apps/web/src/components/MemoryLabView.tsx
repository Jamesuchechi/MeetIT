import React, { useState } from 'react';
import { Brain, Search } from 'lucide-react';
import { Phase13ExperimentalWidgets } from './Phase13ExperimentalWidgets';

interface MemoryLabViewProps {
  userId?: string | null | undefined;
  onToast: (msg: string) => void;
}

export function MemoryLabView({ userId, onToast }: MemoryLabViewProps) {
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResults, setMemoryResults] = useState<
    Array<{ id: string; meetingTitle: string; kind: string; summary: string }>
  >([]);
  const [loadingMemory, setLoadingMemory] = useState(false);

  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const handleSearchMemory = async () => {
    if (!memoryQuery.trim()) return;
    setLoadingMemory(true);
    try {
      const res = await fetch(
        `${baseUrl}/memory/query?q=${encodeURIComponent(memoryQuery)}&requesterId=${encodeURIComponent(userId ?? 'self')}`,
      );
      const data = (await res.json()) as {
        matches?: Array<{
          id: string;
          meetingTitle: string;
          kind: string;
          summary: string;
        }>;
      };
      setMemoryResults(data.matches ?? []);
    } catch {
      onToast('Failed to query memory graph.');
    } finally {
      setLoadingMemory(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Brain size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
              Cross-Meeting Memory Graph
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Query decisions, action items, and facts indexed across your past
              meetings
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={memoryQuery}
            onChange={(e) => setMemoryQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearchMemory();
            }}
            placeholder="Ask across meetings (e.g. pricing tier, Stripe)"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--ink)',
            }}
          />
          <button
            type="button"
            className="btn primary sm"
            onClick={() => void handleSearchMemory()}
            disabled={loadingMemory}
          >
            <Search size={14} />
            <span>{loadingMemory ? 'Searching…' : 'Search'}</span>
          </button>
        </div>

        {memoryResults.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            No matching decisions or action items found yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {memoryResults.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--soft)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  [{m.kind}] {m.meetingTitle}
                </div>
                <div>{m.summary}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <Phase13ExperimentalWidgets roomCode="dashboard-lab" />
      </div>
    </div>
  );
}
