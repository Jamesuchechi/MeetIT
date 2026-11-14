export interface SavedSlideDeck {
  id: string;
  title: string;
  kind: 'pdf' | 'images';
  pageCount: number;
  pages: string[]; // data URLs for images, or single PDF data URL when small
  createdAt: number;
}

const STORAGE_KEY = 'meetit_saved_slide_decks_v1';

export function loadSavedDecks(): SavedSlideDeck[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedSlideDeck[]) : [];
  } catch {
    return [];
  }
}

function persistDecks(decks: SavedSlideDeck[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    // Ignore storage quota overflow gracefully
  }
}

export function saveSlideDeck(
  input: Omit<SavedSlideDeck, 'id' | 'createdAt'>,
): SavedSlideDeck {
  const deck: SavedSlideDeck = {
    ...input,
    id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  const next = [deck, ...loadSavedDecks()];
  persistDecks(next);
  return deck;
}

export function deleteSlideDeck(id: string): SavedSlideDeck[] {
  const next = loadSavedDecks().filter((d) => d.id !== id);
  persistDecks(next);
  return next;
}
