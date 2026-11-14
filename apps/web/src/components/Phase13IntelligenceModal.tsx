import React, { useState } from 'react';
import type { SignalingEvents } from '@meetit/protocol';
import {
  computeOnDeviceEngagement,
  computeProximityAudioGain,
  triggerHapticCue,
} from '@meetit/media';

type Nudge = SignalingEvents['moderator.nudge'];
type Stats = SignalingEvents['moderator.stats'];

interface Phase13IntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  isHostOrCohost: boolean;
  selfDisplayName: string;
  selfId: string;
  nudges: Nudge[];
  stats: Stats | null;
  spacePositions: Record<string, { x: number; y: number }>;
  translatorLang: string;
  hapticsEnabled: boolean;
  simplifiedMode: boolean;
  engagementOptIn: boolean;
  onMoveInSpace: (x: number, y: number) => void;
  onChangeTranslatorLang: (lang: string) => void;
  onToggleHaptics: (enabled: boolean) => void;
  onToggleSimplifiedMode: (enabled: boolean) => void;
  onToggleEngagementOptIn: (enabled: boolean) => void;
  onConfigureModerator: (enabled: boolean) => void;
  onParkTangent: (text: string) => void;
  onDismissNudge: (id: string) => void;
  onToast: (msg: string) => void;
}

function getSignalingHttpBase(): string {
  const wsUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8787';
  return wsUrl
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/$/, '');
}

export const Phase13IntelligenceModal: React.FC<
  Phase13IntelligenceModalProps
