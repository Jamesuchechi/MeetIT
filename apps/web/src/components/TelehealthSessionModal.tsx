import React, { useState } from 'react';
import { HeartPulse, CheckCircle2, PenTool, X } from 'lucide-react';
import { saveOrUpdateMeetingNote } from '../lib/notesStore';

export interface TelehealthSessionModalProps {
  roomCode: string;
  ownerId: string;
  selfDisplayName: string;
  onOpenWhiteboard: () => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

interface ConsentRecord {
  id: string;
  roomCode: string;
  participantName: string;
  mode: 'telehealth' | 'tutoring';
  consentedAt: string;
}

const CONSENT_STORAGE_KEY = 'meetit_consent_records_v1';

function loadConsentRecords(roomCode: string): ConsentRecord[] {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as ConsentRecord[];
    return Array.isArray(all)
      ? all.filter((r) => r.roomCode.toUpperCase() === roomCode.toUpperCase())
      : [];
  } catch {
    return [];
  }
}

export function TelehealthSessionModal({
  roomCode,
  ownerId,
  selfDisplayName,
  onOpenWhiteboard,
  onClose,
  onToast,
}: TelehealthSessionModalProps) {
  const [mode, setMode] = useState<'telehealth' | 'tutoring'>('telehealth');
  const [participantName, setParticipantName] = useState(selfDisplayName);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consents, setConsents] = useState<ConsentRecord[]>(() =>
    loadConsentRecords(roomCode),
  );

  const [sectionA, setSectionA] = useState('');
  const [sectionB, setSectionB] = useState('');
  const [sectionC, setSectionC] = useState('');
  const [sectionD, setSectionD] = useState('');
  const [saving, setSaving] = useState(false);

  const handleRecordConsent = () => {
    if (!consentChecked || !participantName.trim()) {
      onToast('Please enter a name and accept the session consent.');
      return;
    }
    const record: ConsentRecord = {
      id: `con-${Date.now()}`,
      roomCode,
      participantName: participantName.trim(),
      mode,
      consentedAt: new Date().toISOString(),
    };
    try {
      const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      const existing = raw ? (JSON.parse(raw) as ConsentRecord[]) : [];
      const next = [record, ...(Array.isArray(existing) ? existing : [])];
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota
    }
    setConsents((prev) => [record, ...prev]);
    onToast('Digital session consent recorded.');
  };

  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const labels =
      mode === 'telehealth'
        ? ['Subjective', 'Objective', 'Assessment', 'Plan']
        : ['Learning Goals', 'Topics Covered', 'Exercises', 'Homework'];
    const summary = [
      `${labels[0]}: ${sectionA || '-'}`,
      `${labels[1]}: ${sectionB || '-'}`,
      `${labels[2]}: ${sectionC || '-'}`,
      `${labels[3]}: ${sectionD || '-'}`,
    ].join('\n');

    await saveOrUpdateMeetingNote({
      ownerId,
      roomCode,
      meetingTitle:
        mode === 'telehealth'
          ? `Telehealth Session (${roomCode})`
          : `Tutoring Session (${roomCode})`,
      meetingDate: new Date().toISOString(),
      attendees: [selfDisplayName],
      content: summary,
      summary,
      tags: [mode],
    });
    setSaving(false);
    onToast('Structured session notes saved to Notes Hub.');
  };

  const labels =
    mode === 'telehealth'
      ? ['Subjective', 'Objective', 'Assessment', 'Plan']
      : ['Learning Goals', 'Topics Covered', 'Practice / Feedback', 'Homework'];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Telehealth and Tutoring"
      data-testid="telehealth-modal"
    >
      <div
        className="modal-card"
        style={{
          width: 'min(760px, 95vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
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
            <HeartPulse size={20} />
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              Telehealth &amp; Tutoring · {roomCode}
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close Telehealth and Tutoring"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={mode === 'telehealth' ? 'btn primary' : 'btn'}
              onClick={() => setMode('telehealth')}
            >
              Telehealth (SOAP)
            </button>
            <button
              type="button"
              className={mode === 'tutoring' ? 'btn primary' : 'btn'}
              onClick={() => setMode('tutoring')}
            >
              Tutoring (Lesson Plan)
            </button>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              onOpenWhiteboard();
            }}
            data-testid="telehealth-open-whiteboard-btn"
          >
            <PenTool size={14} />
            <span>Open Whiteboard</span>
          </button>
        </div>

        {/* Consent Flow */}
        <section
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
          data-testid="telehealth-consent-section"
        >
          <strong>Digital Session Consent (Free · Payments deferred)</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="Participant full name"
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              className="btn primary"
              onClick={handleRecordConsent}
              data-testid="record-consent-btn"
            >
              Record Consent
            </button>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
            />
            <span>
              I consent to this {mode} video session and confidential session
              note-taking.
            </span>
          </label>
          {consents.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {consents.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <CheckCircle2 size={13} />
                  <span>
                    {c.participantName} consented ({c.mode}) ·{' '}
                    {new Date(c.consentedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Structured Session Notes */}
        <form
          onSubmit={handleSaveNotes}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <strong>
            {mode === 'telehealth'
              ? 'Clinical SOAP Session Notes'
              : 'Tutoring Lesson Notes'}
          </strong>
          {[
            [labels[0]!, sectionA, setSectionA],
            [labels[1]!, sectionB, setSectionB],
            [labels[2]!, sectionC, setSectionC],
            [labels[3]!, sectionD, setSectionD],
          ].map(([label, val, setter]) => (
            <label
              key={label as string}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 13,
              }}
            >
              <span>{label as string}</span>
              <textarea
                rows={2}
                value={val as string}
                onChange={(e) =>
                  (setter as React.Dispatch<React.SetStateAction<string>>)(
                    e.target.value,
                  )
                }
              />
            </label>
          ))}
          <div>
            <button
              type="submit"
              className="btn primary"
              disabled={saving}
              data-testid="save-telehealth-notes-btn"
            >
              {saving ? 'Saving…' : 'Save Session Notes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
