import React, { useState, useEffect } from 'react';
import type { NotesDoc } from '@meetit/protocol';
import { FileText, X, Check, Bookmark } from 'lucide-react';

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
    <aside
      className="app-side-panel"
      role="region"
      aria-label="Shared Collaborative Notes Panel"
      data-testid="shared-notes-panel-container"
    >
      <div className="app-side-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className="app-modal-icon"
            style={{ width: '28px', height: '28px', borderRadius: '6px' }}
          >
            <FileText size={16} />
          </div>
          <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>
            Shared Notes
          </strong>
          <span className="panel-badge muted" style={{ fontSize: '11px' }}>
            v{notesDoc.version}
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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--line)',
          fontSize: '12px',
          color: 'var(--muted)',
        }}
      >
        <span>
          {notesDoc.lastUpdatedBy
            ? `Last edited by ${notesDoc.lastUpdatedBy}`
            : 'Type to collaborate live with others'}
        </span>
        {onAttachToMeetingRecord && (
          <button
            type="button"
            onClick={handleSaveToRecord}
            className="panel-btn-secondary"
            style={{ padding: '3px 8px', fontSize: '11.5px' }}
          >
            {hasSavedLocally ? (
              <>
                <Check size={12} /> Saved
              </>
            ) : (
              <>
                <Bookmark size={12} /> Save to Record
              </>
            )}
          </button>
        )}
      </div>

      <div className="app-side-panel-body" style={{ padding: '12px' }}>
        <textarea
          value={localContent}
          onChange={handleChange}
          placeholder="Collaborate on notes, meeting agenda, decisions, and action items in real-time..."
          className="panel-textarea"
          style={{
            flex: 1,
            height: '100%',
            minHeight: '380px',
            fontSize: '13.5px',
            lineHeight: 1.6,
            resize: 'none',
          }}
        />
      </div>

      <div
        className="app-side-panel-footer"
        style={{ textAlign: 'center', fontSize: '11px', color: 'var(--muted)' }}
      >
        Notes sync instantaneously across all participants via signaling
        channels.
      </div>
    </aside>
  );
}