> = ({
  isOpen,
  onClose,
  roomCode,
  isHostOrCohost,
  selfDisplayName,
  selfId,
  nudges,
  stats,
  spacePositions,
  translatorLang,
  hapticsEnabled,
  simplifiedMode,
  engagementOptIn,
  onMoveInSpace,
  onChangeTranslatorLang,
  onToggleHaptics,
  onToggleSimplifiedMode,
  onToggleEngagementOptIn,
  onConfigureModerator,
  onParkTangent,
  onDismissNudge,
  onToast,
}) => {
  const [tab, setTab] = useState<'moderator' | 'artifacts' | 'proxy' | 'tier2'>(
    'moderator',
  );
  const [tangentInput, setTangentInput] = useState('');

  // Artifacts state
  const [artifactMode, setArtifactMode] = useState<
    'spec' | 'tickets' | 'pr_draft' | 'follow_up_agenda'
  >('spec');
  const [artifactMarkdown, setArtifactMarkdown] = useState('');
  const [loadingArtifact, setLoadingArtifact] = useState(false);

  // AI Proxy state
  const [proxyTopics, setProxyTopics] = useState('release, schedule, api');
  const [proxyFact, setProxyFact] = useState('v2.1 ships Friday 14:00 UTC.');
  const [activeProxyId, setActiveProxyId] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<
    Array<{
      askedBy: string;
      question: string;
      response: string;
      escalated: boolean;
    }>
  >([]);

  if (!isOpen) return null;

  const baseUrl = getSignalingHttpBase();

  const handleGenerateArtifact = async () => {
    setLoadingArtifact(true);
    try {
      const res = await fetch(`${baseUrl}/rooms/${roomCode}/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: artifactMode }),
      });
      const data = (await res.json()) as { markdown?: string };
      setArtifactMarkdown(data.markdown ?? 'No output generated.');
    } catch {
      onToast('Failed to generate meeting artifact.');
    } finally {
      setLoadingArtifact(false);
    }
  };

  const handleSpawnProxy = async () => {
    try {
      const allowedTopics = proxyTopics
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`${baseUrl}/rooms/${roomCode}/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerDisplayName: selfDisplayName,
          allowedTopics,
          contextFacts: { [allowedTopics[0] ?? 'general']: proxyFact },
        }),
      });
      const data = (await res.json()) as { id?: string; displayName?: string };
      if (data.id) {
        setActiveProxyId(data.id);
        onToast(`${data.displayName ?? 'AI Proxy'} joined room.`);
      }
    } catch {
      onToast('Failed to spawn AI proxy.');
    }
  };

  const handleRefreshDebrief = async () => {
    if (!activeProxyId) return;
    try {
      const res = await fetch(
        `${baseUrl}/rooms/${roomCode}/proxy/${activeProxyId}/debrief`,
      );
      const data = (await res.json()) as {
        debrief?: Array<{
          askedBy: string;
          question: string;
          response: string;
          escalated: boolean;
        }>;
      };
      setDebrief(data.debrief ?? []);
    } catch {
      onToast('Failed to load proxy debrief.');
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Room Intelligence"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 14, 23, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--surface-1, #131926)',
          color: 'var(--text-primary, #f1f5f9)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          width: '100%',
          maxWidth: 680,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <strong>Room Intelligence (Phase 13)</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              ['moderator', 'Moderator & Agenda'],
              ['artifacts', 'Spec / Tickets / PR'],
              ['proxy', 'AI Proxy'],
              ['tier2', 'Space / Translate / A11y'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.14)',
                background:
                  tab === id ? 'var(--accent, #3b82f6)' : 'transparent',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          style={{ padding: 18, overflowY: 'auto', display: 'grid', gap: 14 }}
        >
          {tab === 'moderator' && (
            <>
              {isHostOrCohost && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 13 }}>
                    Moderator Agent:{' '}
                    <strong>
                      {stats?.enabled !== false ? 'Active' : 'Paused'}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onConfigureModerator(stats?.enabled === false)
                    }
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {stats?.enabled !== false ? 'Pause Agent' : 'Enable Agent'}
                  </button>
                </div>
              )}

              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                  Talk-Time Balance
                </div>
                {stats && Object.keys(stats.talkTimeByPeer).length > 0 ? (
                  Object.entries(stats.talkTimeByPeer).map(([id, entry]) => (
                    <div key={id} style={{ marginBottom: 6, fontSize: 13 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{entry.displayName}</span>
                        <span>
                          {entry.seconds}s ({entry.sharePct}%)
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: 4,
                          overflow: 'hidden',
                          marginTop: 2,
                        }}
                      >
                        <div
                          style={{
                            width: `${entry.sharePct}%`,
                            height: '100%',
                            background: 'var(--accent, #3b82f6)',
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.6 }}>
                    Waiting for finalized captions to compute speaker share.
                  </div>
                )}
              </div>

              {isHostOrCohost && (
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                    Park Agenda Tangent to Notes
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={tangentInput}
                      onChange={(e) => setTangentInput(e.target.value)}
                      placeholder="e.g. Revisit SSO pricing next sprint"
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.18)',
                        background: 'rgba(0,0,0,0.25)',
                        color: '#fff',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!tangentInput.trim()) return;
                        onParkTangent(tangentInput.trim());
                        setTangentInput('');
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent, #3b82f6)',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      Park
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                  Host Nudges ({nudges.length})
                </div>
                {nudges.length === 0 ? (
                  <div style={{ fontSize: 13, opacity: 0.6 }}>
                    No active nudges.
                  </div>
                ) : (
                  nudges.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)',
                        marginBottom: 8,
                        fontSize: 13,
                      }}
                    >
                      <div>{n.message}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        {n.suggestedAction === 'park_tangent' && (
                          <button
                            type="button"
                            onClick={() => {
                              onParkTangent(n.message);
                              onDismissNudge(n.id);
                            }}
                            style={{ fontSize: 12, cursor: 'pointer' }}
                          >
                            Park to Notes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDismissNudge(n.id)}
                          style={{ fontSize: 12, cursor: 'pointer' }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {tab === 'artifacts' && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={artifactMode}
                  onChange={(e) =>
                    setArtifactMode(e.target.value as typeof artifactMode)
                  }
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.35)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <option value="spec">Technical Spec / RFC</option>
                  <option value="tickets">Ticket Tree</option>
                  <option value="pr_draft">PR Draft</option>
                  <option value="follow_up_agenda">Follow-up Agenda</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleGenerateArtifact()}
                  disabled={loadingArtifact}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent, #3b82f6)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {loadingArtifact ? 'Generating…' : 'Generate'}
                </button>
                {artifactMarkdown && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(artifactMarkdown);
                      onToast('Markdown copied to clipboard.');
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Copy Markdown
                  </button>
                )}
              </div>
              {artifactMarkdown && (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    background: 'rgba(0,0,0,0.35)',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 12,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  {artifactMarkdown}
                </pre>
              )}
            </>
          )}

          {tab === 'proxy' && (
            <>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>
                  Allowed Topics (comma-separated)
                </label>
                <input
                  value={proxyTopics}
                  onChange={(e) => setProxyTopics(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(0,0,0,0.25)',
                    color: '#fff',
                  }}
                />
                <label style={{ fontSize: 12, opacity: 0.8 }}>
                  Approved Context Fact
                </label>
                <input
                  value={proxyFact}
                  onChange={(e) => setProxyFact(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(0,0,0,0.25)',
                    color: '#fff',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void handleSpawnProxy()}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--accent, #3b82f6)',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Spawn AI Proxy
                  </button>
                  {activeProxyId && (
                    <button
                      type="button"
                      onClick={() => void handleRefreshDebrief()}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      Refresh Debrief
                    </button>
                  )}
                </div>
              </div>
              {debrief.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {debrief.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)',
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <strong>{d.askedBy}:</strong> {d.question}
                      </div>
                      <div style={{ opacity: 0.85, marginTop: 4 }}>
                        {d.escalated ? '⚠️ Escalated: ' : '✅ '}
                        {d.response}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'tier2' && (
            <>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                  Persistent Virtual Space (Click to move your avatar — SFU
                  pauses distant video)
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.round(
                      ((e.clientX - rect.left) / rect.width) * 600,
                    );
                    const y = Math.round(
                      ((e.clientY - rect.top) / rect.height) * 300,
                    );
                    onMoveInSpace(x, y);
                  }}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: 180,
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(255,255,255,0.16)',
                    cursor: 'crosshair',
                    overflow: 'hidden',
                  }}
                >
                  {Object.entries(spacePositions).map(([id, pos]) => {
                    const selfPos = spacePositions[selfId] ?? {
                      x: 300,
                      y: 150,
                    };
                    const prox = computeProximityAudioGain(selfPos, pos);
                    const isSelf = id === selfId;
                    return (
                      <div
                        key={id}
                        title={`${isSelf ? 'You' : id} (${Math.round(prox.gain * 100)}% audio)`}
                        style={{
                          position: 'absolute',
                          left: `${(pos.x / 600) * 100}%`,
                          top: `${(pos.y / 300) * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: isSelf
                            ? '#3b82f6'
                            : prox.videoVisible
                              ? '#10b981'
                              : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {isSelf ? 'YOU' : 'P'}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 13 }}>
                  Universal Translator Language
                </span>
                <select
                  value={translatorLang}
                  onChange={(e) => onChangeTranslatorLang(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.35)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <option value="en">English (Original)</option>
                  <option value="es">Spanish (ES)</option>
                  <option value="fr">French (FR)</option>
                  <option value="de">German (DE)</option>
                  <option value="pt">Portuguese (PT)</option>
                  <option value="ja">Japanese (JA)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={hapticsEnabled}
                    onChange={(e) => {
                      onToggleHaptics(e.target.checked);
                      if (e.target.checked) triggerHapticCue('nudge');
                    }}
                  />
                  Accessibility: Haptic cues on speaker change &amp; nudges
                </label>

                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={simplifiedMode}
                    onChange={(e) => onToggleSimplifiedMode(e.target.checked)}
                  />
                  Accessibility: Cognitive-load simplified mode
                </label>

                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={engagementOptIn}
                    onChange={(e) => onToggleEngagementOptIn(e.target.checked)}
                  />
                  Opt-in On-Device Engagement Analytics (local-only, zero video
                  sent)
                </label>
              </div>

              {engagementOptIn && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.06)',
                    fontSize: 12,
                  }}
                >
                  On-Device Engagement:{' '}
                  <strong>
                    {
                      computeOnDeviceEngagement({
                        speakingMs:
                          (stats?.talkTimeByPeer[selfId]?.seconds ?? 0) * 1000,
                        windowMs: 60_000,
                        captionTurns: 2,
                        cameraActive: true,
                      }).score
                    }
                    /100
                  </strong>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
