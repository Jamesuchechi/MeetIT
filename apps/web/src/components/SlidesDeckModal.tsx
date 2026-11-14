import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  MonitorUp,
  X,
} from 'lucide-react';
import {
  loadSavedDecks,
  saveSlideDeck,
  type SavedSlideDeck,
} from '../lib/slidesStore';

export interface SyncedSlideState {
  deckTitle: string;
  page: number;
  totalPages: number;
  dataUrl?: string | undefined;
  presenterName?: string | undefined;
}

interface SlidesDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncedSlide: SyncedSlideState | null;
  onBroadcastSlide: (slide: SyncedSlideState) => void;
  onFallbackToScreenShare: () => void;
}

export function SlidesDeckModal({
  isOpen,
  onClose,
  syncedSlide,
  onBroadcastSlide,
  onFallbackToScreenShare,
}: SlidesDeckModalProps) {
  const [savedDecks, setSavedDecks] = useState<SavedSlideDeck[]>([]);
  const [deckTitle, setDeckTitle] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [imagePages, setImagePages] = useState<string[]>([]);
  const [localPage, setLocalPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [followPresenter, setFollowPresenter] = useState(true);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSavedDecks(loadSavedDecks());
    }
  }, [isOpen]);

  useEffect(() => {
    if (followPresenter && syncedSlide) {
      setLocalPage(syncedSlide.page);
      setTotalPages(syncedSlide.totalPages);
    }
  }, [followPresenter, syncedSlide]);

  if (!isOpen) return null;

  const selectSavedDeck = (deck: SavedSlideDeck) => {
    setRenderError(false);
    setDeckTitle(deck.title);
    setLocalPage(1);
    setTotalPages(deck.pageCount);
    if (deck.kind === 'pdf') {
      setPdfUrl(deck.pages[0] ?? null);
      setImagePages([]);
      onBroadcastSlide({
        deckTitle: deck.title,
        page: 1,
        totalPages: deck.pageCount,
      });
    } else {
      setPdfUrl(null);
      setImagePages(deck.pages);
      onBroadcastSlide({
        deckTitle: deck.title,
        page: 1,
        totalPages: deck.pages.length,
        dataUrl: deck.pages[0],
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setRenderError(false);

    const first = files[0]!;
    const readUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

    if (
      first.type === 'application/pdf' ||
      first.name.toLowerCase().endsWith('.pdf')
    ) {
      void readUrl(first)
        .then((url) => {
          const saved = saveSlideDeck({
            title: first.name.replace(/\.[^.]+$/, '') || first.name,
            kind: 'pdf',
            pageCount: 10,
            pages: [url],
          });
          setSavedDecks(loadSavedDecks());
          selectSavedDeck(saved);
        })
        .catch(() => setRenderError(true));
      return;
    }

    void Promise.all(files.map(readUrl))
      .then((urls) => {
        const saved = saveSlideDeck({
          title: first.name.replace(/\.[^.]+$/, '') || 'Slide Deck',
          kind: 'images',
          pageCount: urls.length,
          pages: urls,
        });
        setSavedDecks(loadSavedDecks());
        selectSavedDeck(saved);
      })
      .catch(() => setRenderError(true));
  };

  const goToPage = (nextPage: number, broadcast: boolean) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    setLocalPage(clamped);
    if (broadcast) {
      onBroadcastSlide({
        deckTitle: deckTitle || syncedSlide?.deckTitle || 'Presentation',
        page: clamped,
        totalPages,
        dataUrl: imagePages[clamped - 1],
      });
    }
  };

  const activeImage =
    imagePages[localPage - 1] ??
    (followPresenter ? syncedSlide?.dataUrl : undefined);
  const activeTitle = deckTitle || syncedSlide?.deckTitle || 'Present Slides';

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 700,
          width: '95%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{activeTitle}</h3>
          </div>
          <button
            type="button"
            className="ctrl-btn sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Saved Decks Picker */}
        {savedDecks.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.76rem',
                color: 'var(--muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Layers size={12} /> Your Decks:
            </span>
            {savedDecks.map((deck) => (
              <button
                key={deck.id}
                type="button"
                className={`btn sm ${deckTitle === deck.title ? 'primary' : 'secondary'}`}
                onClick={() => selectSavedDeck(deck)}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                {deck.title} ({deck.pageCount})
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <label className="btn secondary sm" style={{ cursor: 'pointer' }}>
            Upload New PDF or Slides
            <input
              type="file"
              accept=".pdf,image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {syncedSlide && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.78rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={followPresenter}
                  onChange={(e) => setFollowPresenter(e.target.checked)}
                />
                Follow presenter
              </label>
            )}
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => {
                onClose();
                onFallbackToScreenShare();
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <MonitorUp size={13} />
              Fallback to Screen Share
            </button>
          </div>
        </div>

        <div
          style={{
            minHeight: 280,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {renderError ? (
            <div
              style={{
                padding: 20,
                textAlign: 'center',
                color: 'var(--muted)',
              }}
            >
              Slide rendering failed. Use &ldquo;Fallback to Screen Share&rdquo;
              above.
            </div>
          ) : pdfUrl ? (
            <iframe
              title={activeTitle}
              src={`${pdfUrl}#page=${localPage}`}
              style={{ width: '100%', height: 320, border: 'none' }}
              onError={() => setRenderError(true)}
            />
          ) : activeImage ? (
            <img
              src={activeImage}
              alt={`${activeTitle} page ${localPage}`}
              style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }}
            />
          ) : syncedSlide ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                {syncedSlide.deckTitle}
              </div>
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.85rem',
                  marginTop: 6,
                }}
              >
                Presenter is on page {syncedSlide.page} of{' '}
                {syncedSlide.totalPages}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '0.85rem',
              }}
            >
              Select one of your saved decks above, or upload a PDF/slide images
              to present.
            </div>
          )}
        </div>

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
            disabled={localPage <= 1}
            onClick={() =>
              goToPage(
                localPage - 1,
                !followPresenter || Boolean(pdfUrl || imagePages.length),
              )
            }
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            Page {localPage} of {totalPages}
          </span>
          <button
            type="button"
            className="btn secondary sm"
            disabled={localPage >= totalPages}
            onClick={() =>
              goToPage(
                localPage + 1,
                !followPresenter || Boolean(pdfUrl || imagePages.length),
              )
            }
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
