import React, { useState, useEffect } from 'react';
import type { NotesDoc } from '@meetit/protocol';

interface SharedNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selfDisplayName: string;
  notesDoc: NotesDoc;
  onUpdateNotes: (content: string, version: number) => void;
  onAttachToMeetingRecord?: (content: string) => void;
}

export function SharedNotesPanel({
  isOpen,
  onClose,
  selfDisplayName,
  notesDoc,
  onUpdateNotes,
  onAttachToMeetingRecord,
}: SharedNotesPanelProps) {
  if (!isOpen) return null;

  const [localContent, setLocalContent] = useState(notesDoc.content || '');
  const [hasSavedLocally, setHasSavedLocally] = useState(false);

  // Sync external changes
  useEffect(() => {
    if (notesDoc.content !== localContent) {
      setLocalContent(notesDoc.content);
    }
  }, [notesDoc.version, notesDoc.content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setLocalContent(next);
    onUpdateNotes(next, notesDoc.version + 1);
  };

  const handleSaveToRecord = () => {
    if (onAttachToMeetingRecord) {
      onAttachToMeetingRecord(localContent);
      setHasSavedLocally(true);
      window.setTimeout(() => setHasSavedLocally(false), 2500);
    }
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col text-neutral-100"
      role="region"
      aria-label="Shared Collaborative Notes Panel"
    >
      <div className="flex items-center justify-between p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">📝</span>
          <h3 className="font-bold text-white">Shared Notes</h3>
          <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
            v{notesDoc.version}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="p-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
        <span>
          {notesDoc.lastUpdatedBy
            ? `Last edited by ${notesDoc.lastUpdatedBy}`
            : 'Type to collaborate live'}
        </span>
        {onAttachToMeetingRecord && (
          <button
            onClick={handleSaveToRecord}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition"
          >
            {hasSavedLocally ? '✓ Saved' : 'Save to Record'}
          </button>
        )}
      </div>

      <div className="flex-1 p-3 flex flex-col">
        <textarea
          value={localContent}
          onChange={handleChange}
          placeholder="Collaborate on notes, meeting agenda, decisions, and action items in real-time..."
          className="w-full flex-1 p-3 bg-neutral-950/80 border border-neutral-800 rounded-2xl text-neutral-200 text-sm leading-relaxed resize-none focus:outline-none focus:border-indigo-500 font-sans"
        />
      </div>

      <div className="p-3 border-t border-neutral-800 text-[11px] text-neutral-500 text-center">
        Changes sync instantaneously across all participants via signaling
        channels.
      </div>
    </div>
  );
}
