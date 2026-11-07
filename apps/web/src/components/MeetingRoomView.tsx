import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  MeshTransport,
  type BandwidthMode,
  type ConnectionState,
  type NetworkQualityBars,
  type NetworkQualityLevel,
  type PeerNetworkStats,
} from '@meetit/media';
import type {
  PeerInfo,
  PeerRole,
  PeerState,
  ReactionEmoji,
  RoomPermissions,
  WaitingPeer,
} from '@meetit/protocol';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import {
  MicIcon,
  VidIcon,
  ScrIcon,
  EndIcon,
  LnkIcon,
  CheckIcon,
  SunIcon,
  MoonIcon,
  SetIcon,
  CloseIcon,
  InfoIcon,
  UsrIcon,
  SwapIcon,
  PanelRightIcon,
} from './Icons';
import {
  acquireDisplayMedia,
  acquireUserMedia,
  createMicLevelMonitor,
  enumerateMediaDevices,
  loadDevicePreferences,
  saveDevicePreferences,
  subscribeDeviceChanges,
  type DeviceChoice,
  type EnumeratedDevices,
  type MediaErrorKind,
} from '../lib/devices';
import { computeLayout, MESH_MAX_PARTICIPANTS } from '../lib/layout';
import {
  createMultiPeerSpeakerMonitor,
  playCallChime,
} from '../lib/activeSpeaker';
import {
  SignalingClient,
  inspectRoomViaApi,
  requestGuestTokenViaApi,
} from '../lib/signalingClient';
import {
  findRoomMetadataByCode,
  recordCompletedMeetingSession,
  type MeetingAttendeeRecord,
} from '../lib/meetingsStore';
import { ensureNoteForCompletedMeeting } from '../lib/notesStore';
import {
  recordCallJoinAttempt,
  recordCallJoinSuccess,
  recordCallJoinFailure,
} from '../lib/telemetry';
import {
  runPreCallDiagnosticsProbe,
  type PreCallDiagnosticsReport,
} from '../lib/DiagnosticsProbe';
import {
  attachSafeMediaElement,
  detectBrowserPlatform,
  hasEndedMediaTracks,
  REAL_DEVICE_TEST_MATRIX,
} from '../lib/safariIosWorkarounds';
import { copyToClipboard, type AuthUser } from '../types';
import { BackendStatusIndicator } from './BackendStatusIndicator';

interface MeetingRoomViewProps {
  roomCode: string;
  user: AuthUser | null;
  currentTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLeaveCall: (roomCode: string) => void;
  onNavigateHome: () => void;
  onToast: (message: string) => void;
}

interface RemoteParticipant extends PeerInfo {
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  connectionStatus: ConnectionState;
}

interface ChatItem {
  id: string;
  seq?: number;
  from: string;
  displayName: string;
  text: string;
  ts: number;
}

interface FloatingReaction {
  id: string;
  displayName: string;
  emoji: ReactionEmoji;
}

const DISPLAY_NAME_STORAGE_KEY = 'meetit_guest_display_name';
const MIRROR_SELF_STORAGE_KEY = 'meetit_mirror_self_view';
const CALL_SOUNDS_STORAGE_KEY = 'meetit_call_sounds_enabled';
const BANDWIDTH_MODE_STORAGE_KEY = 'meetit_bandwidth_mode';
const REACTION_EMOJIS: ReactionEmoji[] = ['👍', '👏', '❤️', '🎉', '😂', '😮'];

function NetworkBarsBadge({
  bars,
  level,
  rttMs,
  packetLossPct,
  bitrateKbps,
}: {
  bars: NetworkQualityBars;
  level: NetworkQualityLevel;
  rttMs?: number | null | undefined;
  packetLossPct?: number | undefined;
  bitrateKbps?: number | undefined;
}) {
  const label =
    level === 'excellent'
      ? 'Excellent connection'
      : level === 'good'
        ? 'Good connection'
        : level === 'fair'
          ? 'Fair connection'
          : 'Poor connection';
  const details: string[] = [label];
  if (rttMs !== undefined && rttMs !== null) {
    details.push(`RTT ${rttMs} ms`);
  }
  if (packetLossPct !== undefined && packetLossPct > 0) {
    details.push(`Loss ${packetLossPct.toFixed(1)}%`);
  }
  if (bitrateKbps !== undefined && bitrateKbps > 0) {
    details.push(`${bitrateKbps} kbps`);
  }
  const titleText = details.join(' · ');

  return (
    <span
      className={`network-bars-badge level-${level}`}
      title={titleText}
      aria-label={titleText}
      data-testid="network-bars-badge"
      data-bars={bars}
    >
      {[1, 2, 3, 4].map((idx) => (
        <span
          key={idx}
          className={`net-bar bar-${idx} ${idx <= bars ? 'lit' : ''}`}
        />
      ))}
    </span>
  );
}

