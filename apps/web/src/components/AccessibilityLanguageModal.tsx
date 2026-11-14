import React, { useEffect, useState } from 'react';
import {
  Languages,
  Subtitles,
  Headphones,
  MessageSquareLock,
  Pin,
  X,
} from 'lucide-react';

export interface AccessibilityLanguageModalProps {
  roomCode: string;
  selfDisplayName: string;
  participants: Array<{ id: string; displayName: string }>;
  activeListenChannel: string;
  onSelectListenChannel: (channelId: string, label: string) => void;
  onPinInterpreter: (peerId: string | null) => void;
  onEmitCaption: (text: string, author: string) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

interface AccessibilityState {
  interpreterChannels: Array<{
    id: string;
    language: string;
    interpreterName: string;
    active: boolean;
  }>;
  localLanguageCode: string;
  pinnedInterpreterId?: string | undefined;
  cartLines: Array<{ id: string; author: string; text: string; ts: string }>;
  whispers: Array<{
    id: string;
    from: string;
    to: string;
    text: string;
    ts: string;
  }>;
}

const LOCAL_LANGUAGES = [
  { code: 'yo-NG', label: 'Yoruba (Nigeria)' },
  { code: 'ig-NG', label: 'Igbo (Nigeria)' },
  { code: 'ha-NG', label: 'Hausa (Nigeria)' },
  { code: 'sw-KE', label: 'Swahili (East Africa)' },
  { code: 'am-ET', label: 'Amharic (Ethiopia)' },
  { code: 'zu-ZA', label: 'Zulu (South Africa)' },
  { code: 'tw-GH', label: 'Twi / Akan (Ghana)' },
  { code: 'wo-SN', label: 'Wolof (Senegal)' },
];

export function AccessibilityLanguageModal({
  roomCode,
  selfDisplayName,
  participants,
  activeListenChannel,
  onSelectListenChannel,
  onPinInterpreter,
  onEmitCaption,
  onClose,
  onToast,
}: AccessibilityLanguageModalProps) {
  const baseUrl =
    (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.replace(
      /\/$/,
      '',
    ) ?? 'http://localhost:4000';

  const [tab, setTab] = useState<'channels' | 'local' | 'cart' | 'whisper'>(
    'channels',
  );
  const [state, setState] = useState<AccessibilityState>({
    interpreterChannels: [
      {
        id: 'ch-fr',
        language: 'French',
        interpreterName: 'Floor / Auto',
        active: true,
      },
      {
        id: 'ch-es',
        language: 'Spanish',
        interpreterName: 'Floor / Auto',
        active: true,
      },
    ],
    localLanguageCode: 'yo-NG',
    cartLines: [],
    whispers: [],
  });

  const [newChannelLang, setNewChannelLang] = useState('');
  const [cartDraft, setCartDraft] = useState('');
  const [whisperTarget, setWhisperTarget] = useState(
    () => participants[0]?.displayName || 'Participant',
  );
  const [whisperDraft, setWhisperDraft] = useState('');

  const postUpdate = async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch(
        `${baseUrl}/rooms/${encodeURIComponent(roomCode)}/accessibility`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          accessibility: AccessibilityState;
        };
        setState(data.accessibility);
      }
    } catch {
      // offline fallback
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch(`${baseUrl}/rooms/${encodeURIComponent(roomCode)}/accessibility`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.accessibility) {
          setState(data.accessibility);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [baseUrl, roomCode]);

  const myWhispers = state.whispers.filter(
    (w) =>
      w.from.toLowerCase() === selfDisplayName.toLowerCase() ||
      w.to.toLowerCase() === selfDisplayName.toLowerCase(),
  );

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Accessibility and Language"
      data-testid="accessibility-language-modal"
    >
      <div
        className="modal-card profile-section-card"
        style={{
          width: 'min(780px, 95vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
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
            <Languages size={20} />
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              Accessibility &amp; Language · {roomCode}
            </h2>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close Accessibility and Language"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={tab === 'channels' ? 'btn primary' : 'btn'}
            onClick={() => setTab('channels')}
          >
            <Headphones size={14} />
            <span>Interpreter Channels</span>
          </button>
          <button
            type="button"
            className={tab === 'local' ? 'btn primary' : 'btn'}
            onClick={() => setTab('local')}
          >
            <Languages size={14} />
            <span>Local-Language STT</span>
          </button>
          <button
            type="button"
            className={tab === 'cart' ? 'btn primary' : 'btn'}
            onClick={() => setTab('cart')}
          >
            <Subtitles size={14} />
            <span>CART &amp; Sign Slot</span>
          </button>
          <button
            type="button"
            className={tab === 'whisper' ? 'btn primary' : 'btn'}
            onClick={() => setTab('whisper')}
          >
            <MessageSquareLock size={14} />
            <span>Whisper Mode</span>
          </button>
        </div>

        {/* Tab 1: Human Interpreter Channels */}
        {tab === 'channels' && (
          <div
            className="profile-edit-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="field">
              <label>Listen-in audio channel</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={
                    activeListenChannel === 'floor' ? 'btn primary' : 'btn'
                  }
                  onClick={() => {
                    onSelectListenChannel('floor', 'Original Floor Audio');
                    onToast('Listening to Original Floor Audio.');
                  }}
                >
                  Original Floor Audio
                </button>
                {state.interpreterChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    className={
                      activeListenChannel === ch.id ? 'btn primary' : 'btn'
                    }
                    onClick={() => {
                      onSelectListenChannel(
                        ch.id,
                        `${ch.language} (${ch.interpreterName})`,
                      );
                      onToast(
                        `Listening to ${ch.language} interpreter channel.`,
                      );
                    }}
                  >
                    {ch.language} · {ch.interpreterName}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="new-interp-lang">Add interpreter channel</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="new-interp-lang"
                  type="text"
                  value={newChannelLang}
                  onChange={(e) => setNewChannelLang(e.target.value)}
                  placeholder="Language (e.g. Yoruba, Portuguese, Arabic)"
                />
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    if (!newChannelLang.trim()) return;
                    void postUpdate({
                      addChannel: {
                        language: newChannelLang.trim(),
                        interpreterName: selfDisplayName,
                      },
                    });
                    setNewChannelLang('');
                    onToast('Interpreter channel added.');
                  }}
                >
                  Open Channel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Local-Language Captions */}
        {tab === 'local' && (
          <div
            className="profile-edit-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="field">
              <label htmlFor="local-stt-select">
                Under-served / local-language STT model
              </label>
              <select
                id="local-stt-select"
                value={state.localLanguageCode}
                onChange={(e) => {
                  const code = e.target.value;
                  setState((prev) => ({ ...prev, localLanguageCode: code }));
                  void postUpdate({ localLanguageCode: code });
                  onToast(`Local-language STT set to ${code}.`);
                }}
              >
                {LOCAL_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} [{l.code}]
                  </option>
                ))}
              </select>
            </div>
            <p className="profile-card-sub" style={{ margin: 0 }}>
              Configures live speech recognition &amp; specialist local-language
              STT routing for captions in {state.localLanguageCode}.
            </p>
          </div>
        )}

