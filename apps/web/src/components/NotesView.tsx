import React, { useState, useMemo, useEffect } from 'react';
import {
  copyToClipboard,
  personalRoomCodeForUser,
  type AuthUser,
} from '../types';
import type {
  MeetingHistoryItem,
  SavedRoom,
  ScheduledMeetingItem,
} from '../lib/meetingsStore';
import {
  createActionItem,
  deleteActionItem,
  deleteMeetingNote,
  downloadMarkdownFile,
  formatAllNotesAsMarkdown,
  formatNoteAsMarkdown,
  regenerateNoteWithAI,
  saveOrUpdateMeetingNote,
  toggleActionItem,
  type ActionItemPriority,
  type MeetingActionItem,
  type MeetingNoteItem,
} from '../lib/notesStore';
import {
  exportTaskToIntegration,
  exportAllNoteTasksToIntegration,
  type IntegrationPlatform,
} from '../lib/integrationsService';
import { formatEmailDigest } from '../lib/aiService';
import { AskMeetingModal } from './AskMeetingModal';
import { EmailDigestModal } from './EmailDigestModal';
import { CheckIcon, CloseIcon, LnkIcon, NotesIcon, PlusIcon } from './Icons';
import {
  ClipboardList as ClipboardIcon,
  BarChart3 as BarChartIcon,
  FileText as FileTextIcon,
} from 'lucide-react';

interface NotesViewProps {
  user: AuthUser | null;
  notes: MeetingNoteItem[];
  actionItems: MeetingActionItem[];
  rooms: SavedRoom[];
  history: MeetingHistoryItem[];
  scheduled: ScheduledMeetingItem[];
  onRefreshData: () => void;
  onEnterRoom: (code: string) => void;
  onToast: (msg: string) => void;
}

type NotesSubTab = 'notes' | 'tasks';
type TaskStatusFilter = 'all' | 'open' | 'completed';