function RemoteVideoTile({
  participant,
  stats,
  audioOnlyMode,
  isSpeaking,
  isPinned,
  canModerate,
  isFloating = false,
  pipCorner = 'bottom-right',
  dragOffset = null,
  onPipPointerDown,
  onPipPointerMove,
  onPipPointerUp,
  onPipPointerCancel,
  onPipSwap,
  onTogglePin,
  onMutePeer,
  onAskUnmutePeer,
  onRemovePeer,
  onAudioAutoplayBlocked,
  onToast,
}: {
  participant: RemoteParticipant;
  stats?: PeerNetworkStats | undefined;
  audioOnlyMode: boolean;
  isSpeaking: boolean;
  isPinned: boolean;
  canModerate: boolean;
  isFloating?: boolean | undefined;
  pipCorner?:
    'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | undefined;
  dragOffset?: { x: number; y: number } | null | undefined;
  onPipPointerDown?:
    ((e: React.PointerEvent<HTMLDivElement>) => void) | undefined;
  onPipPointerMove?:
    ((e: React.PointerEvent<HTMLDivElement>) => void) | undefined;
  onPipPointerUp?:
    ((e: React.PointerEvent<HTMLDivElement>) => void) | undefined;
  onPipPointerCancel?:
    ((e: React.PointerEvent<HTMLDivElement>) => void) | undefined;
  onPipSwap?: (() => void) | undefined;
  onTogglePin: () => void;
  onMutePeer: () => void;
  onAskUnmutePeer: () => void;
  onRemovePeer: () => void;
  onAudioAutoplayBlocked: () => void;
  onToast: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    attachSafeMediaElement(el, participant.stream, {
      muted: false,
      onAutoplayBlocked: onAudioAutoplayBlocked,
    });
  }, [participant.stream, onAudioAutoplayBlocked]);

  const hasVideo =
    !audioOnlyMode &&
    participant.state.video &&
    participant.stream &&
    participant.stream.getVideoTracks().length > 0;

  const initial = (participant.displayName[0] || 'G').toUpperCase();
  const netBars: NetworkQualityBars =
    stats?.bars ??
    (participant.connectionStatus === 'reconnecting'
      ? 2
      : participant.connectionStatus === 'failed'
        ? 1
        : 4);
  const netLevel: NetworkQualityLevel =
    stats?.quality ??
    (participant.connectionStatus === 'reconnecting'
      ? 'fair'
      : participant.connectionStatus === 'failed'
        ? 'poor'
        : 'excellent');

  const handleTogglePip = async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.pictureInPictureElement === el) {
        await document.exitPictureInPicture();
      } else if (typeof el.requestPictureInPicture === 'function') {
        await el.requestPictureInPicture();
      } else {
        onToast('Picture-in-Picture is not supported in this browser.');
      }
    } catch {
      onToast('Could not enter Picture-in-Picture.');
    }
  };

  return (
    <div
      className={`call-tile remote-tile ${isSpeaking ? 'active-speaker-ring' : ''} ${isPinned ? 'pinned-tile' : ''} ${!hasVideo ? 'camera-off-studio' : ''} ${
        isFloating
          ? `pip-floating-tile corner-${pipCorner} ${dragOffset ? 'dragging' : ''}`
          : ''
      }`}
      style={
        isFloating && dragOffset
          ? {
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
            }
          : undefined
      }
      onPointerDown={isFloating ? onPipPointerDown : undefined}
      onPointerMove={isFloating ? onPipPointerMove : undefined}
      onPointerUp={isFloating ? onPipPointerUp : undefined}
      onPointerCancel={isFloating ? onPipPointerCancel : undefined}
      data-testid="remote-tile"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`tile-video ${hasVideo ? 'visible' : 'hidden'}`}
      />
      {!hasVideo && (
        <div className="tile-avatar-fallback">
          <div className={`tile-avatar-ring ${isSpeaking ? 'speaking' : ''}`}>
            <div className="tile-avatar-circle">{initial}</div>
          </div>
          {audioOnlyMode && participant.state.video && !isFloating && (
            <small className="audio-only-tile-note">
              Audio-only mode active
            </small>
          )}
        </div>
      )}

      {isFloating && onPipSwap && (
        <button
          type="button"
          className="pip-swap-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPipSwap();
          }}
          aria-label="Swap video views"
          title="Swap video views"
        >
          <SwapIcon />
        </button>
      )}

      {/* Top-right tile quick actions: Pin, PiP, Moderation, Hand Raised */}
      <div className="tile-top-bar">
        <div className="tile-badges-left">
          {participant.state.handRaised && (
            <span
              className="hand-raised-pill"
              title={`${participant.displayName} raised their hand`}
            >
              ✋ Hand raised
            </span>
          )}
          {participant.state.screen && (
            <span className="screen-pill">Sharing screen</span>
          )}
        </div>

        <div className="tile-hover-actions">
          {canModerate && (
            <>
              {participant.state.audio ? (
                <button
                  type="button"
                  className="tile-icon-btn"
                  onClick={onMutePeer}
                  title={`Mute ${participant.displayName}`}
                >
                  Mute
                </button>
              ) : (
                <button
                  type="button"
                  className="tile-icon-btn"
                  onClick={onAskUnmutePeer}
                  title={`Ask ${participant.displayName} to unmute`}
                >
                  Ask unmute
                </button>
              )}
              <button
                type="button"
                className="tile-icon-btn"
                onClick={onRemovePeer}
                title={`Remove ${participant.displayName}`}
              >
                Remove
              </button>
            </>
          )}
          <button
            type="button"
            className={`tile-icon-btn ${isPinned ? 'active' : ''}`}
            onClick={onTogglePin}
            title={isPinned ? 'Unpin participant' : 'Pin participant'}
            aria-label={isPinned ? 'Unpin participant' : 'Pin participant'}
          >
            {isPinned ? 'Unpin' : 'Pin'}
          </button>
          {hasVideo && (
            <button
              type="button"
              className="tile-icon-btn"
              onClick={() => void handleTogglePip()}
              title="Picture-in-Picture"
              aria-label="Toggle Picture-in-Picture"
            >
              PiP
            </button>
          )}
        </div>
      </div>

      <div className="tile-meta-bar">
        <div className="tile-name-badge">
          <span>{participant.displayName}</span>
          {participant.role === 'host' && (
            <span className="role-pill">Host</span>
          )}
          {participant.role === 'cohost' && (
            <span className="role-pill">Cohost</span>
          )}
          {participant.verified || participant.role !== 'guest' ? (
            <span
              className="role-pill verified-tile-pill"
              title="Verified account"
            >
              ✓ Verified
            </span>
          ) : (
            <span className="role-pill guest-tile-pill" title="Guest attendee">
              Guest
            </span>
          )}
        </div>

        <div className="tile-status-icons">
          <NetworkBarsBadge
            bars={netBars}
            level={netLevel}
            rttMs={stats?.roundTripTimeMs}
            packetLossPct={stats ? stats.fractionLost * 100 : undefined}
            bitrateKbps={
              stats?.availableOutgoingBitrate
                ? Math.round(stats.availableOutgoingBitrate / 1000)
                : undefined
            }
          />
          {participant.connectionStatus === 'reconnecting' && (
            <span className="conn-pill warn">Reconnecting…</span>
          )}
          {!participant.state.audio && (
            <span
              className="muted-badge"
              title="Microphone muted"
              aria-label="Microphone muted"
            >
              Muted
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ScreenShareTile({
  stream,
  ownerName,
  isPinned,
  onTogglePin,
}: {
  stream: MediaStream;
  ownerName: string;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div
      className="call-tile screen-share-tile"
      data-testid="screen-share-tile"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="tile-video screen-video visible"
      />
      <div className="tile-top-bar">
        <span className="screen-pill">Screen share · {ownerName}</span>
        <div className="tile-hover-actions">
          <button
            type="button"
            className={`tile-icon-btn ${isPinned ? 'active' : ''}`}
            onClick={onTogglePin}
          >
            {isPinned ? 'Unpin screen' : 'Spotlight screen'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MeetingRoomView({
  roomCode,
  user,
  currentTheme,
  onToggleTheme,
  onLeaveCall,
  onNavigateHome,
  onToast,
}: MeetingRoomViewProps) {
  const localMeta = useMemo(() => findRoomMetadataByCode(roomCode), [roomCode]);
  const [stage, setStage] = useState<'lobby' | 'waiting_room' | 'call'>(
    'lobby',
  );
  const [selfRole, setSelfRole] = useState<PeerRole>(
    user ? 'attendee' : 'guest',
  );
  const [roomPermissions, setRoomPermissions] = useState<RoomPermissions>(
    () => ({
      waitingRoom: Boolean(localMeta?.waitingRoom),
      allowGuestChat: true,
      allowGuestScreenShare: true,
      allowGuestReactions: true,
    }),
  );
  const [waitingPeers, setWaitingPeers] = useState<WaitingPeer[]>([]);
  const [waitingRoomMessage, setWaitingRoomMessage] = useState<string>(
    'Waiting for the host to admit you…',
  );
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const [unmutePromptFrom, setUnmutePromptFrom] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>(() => {
    if (user?.displayName) return user.displayName;
    try {
      return window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  // Device preferences & lists
  const [prefs, setPrefs] = useState<DeviceChoice>(() =>
    loadDevicePreferences(),
  );
  const [devices, setDevices] = useState<EnumeratedDevices>({
    microphones: [],
    cameras: [],
    speakers: [],
  });

  // Local media & call state
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [mirrorSelfView, setMirrorSelfView] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(MIRROR_SELF_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [soundsEnabled, setSoundsEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CALL_SOUNDS_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [mediaErrorKind, setMediaErrorKind] = useState<MediaErrorKind | null>(
    null,
  );
  const [mediaErrorMsg, setMediaErrorMsg] = useState<string | null>(null);
  const [recoverySteps, setRecoverySteps] = useState<string[]>([]);
  const [isAcquiringMedia, setIsAcquiringMedia] = useState(false);

  // Room status & call state
  const [roomTitle, setRoomTitle] = useState<string>(
    () => localMeta?.title || `Room ${roomCode}`,
  );
  const [roomDescription, setRoomDescription] = useState<string>(
    () => localMeta?.description || '',
  );
  const [roomHasPasscode, setRoomHasPasscode] = useState<boolean>(() =>
    Boolean(localMeta?.passcode),
  );
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [roomPeerCount, setRoomPeerCount] = useState(0);
  const [roomLocked, setRoomLocked] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [connectionBanner, setConnectionBanner] = useState<{
    tone: 'warn' | 'ok' | 'danger';
    text: string;
  } | null>(null);

  // Panels, popovers, & spotlight state
  const [dismissedReadyCard, setDismissedReadyCard] = useState(false);
  const [showDevicePopover, setShowDevicePopover] = useState(false);
  const [showReactionPopover, setShowReactionPopover] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [pinnedTargetId, setPinnedTargetId] = useState<string | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.innerWidth < 768 || window.innerHeight > window.innerWidth
      : false,
  );

  // 1:1 Mobile Picture-in-Picture (WhatsApp style) state
  const [manualPipPreference, setManualPipPreference] = useState<
    boolean | null
  >(null);
  const [isPiPSwapped, setIsPiPSwapped] = useState(false);
  const [pipCorner, setPipCorner] = useState<
    'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  >('bottom-right');
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );
  const hasDraggedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const callStageRef = useRef<HTMLElement>(null);

  const handlePipPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
      hasDraggedRef.current = false;
      isDraggingRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // pointer capture fallback
      }
    },
    [],
  );

  const handlePipPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.clientX;
      const dy = e.clientY - dragStartRef.current.clientY;
      if (!hasDraggedRef.current && Math.hypot(dx, dy) > 8) {
        hasDraggedRef.current = true;
      }
      if (hasDraggedRef.current) {
        setDragOffset({ x: dx, y: dy });
      }
    },
    [],
  );

  const handlePipPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // pointer capture fallback
      }

      if (hasDraggedRef.current) {
        const stage = callStageRef.current;
        if (stage) {
          const rect = stage.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;
          const midY = rect.top + rect.height / 2;
          const isLeft = e.clientX < midX;
          const isTop = e.clientY < midY;
          if (isTop && isLeft) setPipCorner('top-left');
          else if (isTop && !isLeft) setPipCorner('top-right');
          else if (!isTop && isLeft) setPipCorner('bottom-left');
          else setPipCorner('bottom-right');
        }
      } else {
        // Tap/click: swap primary and secondary video views
        setIsPiPSwapped((prev) => !prev);
      }

      setDragOffset(null);
      hasDraggedRef.current = false;
      dragStartRef.current = null;
    },
    [],
  );

  const handlePipPointerCancel = useCallback(() => {
    isDraggingRef.current = false;
    setDragOffset(null);
    hasDraggedRef.current = false;
    dragStartRef.current = null;
  }, []);

  // Chat, Reactions, & Accessibility live announcements
  const [chatMessages, setChatMessages] = useState<ChatItem[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [floatingReactions, setFloatingReactions] = useState<
    FloatingReaction[]
  >([]);
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');

  const [remotePeers, setRemotePeers] = useState<
    Record<string, RemoteParticipant>
  >({});

  // Resilience & UX state: Bandwidth mode, Peer network stats, Diagnostics probe, Safari audio unlock
  const [bandwidthMode, setBandwidthMode] = useState<BandwidthMode>(() => {
    try {
      const saved = window.localStorage.getItem(BANDWIDTH_MODE_STORAGE_KEY);
      if (saved === 'data_saver' || saved === 'audio_only') return saved;
      return 'standard';
    } catch {
      return 'standard';
    }
  });
  const [peerStatsMap, setPeerStatsMap] = useState<
    Record<string, PeerNetworkStats>
  >({});
  const [diagnosticsReport, setDiagnosticsReport] =
    useState<PreCallDiagnosticsReport | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [safariAudioBlocked, setSafariAudioBlocked] = useState(false);
  const platformProfile = useMemo(() => detectBrowserPlatform(), []);

  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  const callLocalVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const transportRef = useRef<MeshTransport | null>(null);
  const hasConnectedTransportRef = useRef(false);
  const showChatPanelRef = useRef(false);
  const soundsEnabledRef = useRef(soundsEnabled);
  const callStartedAtRef = useRef<number | null>(null);
  const seenAttendeesRef = useRef<Map<string, MeetingAttendeeRecord>>(
    new Map(),
  );

  useEffect(() => {
    showChatPanelRef.current = showChatPanel;
    if (showChatPanel) {
      setUnreadChatCount(0);
    }
  }, [showChatPanel]);

  useEffect(() => {
    soundsEnabledRef.current = soundsEnabled;
  }, [soundsEnabled]);

  const inviteUrl = `${window.location.origin}/m/${roomCode}`;

  const announce = useCallback((text: string) => {
    setAriaAnnouncement(text);
  }, []);

  // Track viewport orientation for computeLayout
  useEffect(() => {
    const onResize = () => {
      setIsPortrait(
        window.innerWidth < 768 || window.innerHeight > window.innerWidth,
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const refreshDevices = useCallback(async () => {
    const enumerated = await enumerateMediaDevices();
    setDevices(enumerated);
  }, []);

  const requestPreviewMedia = useCallback(
    async (
      wantAudio: boolean,
      wantVideo: boolean,
      audioId?: string,
      videoId?: string,
    ) => {
      setIsAcquiringMedia(true);
      const res = await acquireUserMedia({
        audio: wantAudio,
        video: wantVideo,
        ...(audioId ? { audioInputId: audioId } : {}),
        ...(videoId ? { videoInputId: videoId } : {}),
      });
      setIsAcquiringMedia(false);

      if (localStreamRef.current && localStreamRef.current !== res.stream) {
        for (const t of localStreamRef.current.getTracks()) {
          t.stop();
        }
      }

      if (res.stream) {
        for (const aTrack of res.stream.getAudioTracks()) {
          aTrack.enabled = !audioMuted;
        }
        for (const vTrack of res.stream.getVideoTracks()) {
          vTrack.enabled = videoEnabled && bandwidthMode !== 'audio_only';
        }
      }

      localStreamRef.current = res.stream;
      setLocalStream(res.stream);
      setMediaErrorKind(res.errorKind);
      setMediaErrorMsg(res.errorMessage);
      setRecoverySteps(res.recoverySteps);
      await refreshDevices();
    },
    [audioMuted, videoEnabled, bandwidthMode, refreshDevices],
  );

  // Inspect room metadata & acquire lobby preview on mount
  useEffect(() => {
    const meta = findRoomMetadataByCode(roomCode);
    if (meta) {
      setRoomTitle(meta.title);
      setRoomDescription(meta.description);
      setRoomHasPasscode(Boolean(meta.passcode));
    }
    void inspectRoomViaApi(roomCode).then((info) => {
      setRoomPeerCount(info.peerCount);
      setRoomLocked(info.locked);
      setRoomFull(info.full || info.peerCount >= MESH_MAX_PARTICIPANTS);
      if (info.title) setRoomTitle(info.title);
      if (info.description) setRoomDescription(info.description);
      if (info.hasPasscode) setRoomHasPasscode(true);
    });

    const initialPrefs = loadDevicePreferences();
    void requestPreviewMedia(
      true,
      true,
      initialPrefs.audioInputId,
      initialPrefs.videoInputId,
    );

    const unsubDevices = subscribeDeviceChanges(() => {
      void refreshDevices();
    });

    return () => {
      unsubDevices();
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          track.stop();
        }
        localStreamRef.current = null;
      }
      if (localScreenStreamRef.current) {
        for (const track of localScreenStreamRef.current.getTracks()) {
          track.stop();
        }
        localScreenStreamRef.current = null;
      }
      signalingRef.current?.disconnect();
      void transportRef.current?.disconnect();
    };
  }, [roomCode]);

  // Attach local stream to lobby video element
  useEffect(() => {
    const el = lobbyVideoRef.current;
    if (el && localStream) {
      attachSafeMediaElement(el, localStream, { muted: true });
    }
  }, [localStream, stage, videoEnabled]);

  // Attach local stream to active call video element
  useEffect(() => {
    const el = callLocalVideoRef.current;
    if (el && localStream) {
      attachSafeMediaElement(el, localStream, { muted: true });
    }
  }, [localStream, stage, videoEnabled, pinnedTargetId]);

  // Poll RTCPeerConnection.getStats() every 2s during active call to drive per-tile network quality bars
  useEffect(() => {
    if (stage !== 'call') {
      setPeerStatsMap({});
      return;
    }
    let cancelled = false;
    const pollStats = async () => {
      const transport = transportRef.current;
      if (!transport || cancelled) return;
      try {
        const stats = await transport.getPeerStats();
        if (!cancelled) {
          setPeerStatsMap(stats);
        }
      } catch {
        // ignore transient stats error
      }
    };
    void pollStats();
    const interval = window.setInterval(() => {
      void pollStats();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [stage]);

  // Safari / iOS foreground recovery: re-acquire any ended microphone/camera tracks after tab switch or screen lock
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      const expectVideo = videoEnabled && bandwidthMode !== 'audio_only';
      const ended = hasEndedMediaTracks(localStreamRef.current, expectVideo);
      if (!ended) return;

      const res = await acquireUserMedia({
        audio: true,
        video: expectVideo,
        ...(prefs.audioInputId ? { audioInputId: prefs.audioInputId } : {}),
        ...(prefs.videoInputId ? { videoInputId: prefs.videoInputId } : {}),
      });
      if (!res.stream) return;

      const current = localStreamRef.current;
      const newAudio = res.stream.getAudioTracks()[0];
      if (newAudio) {
        newAudio.enabled = !audioMuted;
        if (current) {
          for (const old of current.getAudioTracks()) {
            old.stop();
            current.removeTrack(old);
          }
          current.addTrack(newAudio);
        }
        if (transportRef.current) {
          await transportRef.current.replaceTrack('microphone', newAudio);
        }
      }
      if (expectVideo) {
        const newVideo = res.stream.getVideoTracks()[0];
        if (newVideo) {
          newVideo.enabled = true;
          if (current) {
            for (const old of current.getVideoTracks()) {
              old.stop();
              current.removeTrack(old);
            }
            current.addTrack(newVideo);
          }
          if (transportRef.current) {
            await transportRef.current.replaceTrack('camera', newVideo);
          }
        }
      }
      if (current) {
        setLocalStream(new MediaStream(current.getTracks()));
      } else {
        localStreamRef.current = res.stream;
        setLocalStream(res.stream);
      }
      onToast('Restored media devices after returning to foreground.');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [
    audioMuted,
    videoEnabled,
    bandwidthMode,
    prefs.audioInputId,
    prefs.videoInputId,
    onToast,
  ]);

  // Live microphone level meter in lobby
  useEffect(() => {
    if (stage !== 'lobby' || audioMuted || !localStream) {
      setMicLevel(0);
      return;
    }
    return createMicLevelMonitor(localStream, setMicLevel);
  }, [stage, audioMuted, localStream]);

  // Active speaker detection across local + remote streams during call
  useEffect(() => {
    if (stage !== 'call') return;
    const streamMap: Record<string, MediaStream | null> = {
      local: audioMuted ? null : localStream,
    };
    for (const [peerId, p] of Object.entries(remotePeers)) {
      streamMap[peerId] = p.state.audio ? p.stream : null;
    }
    return createMultiPeerSpeakerMonitor(streamMap, setActiveSpeakerId);
  }, [stage, localStream, audioMuted, remotePeers]);

  // Active call duration timer
  useEffect(() => {
    if (stage !== 'call') return;
    const interval = window.setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [stage]);

  // Toggle microphone
  const handleToggleMic = useCallback(() => {
    setAudioMuted((prev) => {
      const nextMuted = !prev;
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getAudioTracks()) {
          track.enabled = !nextMuted;
        }
      }
      signalingRef.current?.updateState({ audio: !nextMuted });
      announce(nextMuted ? 'Microphone muted' : 'Microphone unmuted');
      return nextMuted;
    });
  }, [announce]);

  // Toggle camera
  const handleToggleVideo = useCallback(async () => {
    const nextVideo = !videoEnabled;
    setVideoEnabled(nextVideo);

    const currentStream = localStreamRef.current;
    if (currentStream && currentStream.getVideoTracks().length > 0) {
      for (const track of currentStream.getVideoTracks()) {
        track.enabled = nextVideo;
      }
    } else if (nextVideo) {
      const res = await acquireUserMedia({
        audio: false,
        video: true,
        ...(prefs.videoInputId ? { videoInputId: prefs.videoInputId } : {}),
      });
      const newVideoTrack = res.stream?.getVideoTracks()[0];
      if (newVideoTrack) {
        if (currentStream) {
          currentStream.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(currentStream.getTracks()));
        } else {
          localStreamRef.current = res.stream;
          setLocalStream(res.stream);
        }
        if (transportRef.current) {
          await transportRef.current.replaceTrack('camera', newVideoTrack);
        }
      }
    }

    signalingRef.current?.updateState({ video: nextVideo });
    announce(nextVideo ? 'Camera turned on' : 'Camera turned off');
  }, [videoEnabled, prefs.videoInputId, announce]);

  // Stop local screen sharing and sync state
  const stopLocalScreenShare = useCallback(async () => {
    const currentScreen = localScreenStreamRef.current;
    if (currentScreen) {
      for (const track of currentScreen.getTracks()) {
        track.onended = null;
        track.stop();
      }
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
    setScreenSharing(false);
    setPinnedTargetId((curr) => (curr === 'screen:local' ? null : curr));

    if (transportRef.current) {
      try {
        await transportRef.current.unpublish('screen');
      } catch {
        // ignore
      }
    }
    signalingRef.current?.updateState({ screen: false });
    announce('Stopped screen sharing');
    onToast('Screen sharing stopped.');
  }, [announce, onToast]);

  // Toggle screen sharing (`getDisplayMedia`) + detect native browser "Stop sharing"
  const handleToggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      await stopLocalScreenShare();
      return;
    }

    const displayStream = await acquireDisplayMedia();
    const screenTrack = displayStream?.getVideoTracks()[0];
    if (!displayStream || !screenTrack) {
      return;
    }

    // Detect when user clicks "Stop sharing" in browser UI bar
    screenTrack.onended = () => {
      void stopLocalScreenShare();
    };

    localScreenStreamRef.current = displayStream;
    setLocalScreenStream(displayStream);
    setScreenSharing(true);
    setPinnedTargetId('screen:local');

    if (transportRef.current) {
      try {
        await transportRef.current.publish(screenTrack, 'screen', {
          stream: displayStream,
        });
      } catch {
        // ignore
      }
    }
    signalingRef.current?.updateState({ screen: true });
    announce('Started screen sharing');
    onToast('You are now sharing your screen.');
  }, [screenSharing, stopLocalScreenShare, announce, onToast]);

  // Toggle raise hand
  const handleToggleHand = useCallback(() => {
    setHandRaised((prev) => {
      const next = !prev;
      signalingRef.current?.updateState({ handRaised: next });
      announce(next ? 'You raised your hand' : 'You lowered your hand');
      onToast(next ? '✋ Hand raised.' : 'Hand lowered.');
      return next;
    });
  }, [announce, onToast]);

  // Toggle mirror self-view
  const handleToggleMirror = useCallback(() => {
    setMirrorSelfView((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MIRROR_SELF_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      onToast(next ? 'Self-view mirrored.' : 'Self-view unmirrored.');
      return next;
    });
  }, [onToast]);

  // Toggle join/leave sounds
  const handleToggleSounds = useCallback(() => {
    setSoundsEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(CALL_SOUNDS_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      onToast(next ? 'Join/leave chimes enabled.' : 'Join/leave chimes muted.');
      return next;
    });
  }, [onToast]);

  // Switch bandwidth / resilience mode ('standard' | 'data_saver' | 'audio_only')
  const handleSelectBandwidthMode = useCallback(
    async (nextMode: BandwidthMode) => {
      setBandwidthMode(nextMode);
      try {
        window.localStorage.setItem(BANDWIDTH_MODE_STORAGE_KEY, nextMode);
      } catch {
        // ignore
      }

      if (transportRef.current) {
        await transportRef.current.setBandwidthMode(nextMode);
      }

      if (nextMode === 'audio_only') {
        if (localStreamRef.current) {
          for (const vTrack of localStreamRef.current.getVideoTracks()) {
            vTrack.enabled = false;
          }
        }
        setVideoEnabled(false);
        signalingRef.current?.updateState({ video: false });
        announce('Switched to Audio-Only mode. Video paused to protect audio.');
        onToast('Audio-Only mode enabled — video paused to save bandwidth.');
      } else if (nextMode === 'data_saver') {
        announce('Switched to Data Saver mode (220 kbps video cap).');
        onToast('Data Saver enabled (220 kbps video cap).');
      } else {
        announce('Switched to Standard HD mode.');
        onToast('Standard HD video mode enabled.');
      }
    },
    [announce, onToast],
  );

  // Run pre-call WebRTC loopback + bandwidth + hardware diagnostics probe
  const handleRunPreCallDiagnostics = useCallback(async () => {
    if (isRunningDiagnostics) return;
    setIsRunningDiagnostics(true);
    try {
      const report = await runPreCallDiagnosticsProbe({
        localStream: localStreamRef.current,
        audioMuted,
        videoEnabled,
      });
      setDiagnosticsReport(report);
      if (report.recommendedMode === 'standard') {
        onToast('Network & device test passed — ready for HD call.');
      } else if (report.recommendedMode === 'data_saver') {
        onToast('Network test completed — Data Saver mode recommended.');
      } else {
        onToast('Network test completed — Audio-Only mode recommended.');
      }
    } catch {
      onToast('Could not complete pre-call diagnostics.');
    } finally {
      setIsRunningDiagnostics(false);
    }
  }, [isRunningDiagnostics, audioMuted, videoEnabled, onToast]);

  // Unlock Safari/iOS remote audio playback on user tap
  const handleUnlockSafariAudio = useCallback(() => {
    setSafariAudioBlocked(false);
    const videos = document.querySelectorAll<HTMLVideoElement>('video');
    videos.forEach((v) => {
      void v.play().catch(() => {});
    });
    onToast('Audio playback resumed.');
  }, [onToast]);

  // Send ephemeral reaction
  const handleSendReaction = useCallback((emoji: ReactionEmoji) => {
    signalingRef.current?.sendReaction(emoji);
    setShowReactionPopover(false);
  }, []);

  // Send in-call chat message
  const handleSendChat = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = chatDraft.trim();
      if (!trimmed) return;
      signalingRef.current?.sendChat(trimmed);
      setChatDraft('');
    },
    [chatDraft],
  );

  // Keyboard shortcuts during active call (`m`, `v`, `s`, `h`, `c`, `l`, `?`)
  useEffect(() => {
    if (stage !== 'call') return;
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setShowReactionPopover(false);
        setShowDevicePopover(false);
        return;
      }
      const lower = e.key.toLowerCase();
      if (lower === 'm') {
        e.preventDefault();
        handleToggleMic();
      } else if (lower === 'v') {
        e.preventDefault();
        void handleToggleVideo();
      } else if (lower === 's') {
        e.preventDefault();
        void handleToggleScreenShare();
      } else if (lower === 'h') {
        e.preventDefault();
        handleToggleHand();
      } else if (lower === 'c') {
        e.preventDefault();
        setShowChatPanel((v) => !v);
      } else if (lower === 'l') {
        e.preventDefault();
        handleToggleMirror();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    stage,
    handleToggleMic,
    handleToggleVideo,
    handleToggleScreenShare,
    handleToggleHand,
    handleToggleMirror,
  ]);

  // Switch microphone or camera device
  const handleSelectDevice = async (
    kind: 'audioInputId' | 'videoInputId' | 'audioOutputId',
    deviceId: string,
  ) => {
    const updated: DeviceChoice = { ...prefs, [kind]: deviceId };
    setPrefs(updated);
    saveDevicePreferences({ [kind]: deviceId });

    if (kind === 'audioOutputId') {
      onToast('Speaker output updated.');
      return;
    }

    if (kind === 'audioInputId') {
      const res = await acquireUserMedia({
        audio: true,
        video: false,
        audioInputId: deviceId,
      });
      const newAudioTrack = res.stream?.getAudioTracks()[0];
      if (newAudioTrack) {
        newAudioTrack.enabled = !audioMuted;
        if (transportRef.current) {
          await transportRef.current.replaceTrack('microphone', newAudioTrack);
        }
        if (localStreamRef.current) {
          for (const old of localStreamRef.current.getAudioTracks()) {
            old.stop();
            localStreamRef.current.removeTrack(old);
          }
          localStreamRef.current.addTrack(newAudioTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        } else {
          localStreamRef.current = res.stream;
          setLocalStream(res.stream);
        }
        onToast('Microphone switched.');
      }
    } else if (kind === 'videoInputId') {
      const res = await acquireUserMedia({
        audio: false,
        video: true,
        videoInputId: deviceId,
      });
      const newVideoTrack = res.stream?.getVideoTracks()[0];
      if (newVideoTrack) {
        newVideoTrack.enabled = videoEnabled;
        if (transportRef.current) {
          await transportRef.current.replaceTrack('camera', newVideoTrack);
        }
        if (localStreamRef.current) {
          for (const old of localStreamRef.current.getVideoTracks()) {
            old.stop();
            localStreamRef.current.removeTrack(old);
          }
          localStreamRef.current.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        } else {
          localStreamRef.current = res.stream;
          setLocalStream(res.stream);
        }
        onToast('Camera switched.');
      }
    }
  };

  const handleCopyInvite = async () => {
    const ok = await copyToClipboard(inviteUrl);
    if (ok) {
      setCopiedInvite(true);
      onToast('Meeting invite link copied.');
      window.setTimeout(() => setCopiedInvite(false), 2200);
    } else {
      onToast(`Invite link: ${inviteUrl}`);
    }
  };

  const pushFloatingReaction = useCallback(
    (rx: { id: string; displayName: string; emoji: ReactionEmoji }) => {
      setFloatingReactions((prev) => [...prev.slice(-14), rx]);
      window.setTimeout(() => {
        setFloatingReactions((prev) =>
          prev.filter((item) => item.id !== rx.id),
        );
      }, 3200);
    },
    [],
  );

  const handleJoinCall = async () => {
    if (roomFull || roomLocked) return;
    setLobbyError(null);

    const cleanName = displayName.trim() || user?.displayName || '';
    if (!cleanName) {
      setLobbyError('Please enter your display name before joining.');
      return;
    }

    if (
      localMeta?.passcode &&
      enteredPasscode.trim() !== localMeta.passcode.trim()
    ) {
      setLobbyError('Incorrect room passcode.');
      return;
    }
    if (roomHasPasscode && !enteredPasscode.trim()) {
      setLobbyError('This room requires a passcode to join.');
      return;
    }

    setDisplayName(cleanName);
    try {
      window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, cleanName);
    } catch {
      // ignore
    }

    const token = user
      ? 'authenticated-user-token'
      : await requestGuestTokenViaApi(cleanName);

    const initialState: PeerState = {
      audio: !audioMuted,
      video:
        videoEnabled &&
        Boolean(
          localStreamRef.current &&
          localStreamRef.current.getVideoTracks().length > 0,
        ),
      screen: false,
      handRaised: false,
    };

    callStartedAtRef.current = Date.now();
    recordCallJoinAttempt(roomCode);
    seenAttendeesRef.current = new Map([
      [
        user?.id ?? 'local-self',
        {
          id: user?.id ?? 'local-self',
          displayName: cleanName,
          role: user ? 'host' : 'guest',
          verified: Boolean(user),
        },
      ],
    ]);

    const signaling = new SignalingClient({
      roomCode,
      displayName: cleanName,
      token,
      ...(enteredPasscode.trim() ? { passcode: enteredPasscode.trim() } : {}),
      initialState,
      onReconnecting: () => {
        setConnectionBanner({
          tone: 'warn',
          text: 'Signaling link interrupted — reconnecting…',
        });
        onToast('Reconnecting to meeting…');
      },
      onReconnected: () => {
        setConnectionBanner({
          tone: 'ok',
          text: 'Connection restored.',
        });
        onToast('Connection restored.');
        window.setTimeout(() => setConnectionBanner(null), 3000);
      },
    });

    const transport = new MeshTransport();

    transport.on('trackSubscribed', ({ peerId, source, track, stream }) => {
      setRemotePeers((prev) => {
        const existing = prev[peerId];
        if (source === 'screen') {
          const screenStream = stream ?? new MediaStream([track]);
          setPinnedTargetId(`screen:${peerId}`);
          if (!existing) {
            return {
              ...prev,
              [peerId]: {
                id: peerId,
                displayName: 'Guest',
                role: 'guest',
                state: {
                  audio: true,
                  video: true,
                  screen: true,
                  handRaised: false,
                },
                stream: null,
                screenStream,
                connectionStatus: 'connected',
              },
            };
          }
          return {
            ...prev,
            [peerId]: {
              ...existing,
              screenStream,
            },
          };
        }

        const nextStream =
          stream ?? existing?.stream ?? new MediaStream([track]);
        if (existing?.stream && !stream) {
          existing.stream.addTrack(track);
        }
        if (!existing) {
          return {
            ...prev,
            [peerId]: {
              id: peerId,
              displayName: 'Guest',
              role: 'guest',
              state: {
                audio: true,
                video: true,
                screen: false,
                handRaised: false,
              },
              stream: nextStream,
              screenStream: null,
              connectionStatus: 'connected',
            },
          };
        }
        return {
          ...prev,
          [peerId]: {
            ...existing,
            stream: nextStream,
          },
        };
      });
    });

    transport.on('trackUnsubscribed', ({ peerId, source }) => {
      if (source === 'screen') {
        setRemotePeers((prev) => {
          const existing = prev[peerId];
          if (!existing) return prev;
          return {
            ...prev,
            [peerId]: {
              ...existing,
              screenStream: null,
            },
          };
        });
        setPinnedTargetId((curr) =>
          curr === `screen:${peerId}` ? null : curr,
        );
      }
    });

    transport.on('connectionStateChanged', ({ peerId, state: status }) => {
      setRemotePeers((prev) => {
        const existing = prev[peerId];
        if (!existing) return prev;
        return {
          ...prev,
          [peerId]: {
            ...existing,
            connectionStatus: status,
          },
        };
      });

      if (status === 'reconnecting') {
        setConnectionBanner({
          tone: 'warn',
          text: 'Network hiccup detected — holding audio and reconnecting…',
        });
        onToast('Reconnecting media stream…');
      } else if (status === 'connected') {
        setConnectionBanner((curr) => {
          if (curr && curr.tone !== 'ok') {
            onToast('Call connection restored.');
            window.setTimeout(() => setConnectionBanner(null), 2800);
            return { tone: 'ok', text: 'Call connection restored.' };
          }
          return null;
        });
      } else if (status === 'failed') {
        setConnectionBanner({
          tone: 'danger',
          text: 'Connection degraded — renegotiating route…',
        });
        onToast('Connection failed — attempting recovery.');
      }
    });

    signaling.on('waiting.room', (payload) => {
      if (payload.title) {
        setRoomTitle(payload.title);
      }
      setWaitingRoomMessage(payload.message);
      setStage('waiting_room');
      announce(payload.message);
    });

    signaling.on('waiting.updated', ({ waitingPeers: nextWaiting }) => {
      setWaitingPeers((prev) => {
        if (nextWaiting.length > prev.length) {
          const newest = nextWaiting[nextWaiting.length - 1];
          if (newest) {
            onToast(`${newest.displayName} is waiting in the lobby.`);
            announce(`${newest.displayName} is waiting to be admitted`);
          }
        }
        return nextWaiting;
      });
    });

    signaling.on('joined', (payload) => {
      setStage('call');
      setSelfRole(payload.role);
      setRoomLocked(payload.roomState.locked);
      if (payload.roomState.permissions) {
        setRoomPermissions(payload.roomState.permissions);
      }
      if (payload.roomState.waitingPeers) {
        setWaitingPeers(payload.roomState.waitingPeers);
      }
      if (payload.roomState.title) {
        setRoomTitle(payload.roomState.title);
      }
      if (payload.roomState.description) {
        setRoomDescription(payload.roomState.description);
      }

      const isReconnect = hasConnectedTransportRef.current;

      setRemotePeers((prev) => {
        const map: Record<string, RemoteParticipant> = {};
        for (const p of payload.peers) {
          seenAttendeesRef.current.set(p.id, {
            id: p.id,
            displayName: p.displayName,
            role: p.role,
            ...(p.verified !== undefined ? { verified: p.verified } : {}),
          });
          const existing = prev[p.id];
          map[p.id] = {
            ...p,
            stream: existing?.stream ?? null,
            screenStream: p.state.screen
              ? (existing?.screenStream ?? null)
              : null,
            connectionStatus: existing?.connectionStatus ?? 'connecting',
          };
        }
        return map;
      });

      if (!isReconnect && soundsEnabledRef.current) {
        playCallChime('join');
      }

      recordCallJoinSuccess(roomCode);

      void (async () => {
        if (!hasConnectedTransportRef.current) {
          hasConnectedTransportRef.current = true;
          await transport.connect({
            roomId: roomCode,
            selfId: payload.selfId,
            iceServers: payload.iceServers as RTCIceServer[],
            signaling,
            peerIds: payload.peers.map((p) => p.id),
          });
          await transport.setBandwidthMode(bandwidthMode);

          const currentStream = localStreamRef.current;
          if (currentStream) {
            const audioTrack = currentStream.getAudioTracks()[0];
            if (audioTrack) {
              await transport.publish(audioTrack, 'microphone', {
                stream: currentStream,
              });
            }
            const videoTrack = currentStream.getVideoTracks()[0];
            if (videoTrack) {
              await transport.publish(videoTrack, 'camera', {
                stream: currentStream,
              });
            }
          }
        } else {
          await transport.setBandwidthMode(bandwidthMode);
        }
      })();
    });

    signaling.on('peer.role.updated', ({ peerId, role }) => {
      if (peerId === signaling.getSelfId()) {
        setSelfRole(role);
        onToast(`Your role in this meeting is now ${role.toUpperCase()}.`);
        announce(`Your role is now ${role}`);
      } else {
        setRemotePeers((prev) => {
          const target = prev[peerId];
          if (!target) return prev;
          onToast(`${target.displayName} is now ${role}.`);
          return {
            ...prev,
            [peerId]: {
              ...target,
              role,
            },
          };
        });
      }
    });

    signaling.on('room.updated', ({ locked, permissions }) => {
      setRoomLocked(locked);
      if (permissions) {
        setRoomPermissions(permissions);
      }
    });

    signaling.on('host.command', (cmd) => {
      if (cmd.command === 'mute') {
        setAudioMuted(true);
        if (localStreamRef.current) {
          for (const track of localStreamRef.current.getAudioTracks()) {
            track.enabled = false;
          }
        }
        signaling.updateState({ audio: false });
        onToast(`You were muted by ${cmd.byDisplayName}.`);
        announce(`You were muted by ${cmd.byDisplayName}`);
      } else if (cmd.command === 'ask_unmute') {
        setUnmutePromptFrom(cmd.byDisplayName);
        announce(`${cmd.byDisplayName} asked you to unmute your microphone`);
      } else if (cmd.command === 'removed') {
        setLobbyError(
          cmd.blocked
            ? `You were removed and blocked from this meeting by ${cmd.byDisplayName}.`
            : `You were removed from the meeting by ${cmd.byDisplayName}.`,
        );
        signaling.disconnect();
        void transport.disconnect();
        setStage('lobby');
        onToast(
          cmd.blocked
            ? 'Removed and blocked by the host.'
            : 'You were removed from the call by the host.',
        );
      } else if (cmd.command === 'meeting_ended') {
        onToast(`${cmd.byDisplayName} ended the meeting for everyone.`);
        handleHangUp();
      }
    });

    signaling.on('peer.joined', ({ peer }) => {
      seenAttendeesRef.current.set(peer.id, {
        id: peer.id,
        displayName: peer.displayName,
        role: peer.role,
        ...(peer.verified !== undefined ? { verified: peer.verified } : {}),
      });
      onToast(`${peer.displayName} joined the call.`);
      announce(`${peer.displayName} joined the meeting`);
      if (soundsEnabledRef.current) {
        playCallChime('join');
      }
      setRemotePeers((prev) => ({
        ...prev,
        [peer.id]: {
          ...peer,
          stream: prev[peer.id]?.stream ?? null,
          screenStream: prev[peer.id]?.screenStream ?? null,
          connectionStatus: 'connecting',
        },
      }));
    });

    signaling.on('peer.left', ({ peerId }) => {
      setRemotePeers((prev) => {
        const leaving = prev[peerId];
        if (leaving) {
          onToast(`${leaving.displayName} left the call.`);
          announce(`${leaving.displayName} left the meeting`);
          if (soundsEnabledRef.current) {
            playCallChime('leave');
          }
        }
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      setPinnedTargetId((curr) =>
        curr === peerId || curr === `screen:${peerId}` ? null : curr,
      );
    });

    signaling.on('state.updated', ({ peerId, state }) => {
      setRemotePeers((prev) => {
        const existing = prev[peerId];
        if (!existing) return prev;
        if (!existing.state.handRaised && state.handRaised) {
          announce(`${existing.displayName} raised their hand`);
          onToast(`✋ ${existing.displayName} raised their hand.`);
        }
        if (existing.state.screen && !state.screen) {
          setPinnedTargetId((curr) =>
            curr === `screen:${peerId}` ? null : curr,
          );
        } else if (!existing.state.screen && state.screen) {
          announce(`${existing.displayName} started sharing their screen`);
          setPinnedTargetId(`screen:${peerId}`);
        }
        return {
          ...prev,
          [peerId]: {
            ...existing,
            state,
            screenStream: state.screen ? existing.screenStream : null,
          },
        };
      });
    });

    signaling.on('chat.message', (chatMsg) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === chatMsg.id)) return prev;
        const next = [...prev, chatMsg];
        next.sort((a, b) => {
          if (a.seq !== undefined && b.seq !== undefined && a.seq !== b.seq) {
            return a.seq - b.seq;
          }
          return a.id.localeCompare(b.id);
        });
        return next;
      });
      if (!showChatPanelRef.current) {
        setUnreadChatCount((c) => c + 1);
      }
      announce(`New message from ${chatMsg.displayName}: ${chatMsg.text}`);
    });

    signaling.on('reaction.received', (rx) => {
      pushFloatingReaction({
        id: rx.id,
        displayName: rx.displayName,
        emoji: rx.emoji,
      });
      announce(`${rx.displayName} reacted with ${rx.emoji}`);
    });

    signaling.on('error', (err) => {
      if (err.code === 'ROOM_FULL') {
        recordCallJoinFailure(roomCode, err.code);
        setRoomFull(true);
        setStage('lobby');
        signaling.disconnect();
        void transport.disconnect();
      } else if (err.code === 'ROOM_LOCKED') {
        recordCallJoinFailure(roomCode, err.code);
        setRoomLocked(true);
        setStage('lobby');
        signaling.disconnect();
        void transport.disconnect();
      } else if (
        err.code === 'FORBIDDEN' ||
        err.code === 'UNAUTHORIZED' ||
        err.code === 'NOT_ADMITTED'
      ) {
        if (err.code !== 'FORBIDDEN' || stage !== 'call') {
          recordCallJoinFailure(roomCode, err.code);
          setLobbyError(err.message);
          setStage('lobby');
          signaling.disconnect();
          void transport.disconnect();
        }
      }
      onToast(err.message);
    });

    hasConnectedTransportRef.current = false;
    signalingRef.current = signaling;
    transportRef.current = transport;
    signaling.connect();
    setStage('call');
  };

  const handleHangUp = () => {
    hasConnectedTransportRef.current = false;
    if (callStartedAtRef.current) {
      const historyItem = recordCompletedMeetingSession({
        roomCode,
        roomTitle,
        startedAtMs: callStartedAtRef.current,
        endedAtMs: Date.now(),
        attendees: Array.from(seenAttendeesRef.current.values()),
      });
      ensureNoteForCompletedMeeting({
        ownerId: user?.id ?? '',
        historyItem,
        chatTranscript: chatMessages,
      });
      callStartedAtRef.current = null;
    }
    signalingRef.current?.disconnect();
    void transportRef.current?.disconnect();
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) {
        t.stop();
      }
      localStreamRef.current = null;
    }
    if (localScreenStreamRef.current) {
      for (const t of localScreenStreamRef.current.getTracks()) {
        t.stop();
      }
      localScreenStreamRef.current = null;
    }
    onLeaveCall(roomCode);
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const hasLocalVideoTrack =
    videoEnabled &&
    bandwidthMode !== 'audio_only' &&
    Boolean(localStream && localStream.getVideoTracks().length > 0);
  const localInitial = (
    (displayName || user?.displayName || 'G')[0] || 'G'
  ).toUpperCase();

  const remoteList = useMemo(() => Object.values(remotePeers), [remotePeers]);
  const totalParticipantCount = remoteList.length + 1;

  // Aggregate local network quality from active peer stats
  const localNetworkSummary = useMemo((): {
    bars: NetworkQualityBars;
    level: NetworkQualityLevel;
    rttMs: number | null;
    packetLossPct: number;
    bitrateKbps: number;
  } => {
    const entries = Object.values(peerStatsMap);
    if (entries.length === 0) {
      return {
        bars: 4,
        level: 'excellent',
        rttMs: null,
        packetLossPct: 0,
        bitrateKbps: 0,
      };
    }
    let minBars: NetworkQualityBars = 4;
    let worstLevel: NetworkQualityLevel = 'excellent';
    let maxRtt: number | null = null;
    let maxLoss = 0;
    let totalBitrate = 0;
    for (const st of entries) {
      if (st.bars < minBars) {
        minBars = st.bars;
        worstLevel = st.quality;
      }
      if (
        st.roundTripTimeMs !== undefined &&
        (maxRtt === null || st.roundTripTimeMs > maxRtt)
      ) {
        maxRtt = st.roundTripTimeMs;
      }
      const lossPct = st.fractionLost * 100;
      if (lossPct > maxLoss) {
        maxLoss = lossPct;
      }
      if (st.availableOutgoingBitrate) {
        totalBitrate += Math.round(st.availableOutgoingBitrate / 1000);
      }
    }
    return {
      bars: minBars,
      level: worstLevel,
      rttMs: maxRtt,
      packetLossPct: maxLoss,
      bitrateKbps: totalBitrate,
    };
  }, [peerStatsMap]);

  // Determine active screen share or pinned target
  const activeScreenTile = useMemo(() => {
    if (screenSharing && localScreenStream) {
      return {
        id: 'screen:local',
        stream: localScreenStream,
        ownerName: `${displayName || 'You'} (You)`,
      };
    }
    for (const p of remoteList) {
      if (p.state.screen && p.screenStream) {
        return {
          id: `screen:${p.id}`,
          stream: p.screenStream,
          ownerName: p.displayName,
        };
      }
    }
    return null;
  }, [screenSharing, localScreenStream, remoteList, displayName]);

  const effectiveSpotlightId =
    pinnedTargetId ?? (activeScreenTile ? activeScreenTile.id : null);

  const layout = useMemo(
    () =>
      computeLayout(totalParticipantCount, {
        hasSpotlight: Boolean(effectiveSpotlightId),
        isPortrait,
        ...(manualPipPreference !== null
          ? { preferPip: manualPipPreference }
          : {}),
      }),
    [
      totalParticipantCount,
      effectiveSpotlightId,
      isPortrait,
      manualPipPreference,
    ],
  );

  const isPipActive = Boolean(layout.isPip && remoteList.length === 1);
  const isLocalFloating = isPipActive && !isPiPSwapped;
  const isRemoteFloating = isPipActive && isPiPSwapped;

  const canModerate = selfRole === 'host' || selfRole === 'cohost';
  const isHost = selfRole === 'host';

  const handleHostMutePeer = (targetPeerId: string) => {
    signalingRef.current?.sendHostAction({
      action: 'mute',
      targetPeerId,
    });
    onToast('Participant muted.');
  };

  const handleHostMuteAll = () => {
    signalingRef.current?.sendHostAction({ action: 'mute_all' });
    onToast('Muted all other participants.');
  };

  const handleHostAskUnmute = (targetPeerId: string, name: string) => {
    signalingRef.current?.sendHostAction({
      action: 'ask_unmute',
      targetPeerId,
    });
    onToast(`Asked ${name} to unmute.`);
  };

  const handleHostRemovePeer = (
    targetPeerId: string,
    name: string,
    block = false,
  ) => {
    signalingRef.current?.sendHostAction({
      action: 'remove',
      targetPeerId,
      block,
    });
    onToast(
      block
        ? `Removed and blocked ${name} from rejoining.`
        : `Removed ${name} from the meeting.`,
    );
  };

  const handleHostSetRole = (
    targetPeerId: string,
    role: 'host' | 'cohost' | 'attendee',
  ) => {
    signalingRef.current?.sendHostAction({
      action: 'set_role',
      targetPeerId,
      role,
    });
  };

  const handleHostToggleLock = () => {
    const nextLocked = !roomLocked;
    setRoomLocked(nextLocked);
    signalingRef.current?.sendHostAction({
      action: 'set_locked',
      locked: nextLocked,
    });
    onToast(
      nextLocked
        ? 'Room locked. New participants cannot join.'
        : 'Room unlocked.',
    );
  };

  const handleHostUpdatePermission = (partial: Partial<RoomPermissions>) => {
    setRoomPermissions((prev) => ({ ...prev, ...partial }));
    signalingRef.current?.sendHostAction({
      action: 'set_permissions',
      permissions: partial,
    });
    onToast('Room permissions updated.');
  };

  const handleHostAdmit = (targetPeerId: string) => {
    signalingRef.current?.sendHostAction({
      action: 'admit',
      targetPeerId,
    });
  };

  const handleHostDeny = (targetPeerId: string) => {
    signalingRef.current?.sendHostAction({
      action: 'deny',
      targetPeerId,
    });
  };

  const handleHostAdmitAll = () => {
    signalingRef.current?.sendHostAction({ action: 'admit_all' });
    onToast('Admitted all waiting participants.');
  };

  const handleHostEndMeeting = () => {
    signalingRef.current?.sendHostAction({ action: 'end_meeting' });
    handleHangUp();
  };

  if (stage === 'waiting_room') {
    return (
      <div className="lobby-shell" data-view="waiting-room">
        <div className="status-card-wrap">
          <div className="status-card" data-testid="waiting-room-card">
            <span className="eyebrow">Waiting Room · {roomCode}</span>
            <h1>{roomTitle}</h1>
            <p>{waitingRoomMessage}</p>
            <div className="status-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  signalingRef.current?.disconnect();
                  void transportRef.current?.disconnect();
                  setStage('lobby');
                }}
              >
                Leave waiting room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'lobby') {
    return (
      <div className="lobby-shell" data-view="lobby">
        <div aria-live="polite" className="sr-only">
          {ariaAnnouncement}
        </div>

        <header className="lobby-header wrap">
          <button
            type="button"
            className="brand-btn"
            onClick={onNavigateHome}
            aria-label="Back to MeetIT Home"
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Logo size="md" />
          </button>

          <div className="lobby-header-right">
            <BackendStatusIndicator compact />
            <div className="room-code-pill" title="Meeting room code">
              <span>{roomCode}</span>
              <button
                type="button"
                className="pill-copy-btn"
                onClick={handleCopyInvite}
                aria-label="Copy invite link"
              >
                {copiedInvite ? <CheckIcon /> : <LnkIcon />}
                <span>{copiedInvite ? 'Copied' : 'Copy link'}</span>
              </button>
            </div>

            <button
              type="button"
              className="theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        <main className="lobby-main wrap">
          {/* Left column: Camera preview + mic level + device selectors */}
          <div className="lobby-preview-col">
            <div className="lobby-video-frame" data-testid="lobby-preview">
              <video
                ref={lobbyVideoRef}
                muted
                playsInline
                autoPlay
                className={`lobby-video ${hasLocalVideoTrack ? 'visible' : 'hidden'} ${!mirrorSelfView ? 'unmirrored' : ''}`}
              />

              {!hasLocalVideoTrack && (
                <div className="lobby-avatar-placeholder">
                  <div className="lobby-avatar-circle">{localInitial}</div>
                  <p>
                    {isAcquiringMedia
                      ? 'Checking camera and microphone…'
                      : 'Camera is off'}
                  </p>
                </div>
              )}

              {/* Live mic level indicator pill */}
              <div className="lobby-mic-meter" aria-label="Microphone level">
                <span className="mic-meter-label">
                  {audioMuted ? 'Mic muted' : 'Mic active'}
                </span>
                <div className="mic-meter-track">
                  <div
                    className="mic-meter-fill"
                    style={{
                      width: `${audioMuted ? 0 : Math.max(6, micLevel)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Preview overlay controls */}
              <div className="lobby-preview-controls">
                <button
                  type="button"
                  className={`ctrl-btn ${audioMuted ? 'off' : ''}`}
                  onClick={handleToggleMic}
                  aria-pressed={!audioMuted}
                  aria-label={
                    audioMuted ? 'Unmute microphone' : 'Mute microphone'
                  }
                  data-testid="lobby-mic-toggle"
                >
                  <MicIcon />
                  <span>{audioMuted ? 'Unmute' : 'Mute'}</span>
                </button>

                <button
                  type="button"
                  className={`ctrl-btn ${!videoEnabled ? 'off' : ''}`}
                  onClick={() => void handleToggleVideo()}
                  aria-pressed={videoEnabled}
                  aria-label={
                    videoEnabled ? 'Turn camera off' : 'Turn camera on'
                  }
                  data-testid="lobby-cam-toggle"
                >
                  <VidIcon />
                  <span>{videoEnabled ? 'Camera on' : 'Camera off'}</span>
                </button>

                <button
                  type="button"
                  className="ctrl-btn"
                  onClick={handleToggleMirror}
                  aria-pressed={mirrorSelfView}
                  aria-label="Toggle mirror self-view"
                  title="Flip local camera preview"
                >
                  <span>{mirrorSelfView ? 'Mirrored' : 'Normal'}</span>
                </button>
              </div>
            </div>

            {/* Device selectors */}
            <div className="lobby-device-selectors">
              <label className="device-select-group">
                <span>Microphone</span>
                <select
                  aria-label="Select microphone"
                  value={prefs.audioInputId}
                  onChange={(e) =>
                    void handleSelectDevice('audioInputId', e.target.value)
                  }
                >
                  <option value="">Default microphone</option>
                  {devices.microphones.map((m, idx) => (
                    <option key={m.deviceId || idx} value={m.deviceId}>
                      {m.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="device-select-group">
                <span>Camera</span>
                <select
                  aria-label="Select camera"
                  value={prefs.videoInputId}
                  onChange={(e) =>
                    void handleSelectDevice('videoInputId', e.target.value)
                  }
                >
                  <option value="">Default camera</option>
                  {devices.cameras.map((c, idx) => (
                    <option key={c.deviceId || idx} value={c.deviceId}>
                      {c.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </label>

              {devices.speakers.length > 0 && (
                <label className="device-select-group">
                  <span>Speakers</span>
                  <select
                    aria-label="Select speaker output"
                    value={prefs.audioOutputId}
                    onChange={(e) =>
                      void handleSelectDevice('audioOutputId', e.target.value)
                    }
                  >
                    <option value="">System default speaker</option>
                    {devices.speakers.map((s, idx) => (
                      <option key={s.deviceId || idx} value={s.deviceId}>
                        {s.label || `Speaker ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {/* Pre-Call Network & Device Diagnostics Probe (WebRTC Loopback + Bandwidth) */}
            <div className="lobby-diagnostics-bar">
              <button
                type="button"
                className="btn"
                onClick={() => void handleRunPreCallDiagnostics()}
                disabled={isRunningDiagnostics}
                data-testid="run-diagnostics-btn"
              >
                <span>
                  {isRunningDiagnostics
                    ? 'Running loopback & bandwidth test…'
                    : diagnosticsReport
                      ? 'Re-run network & device test'
                      : 'Test network & devices'}
                </span>
              </button>
              <span
                className="lobby-platform-tag"
                title="Detected platform profile"
              >
                {platformProfile.isIOS
                  ? 'iOS WebKit'
                  : platformProfile.isSafari
                    ? 'macOS Safari'
                    : 'WebRTC Ready'}
              </span>
            </div>

            {diagnosticsReport && (
              <div
                className={`diagnostics-probe-card status-${
                  diagnosticsReport.recommendedMode === 'standard'
                    ? 'good'
                    : diagnosticsReport.recommendedMode === 'data_saver'
                      ? 'fair'
                      : 'poor'
                }`}
                role="region"
                aria-label="Pre-call network and device test report"
                data-testid="diagnostics-report-card"
              >
                <div className="diagnostics-probe-head">
                  <strong>
                    {diagnosticsReport.recommendedMode === 'standard'
                      ? '✓ Ready for HD Call'
                      : diagnosticsReport.recommendedMode === 'data_saver'
                        ? '⚠ Fair Network — Data Saver Recommended'
                        : '✕ Low Bandwidth — Audio-Only Recommended'}
                  </strong>
                  <button
                    type="button"
                    className="btn-icon-subtle"
                    onClick={() => setDiagnosticsReport(null)}
                    aria-label="Dismiss diagnostics report"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="diagnostics-metrics-grid">
                  <div className="diag-metric">
                    <small>WebRTC Loopback</small>
                    <strong>
                      {diagnosticsReport.loopbackRttMs} ms RTT (ICE{' '}
                      {diagnosticsReport.iceGatherMs} ms)
                    </strong>
                  </div>
                  <div className="diag-metric">
                    <small>Est. Bandwidth</small>
                    <strong>
                      {(
                        diagnosticsReport.estimatedThroughputKbps / 1000
                      ).toFixed(1)}{' '}
                      Mbps
                    </strong>
                  </div>
                  <div className="diag-metric">
                    <small>Signaling RTT</small>
                    <strong>{diagnosticsReport.signalingLatencyMs} ms</strong>
                  </div>
                  <div className="diag-metric">
                    <small>Hardware</small>
                    <strong>
                      Mic{' '}
                      {diagnosticsReport.audioStatus === 'ok'
                        ? '✓'
                        : 'Muted/Off'}{' '}
                      · Cam{' '}
                      {diagnosticsReport.videoStatus === 'ok' ? '✓' : 'Off'}
                    </strong>
                  </div>
                </div>

                <p
                  className="diagnostics-recommendations"
                  style={{ paddingLeft: 0 }}
                >
                  {diagnosticsReport.summary}
                </p>

                <details className="diagnostics-matrix-details">
                  <summary>
                    Real-device &amp; Safari/iOS compatibility matrix
                  </summary>
                  <div className="diagnostics-matrix-table">
                    {REAL_DEVICE_TEST_MATRIX.map((row) => (
                      <div
                        key={`${row.platform}-${row.browser}`}
                        className="matrix-row"
                      >
                        <strong>
                          {row.platform} · {row.browser}
                        </strong>
                        <span>{row.workdirWorkaround}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* Permission denied / no device recovery box */}
            {mediaErrorKind && (
              <div
                className="media-recovery-card"
                role="alert"
                data-testid="media-recovery-card"
              >
                <div className="media-recovery-head">
                  <strong>{mediaErrorMsg}</strong>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void requestPreviewMedia(
                        true,
                        true,
                        prefs.audioInputId,
                        prefs.videoInputId,
                      )
                    }
                  >
                    Retry devices
                  </button>
                </div>
                {recoverySteps.length > 0 && (
                  <ol className="media-recovery-steps">
                    {recoverySteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>

          {/* Right column: Join card */}
          <div className="lobby-join-card">
            <div>
              <span className="lobby-eyebrow">Ready to join?</span>
              <h2 data-testid="lobby-room-title">{roomTitle}</h2>
              {roomDescription && (
                <p
                  className="lobby-room-description"
                  data-testid="lobby-room-description"
                >
                  {roomDescription}
                </p>
              )}
              <p className="lobby-status-line">
                {roomFull
                  ? `This room is full (${MESH_MAX_PARTICIPANTS}/${MESH_MAX_PARTICIPANTS} participants in mesh mode).`
                  : roomLocked
                    ? 'This room is currently locked by the host.'
                    : roomPeerCount === 0
                      ? 'No one else is here yet — you’ll be the first to join.'
                      : `${roomPeerCount} of ${MESH_MAX_PARTICIPANTS} participant${roomPeerCount > 1 ? 's' : ''} currently in the call.`}
              </p>
            </div>

            {lobbyError && (
              <div className="auth-alert error" role="alert">
                {lobbyError}
              </div>
            )}

            {/* Clear "Room Full" UX alert when room reaches 4-participant mesh cap */}
            {roomFull && (
              <div
                className="room-full-banner"
                role="alert"
                data-testid="room-full-banner"
              >
                <strong>Room is at full capacity (4/4)</strong>
                <p>
                  Direct peer-to-peer mesh calls are capped at 4 participants to
                  guarantee crisp audio and low CPU usage. Wait for someone to
                  leave or start a new room.
                </p>
              </div>
            )}

            <div className="lobby-field">
              <label htmlFor="lobbyNameInput">
                Your display name{' '}
                {user ? (
                  <span className="verified-inline-pill">✓ Verified</span>
                ) : (
                  <span className="guest-inline-pill">Guest (required)</span>
                )}
              </label>
              <input
                id="lobbyNameInput"
                type="text"
                placeholder="Enter your name (e.g., Ada Okafor)"
                value={displayName}
                maxLength={60}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !roomLocked && !roomFull) {
                    void handleJoinCall();
                  }
                }}
              />
            </div>

            {roomHasPasscode && (
              <div className="lobby-field">
                <label htmlFor="lobbyPasscodeInput">🔒 Room passcode *</label>
                <input
                  id="lobbyPasscodeInput"
                  type="password"
                  placeholder="Enter room passcode"
                  value={enteredPasscode}
                  maxLength={32}
                  onChange={(e) => setEnteredPasscode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !roomLocked && !roomFull) {
                      void handleJoinCall();
                    }
                  }}
                />
              </div>
            )}

            {/* Bandwidth & Resilience Mode Selector in Lobby */}
            <div className="lobby-field">
              <label>Call quality &amp; data mode</label>
              <div
                className="bandwidth-mode-pills"
                role="radiogroup"
                aria-label="Call quality and data mode"
                data-testid="lobby-bandwidth-modes"
              >
                <button
                  type="button"
                  className={`bw-mode-pill ${bandwidthMode === 'standard' ? 'active' : ''}`}
                  onClick={() => void handleSelectBandwidthMode('standard')}
                  aria-pressed={bandwidthMode === 'standard'}
                  data-testid="bw-mode-standard"
                >
                  <strong>Standard HD</strong>
                  <small>Adaptive video</small>
                </button>
                <button
                  type="button"
                  className={`bw-mode-pill ${bandwidthMode === 'data_saver' ? 'active' : ''}`}
                  onClick={() => void handleSelectBandwidthMode('data_saver')}
                  aria-pressed={bandwidthMode === 'data_saver'}
                  data-testid="bw-mode-data-saver"
                >
                  <strong>Data Saver</strong>
                  <small>220 kbps cap</small>
                </button>
                <button
                  type="button"
                  className={`bw-mode-pill ${bandwidthMode === 'audio_only' ? 'active' : ''}`}
                  onClick={() => void handleSelectBandwidthMode('audio_only')}
                  aria-pressed={bandwidthMode === 'audio_only'}
                  data-testid="bw-mode-audio-only"
                >
                  <strong>Audio-Only</strong>
                  <small>No video</small>
                </button>
              </div>
            </div>

            <div className="lobby-join-actions">
              <button
                type="button"
                className="btn primary lobby-join-btn"
                disabled={roomLocked || roomFull}
                onClick={() => void handleJoinCall()}
                data-testid="join-call-btn"
              >
                <span>{roomFull ? 'Room full (4/4)' : 'Join meeting now'}</span>
              </button>

              <button
                type="button"
                className="btn lobby-copy-btn"
                onClick={handleCopyInvite}
              >
                <LnkIcon />
                <span>
                  {copiedInvite ? 'Invite link copied' : 'Copy invite link'}
                </span>
              </button>
            </div>

            <div className="lobby-reassurance">
              <small>
                Audio-first protection is active. Up to {MESH_MAX_PARTICIPANTS}{' '}
                participants connect peer-to-peer with automatic bitrate
                scaling.
              </small>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="call-shell" data-view="call">
      {/* Screen-reader live region for join/leave/hand/chat announcements */}
      <div aria-live="polite" className="sr-only">
        {ariaAnnouncement}
      </div>

      {/* Minimal Studio Top Bar (Google Meet style) */}
      <header className="call-topbar">
        <div className="call-topbar-left">
          <span className="call-timer" aria-label="Call duration">
            {formatDuration(callSeconds)}
          </span>
          <span className="call-topbar-sep" aria-hidden="true">
            |
          </span>
          <span className="call-room-code" title={roomTitle}>
            {roomCode}
          </span>
          <button
            type="button"
            className="call-topbar-icon-btn"
            onClick={handleCopyInvite}
            aria-label="Copy meeting invite link"
            title="Copy meeting invite link"
          >
            {copiedInvite ? <CheckIcon /> : <LnkIcon />}
          </button>
          {bandwidthMode !== 'standard' && (
            <span
              className="call-bw-mode-badge"
              data-testid="active-bw-mode-badge"
            >
              {bandwidthMode === 'audio_only' ? 'Audio-Only' : 'Data Saver'}
            </span>
          )}
        </div>

        {connectionBanner && (
          <div
            className={`call-conn-banner ${connectionBanner.tone}`}
            role="status"
            aria-live="polite"
          >
            <span>{connectionBanner.text}</span>
          </div>
        )}

        <div className="call-topbar-right">
          <BackendStatusIndicator compact />
          <div
            className="call-participants-chip"
            title={`${totalParticipantCount} of ${MESH_MAX_PARTICIPANTS} participants in call`}
          >
            <Avatar
              name={displayName || user?.displayName || 'You'}
              src={user?.avatarUrl}
              className="call-topbar-avatar"
            />
            <span>{totalParticipantCount}</span>
          </div>

          {totalParticipantCount === 2 && !effectiveSpotlightId && (
            <button
              type="button"
              className="call-topbar-icon-btn"
              onClick={() =>
                setManualPipPreference((prev) =>
                  prev !== null ? !prev : !layout.isPip,
                )
              }
              aria-label={
                layout.isPip
                  ? 'Switch to side-by-side grid'
                  : 'Switch to Picture-in-Picture'
              }
              title={
                layout.isPip
                  ? 'Switch to side-by-side grid'
                  : 'Switch to Picture-in-Picture'
              }
            >
              {layout.isPip ? <PanelRightIcon /> : <SwapIcon />}
            </button>
          )}

          <button
            type="button"
            className="call-topbar-icon-btn shortcuts-help-btn"
            onClick={() => setShowShortcutsModal(true)}
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard shortcuts (?)"
            data-testid="shortcuts-help-btn"
          >
            <InfoIcon />
          </button>

          <button
            type="button"
            className="call-topbar-icon-btn"
            onClick={onToggleTheme}
            aria-label="Toggle color theme"
            title="Toggle color theme"
          >
            {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* Center workspace: full-stage video canvas + optional side chat or host panel */}
      <div
        className={`call-body ${showChatPanel || showHostPanel ? 'with-chat' : ''}`}
      >
        <main
          ref={callStageRef}
          className={`call-stage mode-${layout.mode}`}
          style={{
            gridTemplateColumns:
              layout.mode === 'spotlight' || layout.mode === 'pip'
                ? undefined
                : `repeat(${layout.columns}, minmax(0, 1fr))`,
          }}
          data-layout-mode={layout.mode}
        >
          {/* Safari/iOS Autoplay Audio Unlock Banner */}
          {safariAudioBlocked && (
            <div
              className="call-waiting-admit-banner safari-audio-unlock-banner"
              role="alert"
              data-testid="safari-audio-unlock-banner"
            >
              <div className="waiting-admit-text">
                <strong>Browser paused incoming call audio</strong>
              </div>
              <div className="waiting-admit-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleUnlockSafariAudio}
                >
                  Tap to resume audio
                </button>
              </div>
            </div>
          )}

          {/* Host Waiting Room Admission Floating Banner */}
          {canModerate && waitingPeers.length > 0 && (
            <div
              className="call-waiting-admit-banner"
              role="region"
              aria-label="Waiting room admission"
              data-testid="waiting-admit-banner"
            >
              <div className="waiting-admit-text">
                <strong>
                  {waitingPeers.length === 1
                    ? `${waitingPeers[0]!.displayName} wants to join this call`
                    : `${waitingPeers.length} people are waiting to join`}
                </strong>
              </div>
              <div className="waiting-admit-actions">
                {waitingPeers.length === 1 ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleHostDeny(waitingPeers[0]!.id)}
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => handleHostAdmit(waitingPeers[0]!.id)}
                      data-testid="admit-waiting-btn"
                    >
                      Admit
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setShowHostPanel(true);
                        setShowChatPanel(false);
                      }}
                    >
                      Review queue
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={handleHostAdmitAll}
                    >
                      Admit all ({waitingPeers.length})
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Ask-to-Unmute Prompt Banner from Host */}
          {unmutePromptFrom && (
            <div
              className="call-waiting-admit-banner"
              role="alertdialog"
              aria-label="Host requested unmute"
              data-testid="ask-unmute-banner"
            >
              <div className="waiting-admit-text">
                <strong>
                  {unmutePromptFrom} asked you to unmute your microphone
                </strong>
              </div>
              <div className="waiting-admit-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setUnmutePromptFrom(null)}
                >
                  Stay muted
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setUnmutePromptFrom(null);
                    if (audioMuted) {
                      handleToggleMic();
                    }
                  }}
                >
                  Unmute now
                </button>
              </div>
            </div>
          )}
          {/* Floating ephemeral reactions overlay */}
          {floatingReactions.length > 0 && (
            <div
              className="floating-reactions-layer"
              aria-hidden="true"
              data-testid="floating-reactions"
            >
              {floatingReactions.map((rx) => (
                <div key={rx.id} className="floating-reaction-pill">
                  <span className="rx-emoji">{rx.emoji}</span>
                  <span className="rx-name">{rx.displayName}</span>
                </div>
              ))}
            </div>
          )}

          {/* Compact floating "Your meeting's ready" card (never occupies a grid cell) */}
          {remoteList.length === 0 &&
            !activeScreenTile &&
            !dismissedReadyCard && (
              <div className="call-ready-float" data-testid="waiting-for-peer">
                <div className="call-ready-float-head">
                  <strong>Your meeting&apos;s ready</strong>
                  <button
                    type="button"
                    className="call-ready-close"
                    onClick={() => setDismissedReadyCard(true)}
                    aria-label="Dismiss meeting info card"
                    title="Dismiss"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <p>
                  Share this meeting link with others you want in the call (up
                  to {MESH_MAX_PARTICIPANTS} participants).
                </p>
                <div className="call-ready-link-box">
                  <span>{inviteUrl.replace(/^https?:\/\//, '')}</span>
                  <button
                    type="button"
                    className="call-ready-copy-btn"
                    onClick={handleCopyInvite}
                  >
                    {copiedInvite ? <CheckIcon /> : <LnkIcon />}
                    <span>{copiedInvite ? 'Copied' : 'Copy link'}</span>
                  </button>
                </div>
              </div>
            )}

          {/* Active Screen Share Tile (when anyone is sharing their screen) */}
          {activeScreenTile && (
            <ScreenShareTile
              stream={activeScreenTile.stream}
              ownerName={activeScreenTile.ownerName}
              isPinned={effectiveSpotlightId === activeScreenTile.id}
              onTogglePin={() =>
                setPinnedTargetId((curr) =>
                  curr === activeScreenTile.id ? null : activeScreenTile.id,
                )
              }
            />
          )}

          {/* Remote Participant Tiles */}
          {remoteList.map((peer) => {
            const isFloating = Boolean(isPipActive && isRemoteFloating);
            return (
              <RemoteVideoTile
                key={peer.id}
                participant={peer}
                stats={peerStatsMap[peer.id]}
                audioOnlyMode={bandwidthMode === 'audio_only'}
                isSpeaking={activeSpeakerId === peer.id}
                isPinned={effectiveSpotlightId === peer.id}
                canModerate={canModerate}
                isFloating={isFloating}
                pipCorner={isFloating ? pipCorner : undefined}
                dragOffset={isFloating ? dragOffset : undefined}
                onPipPointerDown={isFloating ? handlePipPointerDown : undefined}
                onPipPointerMove={isFloating ? handlePipPointerMove : undefined}
                onPipPointerUp={isFloating ? handlePipPointerUp : undefined}
                onPipPointerCancel={
                  isFloating ? handlePipPointerCancel : undefined
                }
                onPipSwap={() => setIsPiPSwapped((prev) => !prev)}
                onTogglePin={() =>
                  setPinnedTargetId((curr) =>
                    curr === peer.id ? null : peer.id,
                  )
                }
                onMutePeer={() => handleHostMutePeer(peer.id)}
                onAskUnmutePeer={() =>
                  handleHostAskUnmute(peer.id, peer.displayName)
                }
                onRemovePeer={() =>
                  handleHostRemovePeer(peer.id, peer.displayName, false)
                }
                onAudioAutoplayBlocked={() => setSafariAudioBlocked(true)}
                onToast={onToast}
              />
            );
          })}

          {/* Local Participant Tile */}
          <div
            className={`call-tile local-tile ${activeSpeakerId === 'local' ? 'active-speaker-ring' : ''} ${effectiveSpotlightId === 'local' ? 'pinned-tile' : ''} ${!hasLocalVideoTrack ? 'camera-off-studio' : ''} ${
              isLocalFloating
                ? `pip-floating-tile corner-${pipCorner} ${dragOffset ? 'dragging' : ''}`
                : ''
            }`}
            style={
              isLocalFloating && dragOffset
                ? {
                    transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
                  }
                : undefined
            }
            onPointerDown={isLocalFloating ? handlePipPointerDown : undefined}
            onPointerMove={isLocalFloating ? handlePipPointerMove : undefined}
            onPointerUp={isLocalFloating ? handlePipPointerUp : undefined}
            onPointerCancel={
              isLocalFloating ? handlePipPointerCancel : undefined
            }
            data-testid="local-tile"
          >
            <video
              ref={callLocalVideoRef}
              muted
              autoPlay
              playsInline
              className={`tile-video ${hasLocalVideoTrack ? 'visible' : 'hidden'} ${!mirrorSelfView ? 'unmirrored' : ''}`}
            />
            {!hasLocalVideoTrack && (
              <div className="tile-avatar-fallback">
                <div
                  className={`tile-avatar-ring ${!audioMuted && micLevel > 12 ? 'speaking' : ''}`}
                >
                  <Avatar
                    name={displayName || user?.displayName || 'You'}
                    src={user?.avatarUrl}
                    className="tile-avatar-circle"
                  />
                </div>
                {bandwidthMode === 'audio_only' && !isLocalFloating && (
                  <small className="audio-only-tile-note">
                    Audio-Only mode active
                  </small>
                )}
              </div>
            )}

            {isLocalFloating && (
              <button
                type="button"
                className="pip-swap-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPiPSwapped((prev) => !prev);
                }}
                aria-label="Swap video views"
                title="Swap video views"
              >
                <SwapIcon />
              </button>
            )}

            <div className="tile-top-bar">
              <div className="tile-badges-left">
                {handRaised && (
                  <span className="hand-raised-pill">✋ Hand raised</span>
                )}
                {screenSharing && (
                  <span className="screen-pill">Sharing screen</span>
                )}
              </div>

              <div className="tile-hover-actions">
                <button
                  type="button"
                  className="tile-icon-btn"
                  onClick={handleToggleMirror}
                  title="Flip self-view mirror (L)"
                >
                  {mirrorSelfView ? 'Unmirror' : 'Mirror'}
                </button>
                <button
                  type="button"
                  className={`tile-icon-btn ${effectiveSpotlightId === 'local' ? 'active' : ''}`}
                  onClick={() =>
                    setPinnedTargetId((curr) =>
                      curr === 'local' ? null : 'local',
                    )
                  }
                >
                  {effectiveSpotlightId === 'local' ? 'Unpin' : 'Pin'}
                </button>
              </div>
            </div>

            <div className="tile-meta-bar">
              <div className="tile-name-badge">
                <span>{displayName || 'You'}</span>
                {selfRole === 'host' && <span className="role-pill">Host</span>}
                {selfRole === 'cohost' && (
                  <span className="role-pill">Cohost</span>
                )}
                {user ? (
                  <span
                    className="role-pill verified-tile-pill"
                    title="Verified account"
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    className="role-pill guest-tile-pill"
                    title="Guest attendee"
                  >
                    Guest
                  </span>
                )}
              </div>
              <div className="tile-status-icons">
                <NetworkBarsBadge
                  bars={localNetworkSummary.bars}
                  level={localNetworkSummary.level}
                  rttMs={localNetworkSummary.rttMs}
                  packetLossPct={localNetworkSummary.packetLossPct}
                  bitrateKbps={localNetworkSummary.bitrateKbps}
                />
                {audioMuted && <span className="muted-badge">Muted</span>}
              </div>
            </div>
          </div>
        </main>

        {/* People & Host Controls Side Panel */}
        {showHostPanel && (
          <aside
            className="call-chat-panel call-host-panel"
            aria-label="People and host controls"
            data-testid="host-panel"
          >
            <div className="chat-panel-header">
              <h3>
                {canModerate
                  ? 'Host Controls & People'
                  : `People (${totalParticipantCount})`}
              </h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setShowHostPanel(false)}
                aria-label="Close people and host controls"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="host-panel-scroll">
              {canModerate && (
                <section className="host-panel-sec">
                  <h4>Room Moderation &amp; Security</h4>
                  <div className="host-quick-buttons">
                    <button
                      type="button"
                      className={`btn ${roomLocked ? 'primary' : ''}`}
                      onClick={handleHostToggleLock}
                      data-testid="host-lock-btn"
                    >
                      {roomLocked ? '🔒 Unlock room' : '🔓 Lock room'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={handleHostMuteAll}
                      disabled={remoteList.length === 0}
                      data-testid="host-mute-all-btn"
                    >
                      Mute all
                    </button>
                    {isHost && (
                      <button
                        type="button"
                        className="btn danger-outline-btn"
                        onClick={handleHostEndMeeting}
                        data-testid="host-end-all-btn"
                      >
                        End meeting for all
                      </button>
                    )}
                  </div>

                  <div className="host-toggles-list">
                    <label className="popover-checkbox-row">
                      <input
                        type="checkbox"
                        checked={roomPermissions.waitingRoom}
                        onChange={(e) =>
                          handleHostUpdatePermission({
                            waitingRoom: e.target.checked,
                          })
                        }
                      />
                      <span>Waiting room (require host admission)</span>
                    </label>
                    <label className="popover-checkbox-row">
                      <input
                        type="checkbox"
                        checked={roomPermissions.allowGuestChat}
                        onChange={(e) =>
                          handleHostUpdatePermission({
                            allowGuestChat: e.target.checked,
                          })
                        }
                      />
                      <span>Allow guest chat messages</span>
                    </label>
                    <label className="popover-checkbox-row">
                      <input
                        type="checkbox"
                        checked={roomPermissions.allowGuestScreenShare}
                        onChange={(e) =>
                          handleHostUpdatePermission({
                            allowGuestScreenShare: e.target.checked,
                          })
                        }
                      />
                      <span>Allow guest screen sharing</span>
                    </label>
                    <label className="popover-checkbox-row">
                      <input
                        type="checkbox"
                        checked={roomPermissions.allowGuestReactions}
                        onChange={(e) =>
                          handleHostUpdatePermission({
                            allowGuestReactions: e.target.checked,
                          })
                        }
                      />
                      <span>Allow guest emoji reactions</span>
                    </label>
                  </div>
                </section>
              )}

              {/* Waiting Room Queue */}
              {canModerate && waitingPeers.length > 0 && (
                <section
                  className="host-panel-sec"
                  data-testid="waiting-queue-sec"
                >
                  <div className="host-sec-head">
                    <h4>Waiting Room ({waitingPeers.length})</h4>
                    <button
                      type="button"
                      className="btn primary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={handleHostAdmitAll}
                    >
                      Admit all
                    </button>
                  </div>
                  <div className="host-peer-list">
                    {waitingPeers.map((wp) => (
                      <div key={wp.id} className="host-peer-row">
                        <div className="host-peer-info">
                          <strong>{wp.displayName}</strong>
                          <small>
                            {wp.verified ? '✓ Verified' : 'Guest'} · Waiting
                          </small>
                        </div>
                        <div className="host-peer-actions">
                          <button
                            type="button"
                            className="btn"
                            onClick={() => handleHostDeny(wp.id)}
                          >
                            Deny
                          </button>
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => handleHostAdmit(wp.id)}
                          >
                            Admit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Active Participants Roster */}
              <section className="host-panel-sec">
                <h4>In Call ({totalParticipantCount})</h4>
                <div className="host-peer-list">
                  {/* Self row */}
                  <div className="host-peer-row">
                    <div className="host-peer-info">
                      <strong>{displayName || 'You'} (You)</strong>
                      <small>
                        Role: {selfRole.toUpperCase()} ·{' '}
                        {audioMuted ? 'Muted' : 'Mic on'}
                      </small>
                    </div>
                  </div>

                  {/* Remote peers */}
                  {remoteList.map((peer) => (
                    <div
                      key={peer.id}
                      className="host-peer-row"
                      data-testid="roster-peer-row"
                    >
                      <div className="host-peer-info">
                        <strong>{peer.displayName}</strong>
                        <small>
                          Role: {peer.role.toUpperCase()} ·{' '}
                          {peer.state.audio ? 'Mic on' : 'Muted'}
                        </small>
                      </div>

                      {canModerate && (
                        <div className="host-peer-actions">
                          {peer.state.audio ? (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleHostMutePeer(peer.id)}
                            >
                              Mute
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              onClick={() =>
                                handleHostAskUnmute(peer.id, peer.displayName)
                              }
                            >
                              Ask unmute
                            </button>
                          )}

                          {isHost && peer.role !== 'guest' && (
                            <select
                              className="host-role-select"
                              value={peer.role}
                              aria-label={`Change role for ${peer.displayName}`}
                              onChange={(e) =>
                                handleHostSetRole(
                                  peer.id,
                                  e.target.value as
                                    'host' | 'cohost' | 'attendee',
                                )
                              }
                            >
                              <option value="attendee">Attendee</option>
                              <option value="cohost">Cohost</option>
                              <option value="host">Transfer Host</option>
                            </select>
                          )}

                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              handleHostRemovePeer(
                                peer.id,
                                peer.displayName,
                                false,
                              )
                            }
                            title="Remove from call"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            className="btn danger-outline-btn"
                            onClick={() =>
                              handleHostRemovePeer(
                                peer.id,
                                peer.displayName,
                                true,
                              )
                            }
                            title="Remove and block from rejoining this room"
                          >
                            Block
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        )}

        {/* In-call text chat panel */}
        {showChatPanel && (
          <aside
            className="call-chat-panel"
            aria-label="In-call chat"
            data-testid="chat-panel"
          >
            <div className="chat-panel-header">
              <h3>In-call messages</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setShowChatPanel(false)}
                aria-label="Close chat panel"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="chat-messages-list" data-testid="chat-messages">
              {chatMessages.length === 0 ? (
                <p className="chat-empty-hint">
                  Messages sent here are visible to everyone in the call.
                </p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="chat-message-item">
                    <div className="chat-message-meta">
                      <strong>{msg.displayName}</strong>
                      <time>
                        {new Date(msg.ts).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                    <p>{msg.text}</p>
                  </div>
                ))
              )}
            </div>

            <form className="chat-input-row" onSubmit={handleSendChat}>
              <input
                type="text"
                placeholder="Send a message to everyone…"
                value={chatDraft}
                maxLength={2000}
                onChange={(e) => setChatDraft(e.target.value)}
                aria-label="Chat message"
                data-testid="chat-input"
              />
              <button
                type="submit"
                className="btn primary"
                disabled={!chatDraft.trim()}
                data-testid="chat-send-btn"
              >
                Send
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Google Meet-Style 3-Zone Bottom Control Bar */}
      <footer className="call-dock-bar">
        <div className="call-dock-left">
          <span className="dock-room-title">{roomTitle}</span>
        </div>

        <div className="call-dock" role="toolbar" aria-label="Call controls">
          <button
            type="button"
            className={`dock-btn icon-pill ${audioMuted ? 'off' : ''}`}
            onClick={handleToggleMic}
            aria-pressed={!audioMuted}
            aria-label={
              audioMuted ? 'Unmute microphone (M)' : 'Mute microphone (M)'
            }
            title={audioMuted ? 'Unmute microphone (M)' : 'Mute microphone (M)'}
            data-testid="call-mic-btn"
          >
            <MicIcon />
            <span className="dock-btn-label">
              {audioMuted ? 'Unmute' : 'Mute'}
            </span>
          </button>

          <button
            type="button"
            className={`dock-btn icon-pill ${!videoEnabled ? 'off' : ''}`}
            onClick={() => void handleToggleVideo()}
            aria-pressed={videoEnabled}
            aria-label={videoEnabled ? 'Stop camera (V)' : 'Start camera (V)'}
            title={videoEnabled ? 'Stop camera (V)' : 'Start camera (V)'}
            data-testid="call-cam-btn"
          >
            <VidIcon />
            <span className="dock-btn-label">
              {videoEnabled ? 'Camera' : 'Start cam'}
            </span>
          </button>

          <button
            type="button"
            className={`dock-btn icon-pill ${screenSharing ? 'active-share' : ''}`}
            onClick={() => void handleToggleScreenShare()}
            aria-pressed={screenSharing}
            aria-label={
              screenSharing ? 'Stop screen sharing (S)' : 'Share screen (S)'
            }
            title={
              screenSharing ? 'Stop screen sharing (S)' : 'Share screen (S)'
            }
            data-testid="call-screen-btn"
          >
            <ScrIcon />
            <span className="dock-btn-label">
              {screenSharing ? 'Stop share' : 'Present'}
            </span>
          </button>

          {/* Ephemeral Reactions popover (floating emoji bar above dock like Google Meet) */}
          <div className="dock-popover-anchor">
            <button
              type="button"
              className={`dock-btn icon-pill ${showReactionPopover ? 'active-panel' : ''}`}
              onClick={() => {
                setShowReactionPopover((v) => !v);
                setShowDevicePopover(false);
              }}
              aria-expanded={showReactionPopover}
              aria-label="Send reaction"
              title="Send a reaction"
              data-testid="call-react-btn"
            >
              <span aria-hidden="true" style={{ fontSize: 18 }}>
                😊
              </span>
              <span className="dock-btn-label">React</span>
            </button>

            {showReactionPopover && (
              <div
                className="call-reaction-popover"
                role="toolbar"
                aria-label="Choose a reaction"
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="reaction-choice-btn"
                    onClick={() => handleSendReaction(emoji)}
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`dock-btn icon-pill ${handRaised ? 'active-hand' : ''}`}
            onClick={handleToggleHand}
            aria-pressed={handRaised}
            aria-label={handRaised ? 'Lower hand (H)' : 'Raise hand (H)'}
            title={handRaised ? 'Lower hand (H)' : 'Raise hand (H)'}
            data-testid="call-hand-btn"
          >
            <span aria-hidden="true" style={{ fontSize: 17 }}>
              ✋
            </span>
            <span className="dock-btn-label">
              {handRaised ? 'Lower' : 'Hand'}
            </span>
          </button>

          {/* Devices & Sound Settings popover */}
          <div className="dock-popover-anchor">
            <button
              type="button"
              className={`dock-btn icon-pill ${showDevicePopover ? 'active-panel' : ''}`}
              onClick={() => {
                setShowDevicePopover((v) => !v);
                setShowReactionPopover(false);
              }}
              aria-expanded={showDevicePopover}
              aria-label="Audio, video, and call settings"
              title="Audio, video, and call options"
              data-testid="call-options-btn"
            >
              <SetIcon />
              <span className="dock-btn-label">Options</span>
            </button>

            {showDevicePopover && (
              <div
                className="call-device-popover"
                role="dialog"
                aria-label="Switch active devices and options"
              >
                <label className="device-select-group">
                  <span>Bandwidth &amp; Data Mode</span>
                  <select
                    aria-label="Select bandwidth mode"
                    value={bandwidthMode}
                    onChange={(e) =>
                      void handleSelectBandwidthMode(
                        e.target.value as BandwidthMode,
                      )
                    }
                    data-testid="call-bandwidth-select"
                  >
                    <option value="standard">
                      Standard HD (Adaptive video)
                    </option>
                    <option value="data_saver">
                      Data Saver (220 kbps video cap)
                    </option>
                    <option value="audio_only">
                      Audio-Only (Pause all video)
                    </option>
                  </select>
                </label>

                <label className="device-select-group">
                  <span>Microphone</span>
                  <select
                    value={prefs.audioInputId}
                    onChange={(e) =>
                      void handleSelectDevice('audioInputId', e.target.value)
                    }
                  >
                    <option value="">Default microphone</option>
                    {devices.microphones.map((m, idx) => (
                      <option key={m.deviceId || idx} value={m.deviceId}>
                        {m.label || `Microphone ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="device-select-group">
                  <span>Camera</span>
                  <select
                    value={prefs.videoInputId}
                    onChange={(e) =>
                      void handleSelectDevice('videoInputId', e.target.value)
                    }
                  >
                    <option value="">Default camera</option>
                    {devices.cameras.map((c, idx) => (
                      <option key={c.deviceId || idx} value={c.deviceId}>
                        {c.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="popover-checkbox-row">
                  <input
                    type="checkbox"
                    checked={mirrorSelfView}
                    onChange={handleToggleMirror}
                  />
                  <span>Mirror self-view (L)</span>
                </label>

                <label className="popover-checkbox-row">
                  <input
                    type="checkbox"
                    checked={soundsEnabled}
                    onChange={handleToggleSounds}
                  />
                  <span>Join / leave sound chimes</span>
                </label>
              </div>
            )}
          </div>

          {/* Leave Call or End Meeting for All (when Host) */}
          <div className="dock-popover-anchor">
            <button
              type="button"
              className="dock-btn end"
              onClick={() => {
                if (isHost && remoteList.length > 0) {
                  setShowLeaveMenu((v) => !v);
                } else {
                  handleHangUp();
                }
              }}
              aria-label="Leave call"
              title="Leave call"
              data-testid="leave-call-btn"
            >
              <EndIcon />
            </button>

            {showLeaveMenu && isHost && (
              <>
                <div
                  className="leave-modal-backdrop"
                  onClick={() => setShowLeaveMenu(false)}
                />
                <div
                  className="call-leave-popover"
                  role="dialog"
                  aria-label="Leave or end meeting"
                >
                  <div className="call-leave-header">
                    <h4>End meeting?</h4>
                    <p>
                      You are the host. Choose whether to end the call for
                      everyone or leave and transfer host.
                    </p>
                  </div>
                  <div className="call-leave-actions">
                    <button
                      type="button"
                      className="btn danger-fill"
                      onClick={() => {
                        setShowLeaveMenu(false);
                        handleHostEndMeeting();
                      }}
                      data-testid="confirm-end-all-btn"
                    >
                      End meeting for all
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        setShowLeaveMenu(false);
                        handleHangUp();
                      }}
                      data-testid="confirm-leave-call-btn"
                    >
                      Leave call (transfer host)
                    </button>
                    <button
                      type="button"
                      className="btn cancel"
                      onClick={() => setShowLeaveMenu(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="call-dock-right">
          {/* People & Host Controls toggle button with waiting room badge */}
          <button
            type="button"
            className={`call-side-btn ${showHostPanel ? 'active-panel' : ''}`}
            onClick={() => {
              setShowHostPanel((v) => !v);
              setShowChatPanel(false);
            }}
            aria-pressed={showHostPanel}
            aria-label="Toggle people and host controls"
            title="People & Host Controls"
            data-testid="call-host-btn"
          >
            <UsrIcon />
            <span>{canModerate ? 'Host' : 'People'}</span>
            {waitingPeers.length > 0 && (
              <span className="unread-chat-badge" data-testid="waiting-badge">
                {waitingPeers.length}
              </span>
            )}
          </button>

          {/* In-call Chat toggle button with unread badge */}
          <button
            type="button"
            className={`call-side-btn ${showChatPanel ? 'active-panel' : ''}`}
            onClick={() => {
              setShowChatPanel((v) => !v);
              setShowHostPanel(false);
            }}
            aria-pressed={showChatPanel}
            aria-label="Toggle in-call chat (C)"
            title="Toggle in-call chat (C)"
            data-testid="call-chat-btn"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Chat</span>
            {unreadChatCount > 0 && (
              <span className="unread-chat-badge" data-testid="unread-badge">
                {unreadChatCount}
              </span>
            )}
          </button>
        </div>
      </footer>

      {/* Keyboard shortcuts help modal overlay */}
      {showShortcutsModal && (
        <div
          className="shortcuts-modal-backdrop"
          onClick={() => setShowShortcutsModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          data-testid="shortcuts-modal"
        >
          <div
            className="shortcuts-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-modal-head">
              <h3>Keyboard shortcuts</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setShowShortcutsModal(false)}
                aria-label="Close shortcuts help"
              >
                <CloseIcon />
              </button>
            </div>
            <ul className="shortcuts-list">
              <li>
                <span>Mute / unmute microphone</span>
                <kbd>M</kbd>
              </li>
              <li>
                <span>Start / stop camera</span>
                <kbd>V</kbd>
              </li>
              <li>
                <span>Start / stop screen share</span>
                <kbd>S</kbd>
              </li>
              <li>
                <span>Raise / lower hand</span>
                <kbd>H</kbd>
              </li>
              <li>
                <span>Open / close in-call chat</span>
                <kbd>C</kbd>
              </li>
              <li>
                <span>Toggle mirror self-view</span>
                <kbd>L</kbd>
              </li>
              <li>
                <span>Show / hide this help overlay</span>
                <kbd>?</kbd>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
