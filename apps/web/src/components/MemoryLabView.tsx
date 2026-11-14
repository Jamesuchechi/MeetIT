import React, { useMemo, useState } from 'react';
import { Brain, Search, Sparkles } from 'lucide-react';

interface MemoryLabViewProps {
  userId?: string | null | undefined;
  onToast: (msg: string) => void;
}

interface MemoryMatch {
  id: string;
  meetingTitle: string;
  kind: string;
  summary: string;
}

const QUICK_PROMPTS = [
  'decisions',
  'action items',
  'pricing',
  'launch timeline',
];

export function MemoryLabView({ userId, onToast }: MemoryLabViewProps) {
  const [memoryQuery, setMemoryQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<
    'all' | 'decision' | 'action' | 'fact'
  >('all');
  const [memoryResults, setMemoryResults] = useState<MemoryMatch[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingMemory, setLoadingMemory] = useState(false);

  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const runSearch = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed) return;
    setLoadingMemory(true);
    setHasSearched(true);
    try {
      const res = await fetch(
        `${baseUrl}/memory/query?q=${encodeURIComponent(trimmed)}&requesterId=${encodeURIComponent(userId ?? 'self')}`,
      );
      const data = (await res.json()) as { matches?: MemoryMatch[] };
      setMemoryResults(data.matches ?? []);
    } catch {
      onToast('Failed to query meeting memory.');
    } finally {
      setLoadingMemory(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (kindFilter === 'all') return memoryResults;
    return memoryResults.filter((m) =>
      m.kind.toLowerCase().includes(kindFilter),
    );
  }, [memoryResults, kindFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'var(--soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <Brain size={19} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
              Cross-Meeting Memory
            </h3>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '0.82rem',
                color: 'var(--muted)',
              }}
            >
              Search decisions, action items, and key facts indexed across your
              meetings.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={memoryQuery}
            onChange={(e) => setMemoryQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch(memoryQuery);
            }}
            placeholder="Ask across meetings (e.g. pricing tier, Stripe, launch date)…"
            style={{
              flex: 1,
              minWidth: 240,
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              fontSize: '0.88rem',
            }}
          />
          <button
            type="button"
            className="btn primary sm"
            onClick={() => void runSearch(memoryQuery)}
            disabled={loadingMemory || !memoryQuery.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={14} />
            <span>{loadingMemory ? 'Searching…' : 'Search'}</span>
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Try:
            </span>
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="btn secondary sm"
                onClick={() => {
                  setMemoryQuery(prompt);
                  void runSearch(prompt);
                }}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All'],
                ['decision', 'Decisions'],
                ['action', 'Action Items'],
                ['fact', 'Facts'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn sm ${kindFilter === id ? 'primary' : 'secondary'}`}
                onClick={() => setKindFilter(id)}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 10,
            background: 'var(--bg)',
            padding: 16,
            minHeight: 160,
          }}
        >
          {loadingMemory ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 12px',
                color: 'var(--muted)',
                fontSize: '0.86rem',
              }}
            >
              Searching indexed meetings…
            </div>
          ) : filteredResults.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '28px 12px',
                color: 'var(--muted)',
              }}
            >
              <Sparkles
                size={20}
                style={{ color: 'var(--accent)', marginBottom: 8 }}
              />
              <div
                style={{
                  fontWeight: 600,
                  color: 'var(--ink)',
                  fontSize: '0.9rem',
                  marginBottom: 4,
                }}
              >
                {hasSearched
                  ? 'No matching decisions or action items found'
                  : 'Search your meeting knowledge base'}
              </div>
              <div
                style={{ fontSize: '0.8rem', maxWidth: 460, margin: '0 auto' }}
              >
                {hasSearched
                  ? 'Try a broader keyword or switch the category filter above.'
                  : 'Meetings with saved notes, transcripts, or generated specs are automatically indexed here for cross-meeting recall.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {filteredResults.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '0.75rem',
                      color: 'var(--muted)',
                    }}
                  >
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'var(--soft)',
                        color: 'var(--accent)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        fontSize: '0.68rem',
                      }}
                    >
                      {m.kind}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {m.meetingTitle}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--ink)' }}>
                    {m.summary}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
