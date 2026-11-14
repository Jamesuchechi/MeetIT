import React, { useMemo, useState } from 'react';
import {
  FileText,
  Layers,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  deleteSlideDeck,
  loadSavedDecks,
  saveSlideDeck,
  type SavedSlideDeck,
} from '../lib/slidesStore';
import { generateRoomCode } from '../types';

interface SlidesViewProps {
  onEnterRoom: (code: string) => void;
  onToast: (msg: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function SlidesView({ onEnterRoom, onToast }: SlidesViewProps) {
  const [decks, setDecks] = useState<SavedSlideDeck[]>(() => loadSavedDecks());
  const [searchQuery, setSearchQuery] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [previewDeck, setPreviewDeck] = useState<SavedSlideDeck | null>(null);
  const [previewPage, setPreviewPage] = useState(1);

  const filteredDecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return decks;
    return decks.filter((d) => d.title.toLowerCase().includes(q));
  }, [decks, searchQuery]);

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    try {
      const first = files[0]!;
      const isPdf =
        first.type === 'application/pdf' ||
        first.name.toLowerCase().endsWith('.pdf');
      const title =
        customTitle.trim() ||
        first.name.replace(/\.[^.]+$/, '') ||
        'Untitled Deck';

      if (isPdf) {
        const dataUrl = await readFileAsDataUrl(first);
        const saved = saveSlideDeck({
          title,
          kind: 'pdf',
          pageCount: 10,
          pages: [dataUrl],
        });
        setDecks((prev) => [saved, ...prev]);
        setCustomTitle('');
        onToast(`Saved PDF deck "${saved.title}".`);
      } else {
        const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
        const saved = saveSlideDeck({
          title,
          kind: 'images',
          pageCount: dataUrls.length,
          pages: dataUrls,
        });
        setDecks((prev) => [saved, ...prev]);
        setCustomTitle('');
        onToast(`Saved ${dataUrls.length}-slide deck "${saved.title}".`);
      }
    } catch {
      onToast('Failed to read selected slide file(s).');
    } finally {
      e.target.value = '';
    }
  };

  const handleDelete = (id: string, title: string) => {
    const next = deleteSlideDeck(id);
    setDecks(next);
    if (previewDeck?.id === id) setPreviewDeck(null);
    onToast(`Removed "${title}".`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Upload & Library Header */}
      <div className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
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
              }}
            >
              <Layers size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                Slides &amp; Presentations
              </h3>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--muted)',
                }}
              >
                Upload PDFs or slide images once, then present them with instant
                low-bandwidth page sync in any meeting room.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Optional deck title (e.g. Q4 Product Roadmap)…"
            style={{
              flex: 1,
              minWidth: 220,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              fontSize: '0.85rem',
            }}
          />
          <label
            className="btn primary sm"
            style={{
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Upload size={14} />
            <span>Upload PDF or Slides</span>
            <input
              type="file"
              accept=".pdf,image/*"
              multiple
              onChange={(e) => void handleUploadFiles(e)}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* Saved Decks List */}
      <div className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <strong style={{ fontSize: '0.95rem' }}>
            Your Slide Decks ({filteredDecks.length})
          </strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={14} style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter decks…"
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '0.82rem',
              }}
            />
          </div>
        </div>

        {filteredDecks.length === 0 ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              borderRadius: 10,
              border: '1px dashed var(--line)',
              color: 'var(--muted)',
              fontSize: '0.85rem',
            }}
          >
            <Plus
              size={20}
              style={{ color: 'var(--accent)', marginBottom: 6 }}
            />
            <div
              style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}
            >
              No slide decks saved yet
            </div>
            <div>
              Upload a PDF or slide images above — they will appear here and
              inside every meeting room when you click &ldquo;Present
              Slides&rdquo;.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {filteredDecks.map((deck) => (
              <div
                key={deck.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: 120,
                    background: 'var(--soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {deck.kind === 'images' && deck.pages[0] ? (
                    <img
                      src={deck.pages[0]}
                      alt={deck.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <FileText size={32} style={{ color: 'var(--accent)' }} />
                  )}
                </div>

                <div style={{ padding: 12, display: 'grid', gap: 8, flex: 1 }}>
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {deck.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted)',
                        marginTop: 2,
                      }}
                    >
                      {deck.kind.toUpperCase()} · {deck.pageCount} pages ·{' '}
                      {new Date(deck.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginTop: 'auto',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => {
                        setPreviewDeck(deck);
                        setPreviewPage(1);
                      }}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="btn primary sm"
                      onClick={() => onEnterRoom(generateRoomCode())}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Play size={12} />
                      Start Room
                    </button>
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => handleDelete(deck.id, deck.title)}
                      title="Delete deck"
                      style={{ marginLeft: 'auto', color: '#ef4444' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Deck Preview */}
      {previewDeck && (
        <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <strong>Preview: {previewDeck.title}</strong>
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => setPreviewDeck(null)}
            >
              Close Preview
            </button>
          </div>
          <div
            style={{
              minHeight: 260,
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {previewDeck.kind === 'pdf' && previewDeck.pages[0] ? (
              <iframe
                title={previewDeck.title}
                src={`${previewDeck.pages[0]}#page=${previewPage}`}
                style={{ width: '100%', height: 320, border: 'none' }}
              />
            ) : previewDeck.pages[previewPage - 1] ? (
              <img
                src={previewDeck.pages[previewPage - 1]}
                alt={`${previewDeck.title} slide ${previewPage}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: 320,
                  objectFit: 'contain',
                }}
              />
            ) : null}
          </div>
          {previewDeck.kind === 'images' && previewDeck.pages.length > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className="btn secondary sm"
                disabled={previewPage <= 1}
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Slide {previewPage} of {previewDeck.pages.length}
              </span>
              <button
                type="button"
                className="btn secondary sm"
                disabled={previewPage >= previewDeck.pages.length}
                onClick={() =>
                  setPreviewPage((p) =>
                    Math.min(previewDeck.pages.length, p + 1),
                  )
                }
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