export function formatAiEngineBadge(aiModel?: string): {
  icon: string;
  label: string;
} {
  if (!aiModel) return { icon: '✨', label: 'AI Notes' };
  const lower = aiModel.toLowerCase();
  if (lower.includes('heuristic')) {
    return { icon: '⚡', label: 'Smart Heuristics' };
  }
  if (lower.includes('groq')) {
    return { icon: '✨', label: 'Groq Llama 3.3' };
  }
  if (lower.includes('mistral')) {
    return { icon: '✨', label: 'Mistral AI' };
  }
  if (aiModel.includes(':')) {
    const parts = aiModel.split(':');
    const model = parts[1] || parts[0];
    const cleanModel = (model || '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { icon: '✨', label: cleanModel || 'AI Engine' };
  }
  return { icon: '✨', label: aiModel };
}

export function NotesView({
  user,
  notes,
  actionItems,
  rooms,
  history,
  scheduled,
  onRefreshData,
  onEnterRoom,
  onToast,
}: NotesViewProps) {
  const [subTab, setSubTab] = useState<NotesSubTab>('notes');
  const [searchQuery, setSearchQuery] = useState('');
  const [meetingFilter, setMeetingFilter] = useState<string>('all');
  const [taskStatusFilter, setTaskStatusFilter] =
    useState<TaskStatusFilter>('all');

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    () => notes[0]?.id ?? null,
  );
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('detail');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Note composer / editor fields
  const [linkedMeetingSource, setLinkedMeetingSource] = useState<string>('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftRoomCode, setDraftRoomCode] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftAttendees, setDraftAttendees] = useState('');
  const [draftTags, setDraftTags] = useState('');

  // Quick action item composer inside note detail or global manager
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskPriority, setNewTaskPriority] =
    useState<ActionItemPriority>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskNoteId, setNewTaskNoteId] = useState<string>('');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAskMeeting, setShowAskMeeting] = useState(false);
  const [showEmailDigest, setShowEmailDigest] = useState(false);

  const personalCode = personalRoomCodeForUser(user?.id ?? '');

  // Keep selectedNoteId valid when notes list changes
  useEffect(() => {
    if (notes.length === 0) {
      setSelectedNoteId(null);
      return;
    }
    if (!selectedNoteId || !notes.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(notes[0]!.id);
    }
  }, [notes, selectedNoteId]);

  // Distinct room/meeting filter options combining notes, history, scheduled, and rooms
  const meetingFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes) {
      if (n.roomCode) {
        map.set(n.roomCode, `${n.meetingTitle} (${n.roomCode})`);
      }
    }
    for (const h of history) {
      if (h.roomCode && !map.has(h.roomCode)) {
        map.set(h.roomCode, `${h.roomTitle} (${h.roomCode})`);
      }
    }
    for (const s of scheduled) {
      if (s.roomCode && !map.has(s.roomCode)) {
        map.set(s.roomCode, `${s.title} (${s.roomCode})`);
      }
    }
    for (const r of rooms) {
      if (r.code && !map.has(r.code)) {
        map.set(r.code, `${r.title} (${r.code})`);
      }
    }
    return Array.from(map.entries()).map(([code, label]) => ({ code, label }));
  }, [notes, history, scheduled, rooms]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((note) => {
      if (meetingFilter !== 'all' && note.roomCode !== meetingFilter) {
        return false;
      }
      if (!q) return true;
      const inNote =
        note.meetingTitle.toLowerCase().includes(q) ||
        note.roomCode.toLowerCase().includes(q) ||
        note.summary.toLowerCase().includes(q) ||
        note.content.toLowerCase().includes(q) ||
        note.attendees.some((a) => a.toLowerCase().includes(q)) ||
        note.tags.some((t) => t.toLowerCase().includes(q)) ||
        Boolean(note.keyDecisions?.some((d) => d.toLowerCase().includes(q))) ||
        Boolean(
          note.chapters?.some(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              c.summary.toLowerCase().includes(q),
          ),
        );
      if (inNote) return true;

      // Also match if any linked action item contains the search query
      const hasMatchingTask = actionItems.some(
        (t) =>
          (t.noteId === note.id || t.roomCode === note.roomCode) &&
          t.text.toLowerCase().includes(q),
      );
      return hasMatchingTask;
    });
  }, [notes, meetingFilter, searchQuery, actionItems]);

  const filteredActionItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return actionItems.filter((task) => {
      if (meetingFilter !== 'all' && task.roomCode !== meetingFilter) {
        return false;
      }
      if (taskStatusFilter === 'open' && task.done) return false;
      if (taskStatusFilter === 'completed' && !task.done) return false;
      if (!q) return true;
      return (
        task.text.toLowerCase().includes(q) ||
        task.meetingTitle.toLowerCase().includes(q) ||
        task.roomCode.toLowerCase().includes(q) ||
        (task.assignee && task.assignee.toLowerCase().includes(q))
      );
    });
  }, [actionItems, meetingFilter, taskStatusFilter, searchQuery]);

  const selectedNote = useMemo(
    () =>
      filteredNotes.find((n) => n.id === selectedNoteId) ??
      filteredNotes[0] ??
      null,
    [filteredNotes, selectedNoteId],
  );

  const selectedNoteTasks = useMemo(() => {
    if (!selectedNote) return [];
    return actionItems.filter(
      (t) =>
        t.noteId === selectedNote.id ||
        (!t.noteId && t.roomCode === selectedNote.roomCode),
    );
  }, [actionItems, selectedNote]);

  const openTaskCount = useMemo(
    () => actionItems.filter((t) => !t.done).length,
    [actionItems],
  );
  const completedTaskCount = useMemo(
    () => actionItems.filter((t) => t.done).length,
    [actionItems],
  );

  const openNewNoteModal = () => {
    setLinkedMeetingSource('');
    setDraftTitle('');
    setDraftRoomCode(personalCode);
    setDraftSummary('');
    setDraftContent('');
    setDraftAttendees(user?.displayName || '');
    setDraftTags('meeting-notes, summary');
    setIsEditingNote(false);
    setShowCreateModal(true);
  };

  const handleSelectLinkedMeeting = (value: string) => {
    setLinkedMeetingSource(value);
    if (!value) return;

    const [kind, id] = value.split(':');
    if (kind === 'history') {
      const h = history.find((item) => item.id === id);
      if (h) {
        setDraftTitle(h.roomTitle);
        setDraftRoomCode(h.roomCode);
        setDraftAttendees(h.attendees.map((a) => a.displayName).join(', '));
        if (!draftSummary) {
          setDraftSummary(
            `Summary for ${h.roomTitle} (${h.durationMinutes} min session).`,
          );
        }
      }
    } else if (kind === 'scheduled') {
      const s = scheduled.find((item) => item.id === id);
      if (s) {
        setDraftTitle(s.title);
        setDraftRoomCode(s.roomCode);
        setDraftAttendees(s.invitees.join(', '));
        if (!draftSummary && s.description) {
          setDraftSummary(s.description);
        }
      }
    } else if (kind === 'room') {
      const r = rooms.find((item) => item.id === id);
      if (r) {
        setDraftTitle(r.title);
        setDraftRoomCode(r.code);
        if (!draftSummary && r.description) {
          setDraftSummary(r.description);
        }
      }
    }
  };

  const startEditingSelectedNote = (note: MeetingNoteItem) => {
    setDraftTitle(note.meetingTitle);
    setDraftRoomCode(note.roomCode);
    setDraftSummary(note.summary);
    setDraftContent(note.content);
    setDraftAttendees(note.attendees.join(', '));
    setDraftTags(note.tags.join(', '));
    setIsEditingNote(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) {
      onToast('Please enter a meeting title for this note.');
      return;
    }

    const attendeesList = draftAttendees
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const tagsList = draftTags
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean);

    const saved = await saveOrUpdateMeetingNote({
      ...(isEditingNote && selectedNote ? { id: selectedNote.id } : {}),
      ownerId: user?.id ?? '',
      roomCode: draftRoomCode.trim() || personalCode,
      meetingTitle: draftTitle.trim(),
      summary: draftSummary.trim(),
      content: draftContent.trim(),
      attendees: attendeesList,
      tags: tagsList,
    });

    onRefreshData();
    setSelectedNoteId(saved.id);
    setMobileView('detail');
    setIsEditingNote(false);
    setShowCreateModal(false);
    onToast(
      isEditingNote
        ? `Updated notes for "${saved.meetingTitle}".`
        : `Created notes for "${saved.meetingTitle}".`,
    );
  };

  const handleDeleteNote = async (note: MeetingNoteItem) => {
    await deleteMeetingNote(note.id);
    onRefreshData();
    setIsEditingNote(false);
    onToast(`Deleted note "${note.meetingTitle}".`);
  };

  const handleAddTask = async (
    e: React.FormEvent,
    contextNote?: MeetingNoteItem | null,
  ) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const targetNote =
      contextNote ??
      (newTaskNoteId ? notes.find((n) => n.id === newTaskNoteId) : null) ??
      null;

    await createActionItem({
      ownerId: user?.id ?? '',
      ...(targetNote ? { noteId: targetNote.id } : {}),
      roomCode:
        targetNote?.roomCode ||
        (meetingFilter !== 'all' ? meetingFilter : personalCode),
      meetingTitle: targetNote?.meetingTitle || 'Follow-up task',
      text: newTaskText.trim(),
      ...(newTaskAssignee.trim() ? { assignee: newTaskAssignee.trim() } : {}),
      ...(newTaskDueDate.trim() ? { dueDate: newTaskDueDate.trim() } : {}),
      priority: newTaskPriority,
    });

    setNewTaskText('');
    setNewTaskAssignee('');
    setNewTaskDueDate('');
    onRefreshData();
    onToast('Action item added.');
  };

  const handleToggleTask = async (taskId: string) => {
    const updated = await toggleActionItem(taskId);
    onRefreshData();
    if (updated) {
      onToast(
        updated.done
          ? `Completed: "${updated.text}"`
          : `Reopened: "${updated.text}"`,
      );
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteActionItem(taskId);
    onRefreshData();
    onToast('Action item removed.');
  };

  const handleCopyMarkdown = async (note: MeetingNoteItem) => {
    const md = formatNoteAsMarkdown(note, actionItems);
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopiedId(`md:${note.id}`);
      onToast('Full Markdown note copied to clipboard.');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      onToast('Could not copy to clipboard.');
    }
  };

  const handleCopySummary = async (note: MeetingNoteItem) => {
    const text = note.summary || note.content;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(`sum:${note.id}`);
      onToast('Meeting summary copied to clipboard.');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      onToast('Could not copy summary.');
    }
  };

  const handleExportSingleMarkdown = (note: MeetingNoteItem) => {
    const md = formatNoteAsMarkdown(note, actionItems);
    downloadMarkdownFile(`${note.meetingTitle}-${note.roomCode}.md`, md);
    onToast(`Downloaded ${note.meetingTitle}.md`);
  };

  const handleExportAllMarkdown = () => {
    const md = formatAllNotesAsMarkdown(filteredNotes, filteredActionItems);
    downloadMarkdownFile('meetit-notes-and-action-items.md', md);
    onToast('Exported Markdown archive (.md).');
  };

  const handleAIGenerate = async (note: MeetingNoteItem) => {
    setIsGeneratingAI(true);
    try {
      const updated = await regenerateNoteWithAI(note.id);
      if (updated) {
        onRefreshData();
        onToast('Meeting intelligence generated with AI!');
      } else {
        onToast('Could not find note to generate intelligence.');
      }
    } catch (err) {
      onToast(`AI Generation failed: ${(err as Error).message}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleExportTask = async (
    task: MeetingActionItem,
    platform: IntegrationPlatform,
  ) => {
    const res = await exportTaskToIntegration(task, platform);
    if (res.directUrl) {
      window.open(res.directUrl, '_blank', 'noopener,noreferrer');
    }
    onToast(res.message);
  };

  const handleBatchExportTasks = async (
    note: MeetingNoteItem,
    platform: IntegrationPlatform,
  ) => {
    const noteTasks = actionItems.filter(
      (t) =>
        t.noteId === note.id || (!t.noteId && t.roomCode === note.roomCode),
    );
    if (noteTasks.length === 0) {
      onToast('No action items to export.');
      return;
    }
    const res = await exportAllNoteTasksToIntegration(
      note,
      noteTasks,
      platform,
    );
    if (res.directUrl) {
      window.open(res.directUrl, '_blank', 'noopener,noreferrer');
    }
    onToast(`Exported ${res.successful} of ${res.total} tasks to ${platform}.`);
  };

  return (
    <div className="notes-hub-view" data-testid="notes-view">
      {/* Header */}
      <div className="head">
        <div>
          <h2>Meeting Notes &amp; Action Items</h2>
          <p>
            Search call summaries, track follow-up action items across meetings,
            and export clean Markdown.
          </p>
        </div>
        <div className="head-actions" style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn"
            onClick={handleExportAllMarkdown}
            data-testid="export-all-md-btn"
          >
            Export .md
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={openNewNoteModal}
            data-testid="new-note-btn"
          >
            <PlusIcon />
            <span>New meeting note</span>
          </button>
        </div>
      </div>

      {/* Summary Stats Ribbon */}
      <div className="stats-ribbon" aria-label="Notes and action items metrics">
        <div className="stat-card">
          <small>Meeting Notes</small>
          <strong>
            {notes.length} {notes.length === 1 ? 'Note' : 'Notes'}
          </strong>
        </div>
        <div className="stat-card">
          <small>Open Action Items</small>
          <strong>
            {openTaskCount} {openTaskCount === 1 ? 'Task' : 'Tasks'}
          </strong>
        </div>
        <div className="stat-card">
          <small>Completed Action Items</small>
          <strong>
            {completedTaskCount} {completedTaskCount === 1 ? 'Done' : 'Done'}
          </strong>
        </div>
      </div>

      {/* Sub-navigation & Search/Filter Toolbar */}
      <div className="notes-toolbar-card">
        <div className="notes-subtabs" role="tablist" aria-label="Notes views">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'notes'}
            className={`notes-subtab-btn ${subTab === 'notes' ? 'active' : ''}`}
            onClick={() => setSubTab('notes')}
            data-testid="subtab-notes"
          >
            <NotesIcon />
            <span>Notes &amp; Summaries ({filteredNotes.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'tasks'}
            className={`notes-subtab-btn ${subTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setSubTab('tasks')}
            data-testid="subtab-tasks"
          >
            <CheckIcon />
            <span>
              Action Items Manager ({openTaskCount} open / {actionItems.length}{' '}
              total)
            </span>
          </button>
        </div>

        <div className="notes-filters-row">
          <input
            type="search"
            className="notes-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, summaries, attendees, or tasks…"
            aria-label="Search meeting notes and action items"
            data-testid="notes-search-input"
          />

          <select
            className="notes-filter-select"
            value={meetingFilter}
            onChange={(e) => setMeetingFilter(e.target.value)}
            aria-label="Filter by meeting room"
            data-testid="notes-meeting-filter"
          >
            <option value="all">All meetings &amp; rooms</option>
            {meetingFilterOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Create New Note Composer Card */}
      {showCreateModal && (
        <form
          className="note-composer-card"
          onSubmit={(e) => void handleSaveNote(e)}
          data-testid="note-composer-form"
        >
          <div className="note-composer-head">
            <h3>Create Meeting Note &amp; Summary</h3>
            <button
              type="button"
              className="btn-icon-subtle"
              onClick={() => setShowCreateModal(false)}
              aria-label="Close composer"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="note-composer-grid">
            <label className="form-field">
              <span>Link to past or scheduled meeting (optional)</span>
              <select
                value={linkedMeetingSource}
                onChange={(e) => handleSelectLinkedMeeting(e.target.value)}
              >
                <option value="">Custom / standalone note</option>
                {history.length > 0 && (
                  <optgroup label="Past Completed Calls">
                    {history.map((h) => (
                      <option key={h.id} value={`history:${h.id}`}>
                        {h.roomTitle} ({h.roomCode}) ·{' '}
                        {new Date(h.startedAt).toLocaleDateString()}
                      </option>
                    ))}
                  </optgroup>
                )}
                {scheduled.length > 0 && (
                  <optgroup label="Scheduled Meetings">
                    {scheduled.map((s) => (
                      <option key={s.id} value={`scheduled:${s.id}`}>
                        {s.title} ({s.roomCode}) ·{' '}
                        {new Date(s.startsAt).toLocaleDateString()}
                      </option>
                    ))}
                  </optgroup>
                )}
                {rooms.length > 0 && (
                  <optgroup label="Saved Rooms">
                    {rooms.map((r) => (
                      <option key={r.id} value={`room:${r.id}`}>
                        {r.title} ({r.code})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>

            <label className="form-field">
              <span>Room Code</span>
              <input
                type="text"
                value={draftRoomCode}
                onChange={(e) => setDraftRoomCode(e.target.value)}
                placeholder="abc-defg-hij"
                required
              />
            </label>

            <label className="form-field full-span">
              <span>Meeting Title</span>
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="e.g. Q4 Product Architecture Sync"
                required
                data-testid="note-title-input"
              />
            </label>

            <label className="form-field full-span">
              <span>Executive Summary</span>
              <textarea
                rows={2}
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                placeholder="Key outcomes and 1-2 sentence executive summary…"
                data-testid="note-summary-input"
              />
            </label>

            <label className="form-field full-span">
              <span>
                Detailed Discussion &amp; Decisions (Markdown supported)
              </span>
              <textarea
                rows={5}
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="- Agreed on WebRTC mesh threshold&#10;- Scheduled follow-up review"
                data-testid="note-content-input"
              />
            </label>

            <label className="form-field">
              <span>Attendees (comma-separated)</span>
              <input
                type="text"
                value={draftAttendees}
                onChange={(e) => setDraftAttendees(e.target.value)}
                placeholder="Alex Rivera, Mei Lin"
              />
            </label>

            <label className="form-field">
              <span>Tags (comma-separated)</span>
              <input
                type="text"
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                placeholder="product, engineering, sprint"
              />
            </label>
          </div>

          <div className="note-composer-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              data-testid="save-note-btn"
            >
              Save meeting note
            </button>
          </div>
        </form>
      )}

      {/* TAB 1: NOTES & SUMMARIES MASTER-DETAIL STUDIO */}
      {subTab === 'notes' ? (
        filteredNotes.length === 0 ? (
          <div className="empty-state-box" style={{ padding: '36px 24px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 17 }}>
              {notes.length === 0
                ? 'No meeting notes recorded yet'
                : 'No notes match your search or filter'}
            </h4>
            <p style={{ margin: '0 0 16px' }}>
              {notes.length === 0
                ? 'Notes and summaries are automatically created when you finish a call, or you can create a note manually for any meeting.'
                : 'Try clearing your search query or switching the meeting filter to "All meetings & rooms".'}
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={openNewNoteModal}
            >
              <PlusIcon />
              <span>Create your first meeting note</span>
            </button>
          </div>
        ) : (
          <div
            className={`notes-split-layout ${mobileView === 'detail' && selectedNote ? 'mobile-view-detail' : 'mobile-view-list'}`}
          >
            {/* Left List of Notes */}
            <div
              className="notes-list-col"
              role="listbox"
              aria-label="Meeting notes list"
            >
              {filteredNotes.map((note) => {
                const isSelected = selectedNote?.id === note.id;
                const noteTasks = actionItems.filter(
                  (t) =>
                    t.noteId === note.id ||
                    (!t.noteId && t.roomCode === note.roomCode),
                );
                const openCount = noteTasks.filter((t) => !t.done).length;
                return (
                  <button
                    key={note.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`note-list-card ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedNoteId(note.id);
                      setIsEditingNote(false);
                      setMobileView('detail');
                    }}
                    data-testid="note-list-item"
                  >
                    <div className="note-list-card-top">
                      <strong>{note.meetingTitle}</strong>
                      <code className="note-room-pill">{note.roomCode}</code>
                    </div>
                    <p className="note-list-summary">
                      {note.summary || note.content || 'No summary added yet.'}
                    </p>
                    <div className="note-list-meta">
                      <time>
                        {new Date(note.meetingDate).toLocaleDateString(
                          undefined,
                          {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          },
                        )}
                      </time>
                      {noteTasks.length > 0 && (
                        <span
                          className={`note-task-pill ${openCount === 0 ? 'all-done' : ''}`}
                        >
                          {openCount === 0
                            ? `✓ ${noteTasks.length} done`
                            : `${openCount} open task${openCount === 1 ? '' : 's'}`}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Selected Note Detail & Action Items */}
            {selectedNote && (
              <div className="note-detail-col" data-testid="note-detail-pane">
                {isEditingNote ? (
                  <form
                    className="note-edit-form"
                    onSubmit={(e) => void handleSaveNote(e)}
                  >
                    <div className="note-detail-head note-detail-head-edit">
                      <h3 className="note-detail-title">Edit Meeting Note</h3>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setIsEditingNote(false)}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-sm primary">
                          Save changes
                        </button>
                      </div>
                    </div>

                    <div className="note-composer-grid">
                      <label className="form-field">
                        <span>Meeting Title</span>
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          required
                        />
                      </label>
                      <label className="form-field">
                        <span>Room Code</span>
                        <input
                          type="text"
                          value={draftRoomCode}
                          onChange={(e) => setDraftRoomCode(e.target.value)}
                          required
                        />
                      </label>
                      <label className="form-field full-span">
                        <span>Executive Summary</span>
                        <textarea
                          rows={3}
                          value={draftSummary}
                          onChange={(e) => setDraftSummary(e.target.value)}
                        />
                      </label>
                      <label className="form-field full-span">
                        <span>Detailed Notes &amp; Decisions</span>
                        <textarea
                          rows={7}
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                        />
                      </label>
                      <label className="form-field">
                        <span>Attendees (comma-separated)</span>
                        <input
                          type="text"
                          value={draftAttendees}
                          onChange={(e) => setDraftAttendees(e.target.value)}
                        />
                      </label>
                      <label className="form-field">
                        <span>Tags (comma-separated)</span>
                        <input
                          type="text"
                          value={draftTags}
                          onChange={(e) => setDraftTags(e.target.value)}
                        />
                      </label>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="note-detail-head">
                      <button
                        type="button"
                        className="btn btn-sm note-mobile-back-btn"
                        onClick={() => setMobileView('list')}
                        title="Back to notes list"
                      >
                        ← All Notes ({filteredNotes.length})
                      </button>

                      <div className="note-detail-title-block">
                        <div className="note-detail-badges">
                          <code className="note-room-pill">
                            Room {selectedNote.roomCode}
                          </code>
                          <span className="note-date-label">
                            {new Date(selectedNote.meetingDate).toLocaleString(
                              undefined,
                              {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              },
                            )}
                          </span>
                          {selectedNote.aiModel &&
                            (() => {
                              const badge = formatAiEngineBadge(
                                selectedNote.aiModel,
                              );
                              return (
                                <span
                                  className="note-ai-engine-pill"
                                  title={`Intelligence generated by ${selectedNote.aiModel}`}
                                >
                                  <span
                                    className="note-ai-engine-icon"
                                    aria-hidden="true"
                                  >
                                    {badge.icon}
                                  </span>
                                  <span>{badge.label}</span>
                                </span>
                              );
                            })()}
                        </div>
                        <h3 className="note-detail-title">
                          {selectedNote.meetingTitle}
                        </h3>
                      </div>

                      <div className="note-detail-actions">
                        <div className="note-actions-primary">
                          <button
                            type="button"
                            className="btn btn-sm primary note-ai-primary-btn"
                            onClick={() => void handleAIGenerate(selectedNote)}
                            disabled={isGeneratingAI}
                            title="Generate or update executive summary, decisions, and action items using AI"
                          >
                            <span className="btn-icon" aria-hidden="true">
                              ✨
                            </span>
                            <span>
                              {isGeneratingAI
                                ? 'Generating…'
                                : 'AI Intelligence'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setShowAskMeeting(true)}
                            title="Ask questions with timestamp citations"
                          >
                            <span className="btn-icon" aria-hidden="true">
                              💬
                            </span>
                            <span>Ask Meeting</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setShowEmailDigest(true)}
                            title="Email summary and action items digest"
                          >
                            <span className="btn-icon" aria-hidden="true">
                              📧
                            </span>
                            <span>Email Digest</span>
                          </button>
                        </div>

                        <div className="note-actions-secondary">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              void handleCopyMarkdown(selectedNote)
                            }
                            data-testid="copy-note-md-btn"
                            title="Copy complete note as Markdown"
                          >
                            {copiedId === `md:${selectedNote.id}` ? (
                              <CheckIcon />
                            ) : (
                              <LnkIcon />
                            )}
                            <span>
                              {copiedId === `md:${selectedNote.id}`
                                ? 'Copied'
                                : 'Copy Markdown'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              handleExportSingleMarkdown(selectedNote)
                            }
                            data-testid="download-note-md-btn"
                            title="Download note as .md file"
                          >
                            <span className="btn-icon" aria-hidden="true">
                              ⬇
                            </span>
                            <span>Download .md</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              startEditingSelectedNote(selectedNote)
                            }
                            title="Edit note title, attendees, tags and summary"
                          >
                            <span className="btn-icon" aria-hidden="true">
                              ✏️
                            </span>
                            <span>Edit</span>
                          </button>
                          {selectedNote.roomCode && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => onEnterRoom(selectedNote.roomCode)}
                              title={`Rejoin room ${selectedNote.roomCode}`}
                            >
                              <span>Rejoin room</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Attendees & Tags */}
                    {(selectedNote.attendees.length > 0 ||
                      selectedNote.tags.length > 0) && (
                      <div className="note-people-tags-row">
                        {selectedNote.attendees.length > 0 && (
                          <div className="note-chip-group">
                            <small>Attendees:</small>
                            {selectedNote.attendees.map((person) => (
                              <span key={person} className="note-person-chip">
                                {person}
                              </span>
                            ))}
                          </div>
                        )}
                        {selectedNote.tags.length > 0 && (
                          <div className="note-chip-group">
                            {selectedNote.tags.map((tag) => (
                              <span key={tag} className="note-tag-chip">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Executive Summary Highlight Box */}
                    <section className="note-summary-box">
                      <div className="note-section-head">
                        <h4>Executive Summary</h4>
                        <button
                          type="button"
                          className="note-mini-copy-btn"
                          onClick={() => void handleCopySummary(selectedNote)}
                        >
                          {copiedId === `sum:${selectedNote.id}`
                            ? '✓ Summary copied'
                            : 'Copy summary'}
                        </button>
                      </div>
                      <p>
                        {selectedNote.summary ||
                          'No executive summary added yet. Click Edit to summarize key decisions.'}
                      </p>
                    </section>

                    {/* Key Decisions Highlight Box */}
                    {selectedNote.keyDecisions &&
                      selectedNote.keyDecisions.length > 0 && (
                        <section
                          className="note-summary-box"
                          style={{
                            borderLeft: '3px solid var(--accent, #10b981)',
                          }}
                        >
                          <div className="note-section-head">
                            <h4>
                              🎯 Key Decisions (
                              {selectedNote.keyDecisions.length})
                            </h4>
                          </div>
                          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                            {selectedNote.keyDecisions.map((decision, idx) => (
                              <li
                                key={idx}
                                style={{ marginBottom: 6, lineHeight: 1.5 }}
                              >
                                {decision}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                    {/* Chapters & Highlights with Timestamp Links */}
                    {selectedNote.chapters &&
                      selectedNote.chapters.length > 0 && (
                        <section
                          className="note-summary-box"
                          style={{
                            borderLeft: '3px solid var(--primary, #3b82f6)',
                          }}
                        >
                          <div className="note-section-head">
                            <h4>
                              📑 Chapters &amp; Highlights (
                              {selectedNote.chapters.length})
                            </h4>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                              marginTop: 8,
                            }}
                          >
                            {selectedNote.chapters.map((ch, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  alignItems: 'flex-start',
                                }}
                              >
                                <span
                                  className="badge"
                                  style={{
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    fontSize: 12,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: 'var(--panel-bg, #f3f4f6)',
                                    color: 'var(--primary, #2563eb)',
                                  }}
                                >
                                  {ch.timecode}
                                </span>
                                <div>
                                  <strong style={{ fontSize: 13.5 }}>
                                    {ch.title}
                                  </strong>
                                  <p
                                    style={{
                                      margin: '2px 0 0',
                                      fontSize: 13,
                                      color: 'var(--muted, #64748b)',
                                    }}
                                  >
                                    {ch.summary}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                    {/* FormIT In-Call Survey / Poll */}
                    {selectedNote.formItSurvey && (
                      <section
                        className="note-summary-box"
                        style={{
                          borderLeft: '3px solid #10b981',
                        }}
                      >
                        <div className="note-section-head">
                          <h4
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <ClipboardIcon size={16} /> FormIT Survey / Feedback
                          </h4>
                          <a
                            href={selectedNote.formItSurvey.formUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm"
                            style={{ fontSize: 12, padding: '2px 8px' }}
                          >
                            Open FormIT ↗
                          </a>
                        </div>
                        <p style={{ margin: '4px 0' }}>
                          <strong>
                            {selectedNote.formItSurvey.title ||
                              selectedNote.formItSurvey.slug}
                          </strong>{' '}
                          — {selectedNote.formItSurvey.submissionsCount}{' '}
                          submission
                          {selectedNote.formItSurvey.submissionsCount === 1
                            ? ''
                            : 's'}{' '}
                          recorded during this meeting.
                        </p>
                      </section>
                    )}

                    {/* In-Call Poll Results */}
                    {selectedNote.pollResults &&
                      selectedNote.pollResults.length > 0 && (
                        <section
                          className="note-summary-box"
                          style={{
                            borderLeft: '3px solid #f59e0b',
                          }}
                        >
                          <div className="note-section-head">
                            <h4
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <BarChartIcon size={16} /> In-Call Poll Results (
                              {selectedNote.pollResults.length})
                            </h4>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12,
                              marginTop: 8,
                            }}
                          >
                            {selectedNote.pollResults.map((poll, idx) => (
                              <div
                                key={idx}
                                style={{
                                  background:
                                    'var(--panel-bg, rgba(0,0,0,0.02))',
                                  padding: '10px 12px',
                                  borderRadius: 6,
                                }}
                              >
                                <strong>{poll.question}</strong>
                                <ul
                                  style={{
                                    margin: '6px 0 0',
                                    paddingLeft: 16,
                                  }}
                                >
                                  {poll.options.map((opt) => (
                                    <li
                                      key={opt}
                                      style={{ fontSize: 13, margin: '2px 0' }}
                                    >
                                      {opt}:{' '}
                                      <strong>
                                        {poll.results[opt] ?? 0} votes
                                      </strong>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                    {/* Shared Collaborative Notes */}
                    {selectedNote.collaborativeNotes && (
                      <section
                        className="note-summary-box"
                        style={{
                          borderLeft: '3px solid #8b5cf6',
                        }}
                      >
                        <div className="note-section-head">
                          <h4
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <FileTextIcon size={16} /> Collaborative In-Call
                            Notes
                          </h4>
                        </div>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'inherit',
                            fontSize: 14,
                            lineHeight: 1.5,
                            margin: '6px 0 0',
                          }}
                        >
                          {selectedNote.collaborativeNotes}
                        </pre>
                      </section>
                    )}

                    {/* Detailed Notes Body */}
                    <section className="note-body-section">
                      <h4>Discussion &amp; Detailed Notes</h4>
                      <div className="note-markdown-body">
                        {selectedNote.content ||
                          'No detailed discussion notes recorded for this session.'}
                      </div>
                    </section>

                    {/* Linked Action Items Section with Checkbox Sync */}
                    <section className="note-tasks-section">
                      <div className="note-section-head">
                        <h4>
                          Action Items from this Meeting (
                          {selectedNoteTasks.filter((t) => !t.done).length} open
                          / {selectedNoteTasks.length} total)
                        </h4>
                        {selectedNoteTasks.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              onClick={() =>
                                void handleBatchExportTasks(
                                  selectedNote,
                                  'linear',
                                )
                              }
                              title="Export action items to Linear"
                            >
                              → Linear
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              onClick={() =>
                                void handleBatchExportTasks(
                                  selectedNote,
                                  'notion',
                                )
                              }
                              title="Export action items to Notion"
                            >
                              → Notion
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              onClick={() =>
                                void handleBatchExportTasks(
                                  selectedNote,
                                  'asana',
                                )
                              }
                              title="Export action items to Asana"
                            >
                              → Asana
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              onClick={() =>
                                void handleBatchExportTasks(
                                  selectedNote,
                                  'google-docs',
                                )
                              }
                              title="Export action items to Google Docs"
                            >
                              → Docs
                            </button>
                          </div>
                        )}
                      </div>

                      {selectedNoteTasks.length === 0 ? (
                        <p className="note-empty-sub">
                          No action items linked to this meeting yet. Add one
                          below.
                        </p>
                      ) : (
                        <div className="note-tasks-list">
                          {selectedNoteTasks.map((task) => (
                            <div
                              key={task.id}
                              className={`hub-task-row ${task.done ? 'done' : ''}`}
                            >
                              <label className="hub-task-label">
                                <input
                                  type="checkbox"
                                  checked={task.done}
                                  onChange={() =>
                                    void handleToggleTask(task.id)
                                  }
                                />
                                <span className="hub-task-text">
                                  {task.text}
                                </span>
                              </label>
                              <div className="hub-task-meta">
                                {task.assignee && (
                                  <span className="task-assignee-chip">
                                    @{task.assignee}
                                  </span>
                                )}
                                <span
                                  className={`task-priority-chip priority-${task.priority}`}
                                >
                                  {task.priority}
                                </span>
                                <button
                                  type="button"
                                  className="btn-icon-subtle"
                                  onClick={() =>
                                    void handleExportTask(task, 'linear')
                                  }
                                  title="Sync to Linear"
                                  aria-label="Sync to Linear"
                                >
                                  <span
                                    style={{ fontSize: 11, fontWeight: 700 }}
                                  >
                                    Lin
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon-subtle"
                                  onClick={() =>
                                    void handleExportTask(task, 'notion')
                                  }
                                  title="Sync to Notion"
                                  aria-label="Sync to Notion"
                                >
                                  <span
                                    style={{ fontSize: 11, fontWeight: 700 }}
                                  >
                                    Not
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon-subtle"
                                  onClick={() => void handleDeleteTask(task.id)}
                                  aria-label="Delete action item"
                                  title="Delete action item"
                                >
                                  <CloseIcon />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline Quick-Add Action Item for this Note */}
                      <form
                        className="note-inline-task-form"
                        onSubmit={(e) => void handleAddTask(e, selectedNote)}
                      >
                        <input
                          type="text"
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          placeholder="Add an action item for this meeting…"
                          aria-label="New action item text"
                          data-testid="note-add-task-input"
                        />
                        <input
                          type="text"
                          value={newTaskAssignee}
                          onChange={(e) => setNewTaskAssignee(e.target.value)}
                          placeholder="Assignee (optional)"
                          aria-label="Assignee"
                          style={{ maxWidth: 150 }}
                        />
                        <select
                          value={newTaskPriority}
                          onChange={(e) =>
                            setNewTaskPriority(
                              e.target.value as ActionItemPriority,
                            )
                          }
                          aria-label="Task priority"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <button
                          type="submit"
                          className="btn primary"
                          disabled={!newTaskText.trim()}
                          data-testid="note-add-task-btn"
                        >
                          Add task
                        </button>
                      </form>
                    </section>

                    <div className="note-detail-footer">
                      <button
                        type="button"
                        className="note-delete-link"
                        onClick={() => void handleDeleteNote(selectedNote)}
                      >
                        Delete meeting note
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      ) : (
        /* TAB 2: GLOBAL ACTION ITEMS MANAGER */
        <div
          className="action-items-manager-card"
          data-testid="action-items-manager"
        >
          <div className="manager-header-row">
            <div>
              <h3>Action Items Manager</h3>
              <p>
                Track open and completed follow-ups from all past meetings.
                Changes sync immediately with the dashboard sidebar.
              </p>
            </div>

            <div className="task-status-pills" role="group">
              <button
                type="button"
                className={`status-filter-pill ${taskStatusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTaskStatusFilter('all')}
              >
                All ({actionItems.length})
              </button>
              <button
                type="button"
                className={`status-filter-pill ${taskStatusFilter === 'open' ? 'active' : ''}`}
                onClick={() => setTaskStatusFilter('open')}
              >
                Open ({openTaskCount})
              </button>
              <button
                type="button"
                className={`status-filter-pill ${taskStatusFilter === 'completed' ? 'active' : ''}`}
                onClick={() => setTaskStatusFilter('completed')}
              >
                Completed ({completedTaskCount})
              </button>
            </div>
          </div>

          {/* Global Add Action Item Bar */}
          <form
            className="note-inline-task-form manager-add-form"
            onSubmit={(e) => void handleAddTask(e, null)}
          >
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="New follow-up action item…"
              aria-label="Action item description"
              data-testid="manager-task-input"
            />
            <select
              value={newTaskNoteId}
              onChange={(e) => setNewTaskNoteId(e.target.value)}
              aria-label="Link to meeting note"
            >
              <option value="">General / Personal Room</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.meetingTitle} ({n.roomCode})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value)}
              placeholder="Assignee"
              aria-label="Assignee"
              style={{ maxWidth: 140 }}
            />
            <input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              aria-label="Due date"
              style={{ maxWidth: 145 }}
            />
            <select
              value={newTaskPriority}
              onChange={(e) =>
                setNewTaskPriority(e.target.value as ActionItemPriority)
              }
              aria-label="Priority"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <button
              type="submit"
              className="btn primary"
              disabled={!newTaskText.trim()}
              data-testid="manager-add-task-btn"
            >
              <PlusIcon />
              <span>Add</span>
            </button>
          </form>

          {filteredActionItems.length === 0 ? (
            <div className="empty-state-box">
              <p>
                No action items match the current filter. Add a follow-up task
                above to track deliverables across meetings.
              </p>
            </div>
          ) : (
            <div className="manager-task-list">
              {filteredActionItems.map((task) => (
                <div
                  key={task.id}
                  className={`hub-task-row ${task.done ? 'done' : ''}`}
                  data-testid="action-item-row"
                >
                  <label className="hub-task-label">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => void handleToggleTask(task.id)}
                    />
                    <div>
                      <span className="hub-task-text">{task.text}</span>
                      <small className="hub-task-origin">
                        {task.meetingTitle}
                        {task.roomCode ? ` · ${task.roomCode}` : ''}
                        {task.dueDate ? ` · Due ${task.dueDate}` : ''}
                      </small>
                    </div>
                  </label>

                  <div className="hub-task-meta">
                    {task.assignee && (
                      <span className="task-assignee-chip">
                        @{task.assignee}
                      </span>
                    )}
                    <span
                      className={`task-priority-chip priority-${task.priority}`}
                    >
                      {task.priority}
                    </span>
                    {task.noteId && (
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => {
                          setSelectedNoteId(task.noteId!);
                          setMobileView('detail');
                          setSubTab('notes');
                        }}
                      >
                        Open note
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-icon-subtle"
                      onClick={() => void handleDeleteTask(task.id)}
                      aria-label="Delete action item"
                      title="Delete action item"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAskMeeting && selectedNote && (
        <AskMeetingModal
          transcriptText={selectedNote.content || selectedNote.summary}
          roomTitle={selectedNote.meetingTitle}
          onClose={() => setShowAskMeeting(false)}
        />
      )}

      {showEmailDigest && selectedNote && (
        <EmailDigestModal
          roomTitle={selectedNote.meetingTitle}
          digest={formatEmailDigest(
            {
              executiveSummary: selectedNote.summary,
              keyDecisions: selectedNote.keyDecisions ?? [],
              actionItems: selectedNoteTasks.map((t) => ({
                task: t.text,
                ...(t.assignee ? { owner: t.assignee } : {}),
                ...(t.dueDate ? { dueDate: t.dueDate } : {}),
                priority: t.priority,
              })),
              chapters: selectedNote.chapters ?? [],
              providerUsed: selectedNote.aiModel?.includes('groq')
                ? 'groq'
                : selectedNote.aiModel?.includes('mistral')
                  ? 'mistral'
                  : 'heuristic',
              modelUsed: selectedNote.aiModel ?? 'ai-engine',
            },
            selectedNote.meetingTitle,
            selectedNote.roomCode,
            selectedNote.meetingDate,
            selectedNote.attendees,
          )}
          onClose={() => setShowEmailDigest(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