        {/* Tab 3: CART & Sign-Interpreter Slots */}
        {tab === 'cart' && (
          <div
            className="profile-edit-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div className="field">
              <label htmlFor="sign-interp-select">
                Pinned sign-language interpreter slot
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  id="sign-interp-select"
                  value={state.pinnedInterpreterId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    setState((prev) => ({
                      ...prev,
                      pinnedInterpreterId: id || undefined,
                    }));
                    void postUpdate({ pinnedInterpreterId: id });
                    onPinInterpreter(id || null);
                  }}
                >
                  <option value="">None</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--muted)',
                  }}
                >
                  <Pin size={13} /> Pinned
                </span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!cartDraft.trim()) return;
                const text = cartDraft.trim();
                void postUpdate({
                  cartLine: { author: selfDisplayName, text },
                });
                onEmitCaption(text, `${selfDisplayName} (CART)`);
                setCartDraft('');
              }}
              className="field"
            >
              <label htmlFor="cart-caption-input">
                Live human captioner (CART) input
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="cart-caption-input"
                  type="text"
                  value={cartDraft}
                  onChange={(e) => setCartDraft(e.target.value)}
                  placeholder="Type live verbatim caption for the room…"
                />
                <button type="submit" className="btn primary">
                  Send Caption
                </button>
              </div>
            </form>

            {state.cartLines.length > 0 && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  maxHeight: 140,
                  overflowY: 'auto',
                  fontSize: 13,
                }}
              >
                {state.cartLines.map((line) => (
                  <div key={line.id}>
                    <strong>{line.author}:</strong> {line.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Whisper Mode */}
        {tab === 'whisper' && (
          <div
            className="profile-edit-form"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="field">
              <label htmlFor="whisper-target">Private whisper recipient</label>
              <select
                id="whisper-target"
                value={whisperTarget}
                onChange={(e) => setWhisperTarget(e.target.value)}
              >
                {participants.length === 0 ? (
                  <option value="Participant">Participant</option>
                ) : (
                  participants.map((p) => (
                    <option key={p.id} value={p.displayName}>
                      {p.displayName}
                    </option>
                  ))
                )}
              </select>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!whisperDraft.trim()) return;
                void postUpdate({
                  whisper: {
                    from: selfDisplayName,
                    to: whisperTarget,
                    text: whisperDraft.trim(),
                  },
                });
                setWhisperDraft('');
                onToast(`Private whisper sent to ${whisperTarget}.`);
              }}
              className="field"
            >
              <label htmlFor="whisper-text">
                Private side message (only visible to you &amp; {whisperTarget})
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="whisper-text"
                  type="text"
                  value={whisperDraft}
                  onChange={(e) => setWhisperDraft(e.target.value)}
                  placeholder="Private coaching or interpreter cue…"
                />
                <button type="submit" className="btn primary">
                  Whisper
                </button>
              </div>
            </form>

            {myWhispers.length > 0 && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  maxHeight: 140,
                  overflowY: 'auto',
                  fontSize: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {myWhispers.map((w) => (
                  <div key={w.id}>
                    <strong>
                      {w.from} → {w.to}:
                    </strong>{' '}
                    {w.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
