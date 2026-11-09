import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  MeshTransport,
  LiveKitTransport,
  type MediaTransport,
  type BandwidthMode,
  type ConnectionState,
  type NetworkQualityBars,
  type NetworkQualityLevel,
  type PeerNetworkStats,
} from '@meetit/media';
import type {
  AgendaItem,
  BreakoutRoom,
  BreakoutState,
  ChatAttachment,
  FormItSession,
  HandRaiseItem,
  MeetingTimer,
  NotesDoc,
  PeerInfo,
  PeerRole,
  PeerState,
  PollItem,
  QaItem,
  ReactionEmoji,
  RoomPermissions,
  WaitingPeer,
  WhiteboardAction,
  WebinarState,
  WebinarQaItem,
} from '@meetit/protocol';
import { WebinarWaitingScreen } from './WebinarWaitingScreen';
import { WebinarStreamModal } from './WebinarStreamModal';
import { WebinarAnalyticsModal } from './WebinarAnalyticsModal';
import { WebinarSimulivePlayer } from './WebinarSimulivePlayer';
import { WebinarQaPanel } from './WebinarQaPanel';
import { BreakoutModal } from './BreakoutModal';
import { PollsPanel } from './PollsPanel';
import { FormItModal } from './FormItModal';
import { QAPanel } from './QAPanel';
import { WhiteboardModal } from './WhiteboardModal';
import { SharedNotesPanel } from './SharedNotesPanel';
import { TimerAgendaWidget } from './TimerAgendaWidget';
import {
  VideoEffectsModal,
  loadSavedVideoEffects,
  saveVideoEffects,
} from './VideoEffectsModal';
import {
  AudioEffectsModal,
  loadSavedAudioEffects,
  saveAudioEffects,
} from './AudioEffectsModal';
import {
  AppsMarketplaceModal,
  type MarketplaceApp,
} from './AppsMarketplaceModal';
import {
  translateCaption,
  speakDubbedCaption,
} from '../lib/translationService';
import {
  type VideoEffectsConfig,
  VideoEffectProcessor,
  type AudioEffectsConfig,
  AudioEffectProcessor,
  SpatialAudioEngine,
} from '@meetit/media';
import {
  Users as UsersIcon,
  BarChart3 as BarChartIcon,
  ClipboardList as ClipboardIcon,
  HelpCircle as HelpIcon,
  Paintbrush as PaintbrushIcon,
  FileText as FileTextIcon,
  Radio as RadioIcon,
  TrendingUp as TrendingUpIcon,
  MessageSquare as MessageSquareIcon,
  Smile as SmileIcon,
  Hand as HandIcon,
  Circle as CircleIcon,
  Paperclip as PaperclipIcon,
  Lock as LockIcon,
  Unlock as UnlockIcon,
  Square as SquareIcon,
  MoreHorizontal as MoreHorizontalIcon,
  X as XIcon,
  Sliders as SlidersIcon,
  Clock as ClockIcon,
  Sparkles as SparklesIcon,
  Volume2 as Volume2Icon,
  ShieldAlert as ShieldAlertIcon,
  Languages as LanguagesIcon,
  LayoutGrid as LayoutGridIcon,
} from 'lucide-react';
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
import { getSavedPreferredRegion } from '../lib/regions';
import {
  findRoomMetadataByCode,
  recordCompletedMeetingSession,
  type MeetingAttendeeRecord,
} from '../lib/meetingsStore';
import {
  ensureNoteForCompletedMeeting,
  regenerateNoteWithAI,
} from '../lib/notesStore';
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
import { CaptionsOverlay, type DisplayCaptionCue } from './CaptionsOverlay';
import {
  CaptionSettingsModal,
  type CaptionConfig,
} from './CaptionSettingsModal';
import {
  SpeechRecognitionService,
  isSpeechRecognitionSupported,
} from '../lib/speechRecognition';
import {
  persistTranscript,
  formatMsToClock,
  type TranscriptCue,
} from '../lib/transcriptsStore';
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
  seq?: number | undefined;
  from: string;
  displayName: string;
  text: string;
  ts: number;
  replyToId?: string | undefined;
  mentions?: string[] | undefined;
  file?:
    | {
        name: string;
        size: number;
        url: string;
        mime: string;
      }
    | undefined;
  reactions?: Record<string, string[]> | undefined;
}

interface FloatingReaction {
  id: string;
  displayName: string;
  emoji: string;
  offsetX?: number;
}

const DISPLAY_NAME_STORAGE_KEY = 'meetit_guest_display_name';
const MIRROR_SELF_STORAGE_KEY = 'meetit_mirror_self_view';
const CALL_SOUNDS_STORAGE_KEY = 'meetit_call_sounds_enabled';
const BANDWIDTH_MODE_STORAGE_KEY = 'meetit_bandwidth_mode';
const REACTION_EMOJIS: string[] = [
  '👍',
  '👏',
  '❤️',
  '🎉',
  '😂',
  '😮',
  '🚀',
  '🔥',
  '💡',
  '💯',
  '🤝',
  '🙌',
];

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
  handRaiseOrder,
  onLowerHand,
  isFloating = false,
  pipCorner = 'bottom-right',
  dragOffset = null,
  onPipPointerDown,
  onPipPointerMove,
  onPipPointerUp,
  onPipPointerCancel,
  onPipSwap,
  onTogglePin,
  isSignInterpreter = false,
  onToggleSignInterpreter,
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
  handRaiseOrder?: number | null | undefined;
  onLowerHand?: (() => void) | undefined;
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
  isSignInterpreter?: boolean | undefined;
  onToggleSignInterpreter?: (() => void) | undefined;
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
              title={`${participant.displayName} raised their hand${handRaiseOrder ? ` (#${handRaiseOrder})` : ''}`}
            >
              <HandIcon
                size={12}
                style={{ display: 'inline', marginRight: 4 }}
              />
              {handRaiseOrder ? `#${handRaiseOrder} ` : ''}Hand raised
              {canModerate && onLowerHand && (
                <button
                  type="button"
                  className="tile-action-btn lower-hand-btn"
                  title="Lower hand"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLowerHand();
                  }}
                  style={{
                    marginLeft: 6,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    fontWeight: 'bold',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          )}
          {isSignInterpreter && (
            <span
              className="role-pill"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title="Designated Sign Language Interpreter (video stream prioritized)"
            >
              <LanguagesIcon size={12} />
              Sign Interpreter
            </span>
          )}
          {participant.state.screen && (
            <span className="screen-pill">Sharing screen</span>
          )}
        </div>

        <div className="tile-hover-actions">
          {onToggleSignInterpreter && (
            <button
              type="button"
              className={`tile-icon-btn ${isSignInterpreter ? 'active' : ''}`}
              onClick={onToggleSignInterpreter}
              title={
                isSignInterpreter
                  ? 'Remove sign language interpreter designation'
                  : 'Designate as sign language interpreter'
              }
              aria-label={
                isSignInterpreter
                  ? 'Remove sign language interpreter designation'
                  : 'Designate as sign language interpreter'
              }
              data-testid="toggle-interpreter-btn"
            >
              {isSignInterpreter ? 'Interpreter' : 'Sign mode'}
            </button>
          )}
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
  const [showMoreActivitiesSheet, setShowMoreActivitiesSheet] = useState(false);
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

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );
  const [recordingDuration, setRecordingDuration] = useState('00:00');
  const [showRecordingConsentNotice, setShowRecordingConsentNotice] =
    useState(false);
  const [showStartRecordingConfirm, setShowStartRecordingConfirm] =
    useState(false);
  const [recordingLayoutChoice, setRecordingLayoutChoice] = useState<
    'grid' | 'speaker'
  >('grid');
  const [recordingAudioOnlyChoice, setRecordingAudioOnlyChoice] =
    useState(false);
  const [recordingIsoChoice, setRecordingIsoChoice] = useState(false);
  const [recordingRetentionChoice, setRecordingRetentionChoice] =
    useState<number>(30);

  // Closed Captions & Transcription State
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [showCaptionSettings, setShowCaptionSettings] = useState(false);
  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({
    language: 'en-US',
    fontSize: 'medium',
    position: 'bottom',
    vocabulary: [],
    targetLanguage: 'none',
    showDualLanguage: true,
    dubbingEnabled: false,
  });
  const captionConfigRef = useRef(captionConfig);
  captionConfigRef.current = captionConfig;
  const [signLanguageInterpreterId, setSignLanguageInterpreterId] = useState<
    string | null
  >(null);
  const [liveCues, setLiveCues] = useState<DisplayCaptionCue[]>([]);
  const speechServiceRef = useRef<SpeechRecognitionService | null>(null);
  const transcriptCuesRef = useRef<TranscriptCue[]>([]);
  const meetingStartTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isRecording || !recordingStartedAt) {
      setRecordingDuration('00:00');
      return;
    }
    const update = () => {
      const elapsedSecs = Math.max(
        0,
        Math.floor((Date.now() - recordingStartedAt) / 1000),
      );
      const hrs = Math.floor(elapsedSecs / 3600);
      const mins = Math.floor((elapsedSecs % 3600) / 60);
      const secs = elapsedSecs % 60;
      if (hrs > 0) {
        setRecordingDuration(
          `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        );
      } else {
        setRecordingDuration(
          `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        );
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording, recordingStartedAt]);

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

  // Collaboration (Phase 6) state
  const [showBreakoutModal, setShowBreakoutModal] = useState(false);
  const [showPollsPanel, setShowPollsPanel] = useState(false);
  const [showFormItModal, setShowFormItModal] = useState(false);
  const [showQAPanel, setShowQAPanel] = useState(false);
  const [showWhiteboardModal, setShowWhiteboardModal] = useState(false);
  const [showSharedNotesPanel, setShowSharedNotesPanel] = useState(false);
  const [showTimerConfigModal, setShowTimerConfigModal] = useState(false);
  const [showAppsModal, setShowAppsModal] = useState(false);
  const [activeMarketplaceApp, setActiveMarketplaceApp] =
    useState<MarketplaceApp | null>(null);
  const [showVideoEffectsModal, setShowVideoEffectsModal] = useState(false);
  const [videoEffectsConfig, setVideoEffectsConfig] =
    useState<VideoEffectsConfig>(() => loadSavedVideoEffects());
  const videoProcessorRef = useRef<VideoEffectProcessor | null>(null);
  const rawCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const [showAudioEffectsModal, setShowAudioEffectsModal] = useState(false);
  const [audioEffectsConfig, setAudioEffectsConfig] =
    useState<AudioEffectsConfig>(() => loadSavedAudioEffects());
  const audioProcessorRef = useRef<AudioEffectProcessor | null>(null);
  const rawAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const spatialAudioRef = useRef<SpatialAudioEngine | null>(null);
  const [feedbackDetected, setFeedbackDetected] = useState(false);

  const [breakoutState, setBreakoutState] = useState<BreakoutState>({
    active: false,
    rooms: [],
  });
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [formItSession, setFormItSession] = useState<FormItSession | null>(
    null,
  );
  const [qaQuestions, setQaQuestions] = useState<QaItem[]>([]);
  const [handRaiseQueue, setHandRaiseQueue] = useState<HandRaiseItem[]>([]);
  const [whiteboardHistory, setWhiteboardHistory] = useState<
    WhiteboardAction[]
  >([]);
  const [notesDoc, setNotesDoc] = useState<NotesDoc>({
    content: '',
    version: 1,
    lastUpdatedAt: Date.now(),
  });
  const [meetingTimer, setMeetingTimer] = useState<MeetingTimer | null>(null);

  // Phase 7 Webinar State
  const [webinarState, setWebinarState] = useState<WebinarState | null>(null);
  const [webinarQaQuestions, setWebinarQaQuestions] = useState<WebinarQaItem[]>(
    [],
  );
  const [showWebinarStreamModal, setShowWebinarStreamModal] = useState(false);
  const [showWebinarAnalyticsModal, setShowWebinarAnalyticsModal] =
    useState(false);
  const [showWebinarQaPanel, setShowWebinarQaPanel] = useState(false);
  const [showSimulivePlayer, setShowSimulivePlayer] = useState(false);

  const webinarTokenParam = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return (
      new URLSearchParams(window.location.search).get('webinarToken') ||
      undefined
    );
  }, []);

  // Enhanced chat: replies, file attachments
  const [replyingToMessage, setReplyingToMessage] = useState<ChatItem | null>(
    null,
  );
  const [chatAttachment, setChatAttachment] = useState<ChatAttachment | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [isSpeakerView, setIsSpeakerView] = useState(false);
  const [galleryPage, setGalleryPage] = useState(1);
  const [roomTransport, setRoomTransport] = useState<'mesh' | 'sfu'>('mesh');
  const [connectedRegion, setConnectedRegion] = useState<string | null>(null);
  const platformProfile = useMemo(() => detectBrowserPlatform(), []);

  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  const callLocalVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const transportRef = useRef<MediaTransport | null>(null);
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
        if (typeof transport.getPeerStats === 'function') {
          const stats = await transport.getPeerStats();
          if (!cancelled) {
            setPeerStatsMap(stats);
          }
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

  // Phase 9: Embeddable SDK bidirectional postMessage bridge
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isEmbedded =
      window.parent !== window ||
      new URLSearchParams(window.location.search).get('embed') === '1';

    if (!isEmbedded) return;

    // Notify parent frame that MeetIT iframe is loaded and ready
    window.parent.postMessage({ type: 'meetit:event:ready' }, '*');

    const handleEmbedCommand = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const { type, payload } = event.data;

      if (type === 'meetit:cmd:set_mic') {
        const targetEnabled = payload?.enabled ?? true;
        if (targetEnabled && audioMuted) {
          handleToggleMic();
        } else if (!targetEnabled && !audioMuted) {
          handleToggleMic();
        }
      } else if (type === 'meetit:cmd:set_camera') {
        const targetEnabled = payload?.enabled ?? true;
        if (targetEnabled && !videoEnabled) {
          void handleToggleVideo();
        } else if (!targetEnabled && videoEnabled) {
          void handleToggleVideo();
        }
      } else if (type === 'meetit:cmd:leave') {
        handleHangUp();
      } else if (type === 'meetit:cmd:send_chat' && payload?.text) {
        signalingRef.current?.sendChatMessage(payload.text);
      }
    };

    window.addEventListener('message', handleEmbedCommand);
    return () => window.removeEventListener('message', handleEmbedCommand);
  }, [audioMuted, videoEnabled]);

  // Phase 9: Forward meeting lifecycle events to embed parent frame
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    if (stage === 'call') {
      window.parent.postMessage(
        {
          type: 'meetit:event:joined',
          payload: {
            roomCode,
            selfId: signalingRef.current?.getSelfId(),
            displayName: displayName || user?.displayName || 'Guest',
          },
        },
        '*',
      );
    }
  }, [stage, roomCode, displayName, user?.displayName]);

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
        rawCameraTrackRef.current = newVideoTrack;
        let trackToPublish = newVideoTrack;
        const hasEffects =
          videoEffectsConfig.effect !== 'none' ||
          videoEffectsConfig.lowLightEnhancement ||
          videoEffectsConfig.touchUp ||
          videoEffectsConfig.autoFraming ||
          videoEffectsConfig.gestureReactions;

        if (hasEffects) {
          try {
            const processor = new VideoEffectProcessor(videoEffectsConfig);
            processor.onGesture((gesture) => {
              if (gesture === 'thumbs_up') {
                handleSendReaction('👍');
              } else if (gesture === 'hand_raise') {
                handleToggleHand();
              }
            });
            videoProcessorRef.current = processor;
            trackToPublish = await processor.processTrack(newVideoTrack);
          } catch (e) {
            console.error('Error applying video effects:', e);
          }
        }

        if (currentStream) {
          currentStream.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(currentStream.getTracks()));
        } else {
          localStreamRef.current = res.stream;
          setLocalStream(res.stream);
        }
        if (transportRef.current) {
          await transportRef.current.replaceTrack('camera', trackToPublish);
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

    const displayStream = await acquireDisplayMedia({
      withAudio: true,
      highRes: true,
    });
    const screenTrack = displayStream?.getVideoTracks()[0];
    const screenAudioTrack = displayStream?.getAudioTracks()[0];
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
          highRes: true,
        });
        if (screenAudioTrack) {
          await transportRef.current.publish(screenAudioTrack, 'screen_audio', {
            stream: displayStream,
          });
        }
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

      if (
        transportRef.current &&
        typeof transportRef.current.setBandwidthMode === 'function'
      ) {
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

  // Apply visual effects, virtual background, or AI framing to local camera
  const handleApplyVideoEffects = useCallback(
    async (newConfig: VideoEffectsConfig) => {
      setVideoEffectsConfig(newConfig);
      saveVideoEffects(newConfig);

      const currentVideoTrack =
        rawCameraTrackRef.current ||
        localStreamRef.current?.getVideoTracks()[0];
      if (!currentVideoTrack) {
        onToast('Visual effects applied for next camera start.');
        return;
      }

      if (!rawCameraTrackRef.current) {
        rawCameraTrackRef.current = currentVideoTrack;
      }

      const hasActiveEffects =
        newConfig.effect !== 'none' ||
        newConfig.lowLightEnhancement ||
        newConfig.touchUp ||
        newConfig.autoFraming ||
        newConfig.gestureReactions;

      if (!hasActiveEffects) {
        if (videoProcessorRef.current) {
          videoProcessorRef.current.stop();
          videoProcessorRef.current = null;
        }
        if (transportRef.current && rawCameraTrackRef.current) {
          await transportRef.current.replaceTrack(
            'camera',
            rawCameraTrackRef.current,
          );
        }
        onToast('Visual effects disabled.');
        return;
      }

      try {
        if (!videoProcessorRef.current) {
          const processor = new VideoEffectProcessor(newConfig);
          processor.onGesture((gesture) => {
            if (gesture === 'thumbs_up') {
              handleSendReaction('👍');
              onToast('👍 Gesture detected: Sent thumbs up');
            } else if (gesture === 'hand_raise') {
              handleToggleHand();
              onToast('✋ Gesture detected: Raised hand');
            }
          });
          videoProcessorRef.current = processor;
          const processedTrack = await processor.processTrack(
            rawCameraTrackRef.current,
          );
          if (transportRef.current) {
            await transportRef.current.replaceTrack('camera', processedTrack);
          }
        } else {
          videoProcessorRef.current.updateConfig(newConfig);
        }
        onToast('Visual effects updated.');
      } catch (err) {
        console.error('Failed to process video effects track:', err);
        onToast('Could not apply visual effects.');
      }
    },
    [handleSendReaction, handleToggleHand, onToast],
  );

  // Apply AI noise suppression, vocal boost, feedback guard, or spatial audio
  const handleApplyAudioEffects = useCallback(
    async (newConfig: AudioEffectsConfig) => {
      setAudioEffectsConfig(newConfig);
      saveAudioEffects(newConfig);

      // Handle adaptive voice-first mode
      if (newConfig.voiceFirstMode) {
        void handleSelectBandwidthMode('audio_only');
      }

      // Handle spatial audio toggle
      if (!spatialAudioRef.current && newConfig.spatialAudio) {
        spatialAudioRef.current = new SpatialAudioEngine(true);
      } else if (spatialAudioRef.current) {
        spatialAudioRef.current.setEnabled(newConfig.spatialAudio ?? false);
      }

      const currentAudioTrack =
        rawAudioTrackRef.current || localStreamRef.current?.getAudioTracks()[0];
      if (!currentAudioTrack) {
        onToast('Audio settings saved for next microphone session.');
        return;
      }

      if (!rawAudioTrackRef.current) {
        rawAudioTrackRef.current = currentAudioTrack;
      }

      const hasAudioProcessing =
        newConfig.noiseSuppression !== 'off' ||
        newConfig.voiceBoost ||
        newConfig.feedbackGuard;

      if (!hasAudioProcessing) {
        if (audioProcessorRef.current) {
          audioProcessorRef.current.stop();
          audioProcessorRef.current = null;
        }
        if (transportRef.current && rawAudioTrackRef.current) {
          await transportRef.current.replaceTrack(
            'microphone',
            rawAudioTrackRef.current,
          );
        }
        onToast('Audio processing disabled (raw capture).');
        return;
      }

      try {
        if (!audioProcessorRef.current) {
          const processor = new AudioEffectProcessor(newConfig);
          processor.onFeedbackDetected(() => {
            setFeedbackDetected(true);
            onToast(
              '⚠️ Echo / feedback loop detected! Check speakers or use headphones.',
            );
          });
          audioProcessorRef.current = processor;
          const cleanedTrack = await processor.processTrack(
            rawAudioTrackRef.current,
          );
          if (transportRef.current) {
            await transportRef.current.replaceTrack('microphone', cleanedTrack);
          }
        } else {
          audioProcessorRef.current.updateConfig(newConfig);
        }
        onToast('Audio intelligence settings updated.');
      } catch (err) {
        console.error('Failed to apply audio effects:', err);
        onToast('Could not apply audio settings.');
      }
    },
    [handleSelectBandwidthMode, onToast],
  );

  // Send in-call chat message
  const handleSendChat = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = chatDraft.trim();
      if (!trimmed && !chatAttachment) return;
      const mentions = trimmed.match(/@(\w+)/g)?.map((m) => m.slice(1));
      signalingRef.current?.sendChatMessage({
        text: trimmed || (chatAttachment ? chatAttachment.name : ''),
        ...(replyingToMessage?.id ? { replyToId: replyingToMessage.id } : {}),
        ...(mentions && mentions.length > 0 ? { mentions } : {}),
        ...(chatAttachment ? { file: chatAttachment } : {}),
      });
      setChatDraft('');
      setReplyingToMessage(null);
      setChatAttachment(null);
    },
    [chatDraft, chatAttachment, replyingToMessage],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        onToast('File too large (maximum 25MB allowed).');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setChatAttachment({
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream',
            url: reader.result,
          });
        }
      };
      reader.readAsDataURL(file);
    },
    [onToast],
  );

  const handleChatReaction = useCallback((messageId: string, emoji: string) => {
    signalingRef.current?.sendChatReaction(messageId, emoji);
  }, []);

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

    const savedRegion = getSavedPreferredRegion();
    const signaling = new SignalingClient({
      roomCode,
      displayName: cleanName,
      token,
      ...(enteredPasscode.trim() ? { passcode: enteredPasscode.trim() } : {}),
      initialState,
      ...(savedRegion ? { preferredRegion: savedRegion } : {}),
      ...(webinarTokenParam ? { webinarToken: webinarTokenParam } : {}),
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

    const wireTransport = (tr: MediaTransport) => {
      tr.on('activeSpeakersChanged', ({ speakerIds }) => {
        if (speakerIds.length > 0 && speakerIds[0]) {
          setActiveSpeakerId(speakerIds[0]);
        }
      });

      tr.on('trackSubscribed', ({ peerId, source, track, stream }) => {
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

        if (track.kind === 'audio' && spatialAudioRef.current) {
          const peerStream = stream ?? new MediaStream([track]);
          spatialAudioRef.current.attachPeerStream(peerId, peerStream);
        }
      });

      tr.on('trackUnsubscribed', ({ peerId, source }) => {
        if (source === 'microphone') {
          spatialAudioRef.current?.detachPeerStream(peerId);
        }
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

      tr.on('connectionStateChanged', ({ peerId, state: status }) => {
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
    };

    let transport: MediaTransport = new MeshTransport();
    wireTransport(transport);

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
      if (payload.roomState.recording) {
        setIsRecording(true);
        if (payload.roomState.recordingStartedAt) {
          setRecordingStartedAt(payload.roomState.recordingStartedAt);
        }
        if (payload.role !== 'host') {
          setShowRecordingConsentNotice(true);
        }
      } else {
        setIsRecording(false);
        setRecordingStartedAt(null);
        setShowRecordingConsentNotice(false);
      }
      if (payload.roomState.breakout) {
        setBreakoutState(payload.roomState.breakout);
      }
      if (payload.roomState.polls) {
        setPolls(payload.roomState.polls);
      }
      if (payload.roomState.formit !== undefined) {
        setFormItSession(payload.roomState.formit);
      }
      if (payload.roomState.qa) {
        setQaQuestions(payload.roomState.qa);
      }
      if (payload.roomState.handRaiseQueue) {
        setHandRaiseQueue(payload.roomState.handRaiseQueue);
      }
      if (payload.roomState.whiteboardHistory) {
        setWhiteboardHistory(payload.roomState.whiteboardHistory);
      }
      if (payload.roomState.notes) {
        setNotesDoc(payload.roomState.notes);
      }
      if (payload.roomState.timer !== undefined) {
        setMeetingTimer(payload.roomState.timer);
      }
      if (payload.roomState.webinar) {
        setWebinarState(payload.roomState.webinar);
      }
      if (payload.roomState.moderatedQa) {
        setWebinarQaQuestions(payload.roomState.moderatedQa);
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

      const isSfu = payload.transport === 'sfu' && Boolean(payload.livekit);
      setRoomTransport(payload.transport);
      if (payload.region) {
        setConnectedRegion(payload.region);
      }

      void (async () => {
        if (!hasConnectedTransportRef.current) {
          hasConnectedTransportRef.current = true;
          if (isSfu && payload.livekit) {
            void transport.disconnect();
            transport = new LiveKitTransport();
            wireTransport(transport);
            transportRef.current = transport;
          }

          await transport.connect({
            roomId: roomCode,
            selfId: payload.selfId,
            iceServers: payload.iceServers as RTCIceServer[],
            signaling,
            peerIds: payload.peers.map((p) => p.id),
            ...(payload.livekit ? { livekit: payload.livekit } : {}),
          });
          await transport.setBandwidthMode?.(bandwidthMode);

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
          await transport.setBandwidthMode?.(bandwidthMode);
        }
      })();
    });

    signaling.on('transport.promoted', ({ livekit }) => {
      onToast('Meeting promoted to LiveKit SFU mode.');
      setRoomTransport('sfu');
      if (livekit.region) {
        setConnectedRegion(livekit.region);
      }
      void (async () => {
        if (transportRef.current) {
          await transportRef.current.disconnect();
        }
        transport = new LiveKitTransport();
        wireTransport(transport);
        transportRef.current = transport;

        await transport.connect({
          roomId: roomCode,
          selfId: signaling.getSelfId() ?? 'self',
          iceServers: [],
          livekit,
        });
        await transport.setBandwidthMode?.(bandwidthMode);

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

    signaling.on('recording.started', (payload) => {
      setIsRecording(true);
      setRecordingStartedAt(payload.startedAt);
      const by = payload.byDisplayName || 'The host';
      const isoNotice = payload.isoTracks ? ' (ISO stems active)' : '';
      onToast(`${by} started recording this meeting${isoNotice}.`);
      announce(`${by} started recording this meeting${isoNotice}`);
      if (payload.byPeerId !== signaling.getSelfId()) {
        setShowRecordingConsentNotice(true);
      }
    });

    signaling.on('recording.stopped', (payload) => {
      setIsRecording(false);
      setRecordingStartedAt(null);
      setShowRecordingConsentNotice(false);
      const by = payload.byDisplayName || 'The host';
      onToast(`${by} stopped recording.`);
      announce(`${by} stopped recording`);
    });

    signaling.on('caption.cue', (cue) => {
      const displayCue: DisplayCaptionCue = {
        id: cue.id,
        from: cue.from,
        displayName: cue.displayName,
        text: cue.text,
        ts: cue.ts,
        isFinal: cue.isFinal,
        ...(cue.language ? { language: cue.language } : {}),
      };

      setLiveCues((prev) => {
        const existingIdx = prev.findIndex((c) => c.id === cue.id);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = displayCue;
          return next;
        }
        return [...prev.slice(-9), displayCue];
      });

      if (cue.isFinal) {
        const startMs = Math.max(0, cue.ts - meetingStartTimestampRef.current);
        transcriptCuesRef.current.push({
          id: cue.id,
          speakerName: cue.displayName,
          text: cue.text,
          startMs,
          cueOrder: transcriptCuesRef.current.length,
          ...(cue.language ? { language: cue.language } : {}),
        });
      }

      if (
        captionConfigRef.current.targetLanguage &&
        captionConfigRef.current.targetLanguage !== 'none'
      ) {
        const targetLang = captionConfigRef.current.targetLanguage;
        void translateCaption(cue.text, targetLang).then((translatedText) => {
          setLiveCues((prev) =>
            prev.map((c) =>
              c.id === cue.id
                ? {
                    ...c,
                    translatedText,
                    targetLanguage: targetLang,
                  }
                : c,
            ),
          );
          if (cue.isFinal && captionConfigRef.current.dubbingEnabled) {
            speakDubbedCaption(translatedText, targetLang);
          }
        });
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
        const next: ChatItem[] = [
          ...prev,
          {
            id: chatMsg.id,
            ...(chatMsg.seq !== undefined ? { seq: chatMsg.seq } : {}),
            from: chatMsg.from,
            displayName: chatMsg.displayName,
            text: chatMsg.text,
            ts: chatMsg.ts,
            ...(chatMsg.replyToId ? { replyToId: chatMsg.replyToId } : {}),
            ...(chatMsg.mentions ? { mentions: chatMsg.mentions } : {}),
            ...(chatMsg.file ? { file: chatMsg.file } : {}),
            ...(chatMsg.reactions ? { reactions: chatMsg.reactions } : {}),
          },
        ];
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

    signaling.on('chat.reaction.updated', ({ messageId, reactions }) => {
      setChatMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, reactions } : msg)),
      );
    });

    signaling.on('breakout.updated', (state) => {
      setBreakoutState(state);
      if (state.active) {
        onToast('Breakout rooms started.');
        announce('Breakout rooms started');
      } else {
        onToast('Breakout rooms ended.');
        announce('Breakout rooms ended');
      }
    });

    signaling.on('breakout.broadcast', ({ message, from }) => {
      onToast(`Broadcast from ${from}: ${message}`);
      announce(`Broadcast from ${from}: ${message}`);
    });

    signaling.on('poll.updated', ({ poll }) => {
      setPolls((prev) => [poll, ...prev.filter((p) => p.id !== poll.id)]);
      onToast(`Poll update: ${poll.question}`);
      announce(`Poll update: ${poll.question}`);
    });

    signaling.on('poll.deleted', ({ pollId }) => {
      setPolls((prev) => prev.filter((p) => p.id !== pollId));
    });

    signaling.on('formit.updated', (session) => {
      setFormItSession(session);
      if (session) {
        setShowFormItModal(true);
        onToast(`FormIT survey launched: ${session.title || session.slug}`);
      }
    });

    signaling.on('qa.updated', ({ question }) => {
      setQaQuestions((prev) => [
        question,
        ...prev.filter((q) => q.id !== question.id),
      ]);
      onToast(`❓ Q&A: ${question.question.slice(0, 40)}`);
    });

    signaling.on('qa.deleted', ({ questionId }) => {
      setQaQuestions((prev) => prev.filter((q) => q.id !== questionId));
    });

    signaling.on('handraise.updated', ({ queue }) => {
      setHandRaiseQueue(queue);
    });

    signaling.on('whiteboard.action', (action) => {
      setWhiteboardHistory((prev) => [...prev, action]);
    });

    signaling.on('notes.updated', (doc) => {
      setNotesDoc(doc);
    });

    signaling.on('timer.updated', (timer) => {
      setMeetingTimer(timer);
    });

    signaling.on('webinar.state', (state) => {
      setWebinarState(state);
    });

    signaling.on('webinar.qa_updated', ({ question }) => {
      setWebinarQaQuestions((prev) => {
        const idx = prev.findIndex((q) => q.id === question.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = question;
          return next;
        }
        return [question, ...prev];
      });
    });

    signaling.on('webinar.qa_deleted', ({ questionId }) => {
      setWebinarQaQuestions((prev) => prev.filter((q) => q.id !== questionId));
    });

    signaling.on('webinar.stream_updated', (streamOut) => {
      setWebinarState((prev) => (prev ? { ...prev, streamOut } : prev));
    });

    signaling.on('webinar.simulive_updated', (simulive) => {
      setWebinarState((prev) => (prev ? { ...prev, simulive } : prev));
    });

    signaling.on(
      'webinar.analytics_updated',
      ({ viewerCount, peakViewers }) => {
        setWebinarState((prev) =>
          prev ? { ...prev, viewerCount, peakViewers } : prev,
        );
      },
    );

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
      const createdNote = ensureNoteForCompletedMeeting({
        ownerId: user?.id ?? '',
        historyItem,
        chatTranscript: chatMessages,
        formItSurvey: formItSession
          ? {
              formUrl: formItSession.formUrl,
              slug: formItSession.slug,
              ...(formItSession.title ? { title: formItSession.title } : {}),
              submissionsCount: formItSession.submissionsCount,
            }
          : undefined,
        pollResults:
          polls.length > 0
            ? polls.map((p) => {
                const results: Record<string, number> = {};
                p.options.forEach((opt, idx) => {
                  results[opt] = Object.values(p.votes).filter((v) =>
                    v.includes(idx),
                  ).length;
                });
                return {
                  question: p.question,
                  options: p.options,
                  results,
                };
              })
            : undefined,
        collaborativeNotes: notesDoc?.content,
      });

      if (transcriptCuesRef.current.length > 0) {
        const transcriptText = transcriptCuesRef.current
          .map(
            (c) =>
              `[${formatMsToClock(c.startMs)}] ${c.speakerName}: ${c.text}`,
          )
          .join('\n');
        void regenerateNoteWithAI(createdNote.id, transcriptText);
      }
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

    if (speechServiceRef.current) {
      speechServiceRef.current.destroy();
      speechServiceRef.current = null;
    }

    if (transcriptCuesRef.current.length > 0) {
      const durSecs = callStartedAtRef.current
        ? Math.max(
            1,
            Math.floor((Date.now() - callStartedAtRef.current) / 1000),
          )
        : callSeconds || 60;
      void persistTranscript({
        id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        roomCode,
        roomTitle,
        startedAt: callStartedAtRef.current
          ? new Date(callStartedAtRef.current).toISOString()
          : new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds: durSecs,
        ...(user?.id ? { createdBy: user.id } : {}),
        cues: [...transcriptCuesRef.current],
      });
      transcriptCuesRef.current = [];
    }

    onLeaveCall(roomCode);
  };

  const handleToggleCaptions = () => {
    if (!isSpeechRecognitionSupported()) {
      onToast(
        'Speech recognition is not supported in this browser. Try Chrome, Edge, or Safari.',
      );
      return;
    }
    setCaptionsEnabled((prev) => {
      const next = !prev;
      if (next) {
        onToast('Closed Captions enabled');
      } else {
        onToast('Closed Captions disabled');
      }
      return next;
    });
  };

  useEffect(() => {
    if (!captionsEnabled || audioMuted || stage !== 'call') {
      if (speechServiceRef.current) {
        speechServiceRef.current.stop();
      }
      return;
    }

    if (!speechServiceRef.current) {
      speechServiceRef.current = new SpeechRecognitionService({
        language: captionConfig.language,
        vocabulary: captionConfig.vocabulary,
        onResult: (text, isFinal, lang) => {
          const selfDisplayName = displayName || user?.displayName || 'Me';
          const cueId = `cue-${signalingRef.current?.getSelfId() || 'me'}-${Date.now()}`;
          signalingRef.current?.sendCaption({
            text,
            isFinal,
            language: lang,
            cueId,
          });
          const now = Date.now();
          const cue: DisplayCaptionCue = {
            id: cueId,
            from: signalingRef.current?.getSelfId() || 'self',
            displayName: selfDisplayName,
            text,
            ts: now,
            isFinal,
            language: lang,
          };
          setLiveCues((prev) => {
            const existingIdx = prev.findIndex((c) => c.id === cue.id);
            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = cue;
              return updated;
            }
            return [...prev.slice(-9), cue];
          });
          if (isFinal) {
            const startMs = Math.max(0, now - meetingStartTimestampRef.current);
            transcriptCuesRef.current.push({
              id: cue.id,
              speakerName: selfDisplayName,
              text,
              startMs,
              cueOrder: transcriptCuesRef.current.length,
              language: lang,
            });
          }

          if (
            captionConfig.targetLanguage &&
            captionConfig.targetLanguage !== 'none'
          ) {
            const targetLang = captionConfig.targetLanguage;
            void translateCaption(text, targetLang).then((translatedText) => {
              setLiveCues((prev) =>
                prev.map((c) =>
                  c.id === cueId
                    ? {
                        ...c,
                        translatedText,
                        targetLanguage: targetLang,
                      }
                    : c,
                ),
              );
              if (isFinal && captionConfig.dubbingEnabled) {
                speakDubbedCaption(translatedText, targetLang);
              }
            });
          }
        },
        onError: (err) => {
          console.warn('Speech recognition warning:', err);
        },
      });
    } else {
      speechServiceRef.current.setLanguage(captionConfig.language);
      speechServiceRef.current.setVocabulary(captionConfig.vocabulary);
    }

    speechServiceRef.current.start();

    return () => {
      speechServiceRef.current?.stop();
    };
  }, [
    captionsEnabled,
    audioMuted,
    stage,
    captionConfig,
    displayName,
    user?.displayName,
  ]);

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

  // Update spatial audio stereo panning based on stage tile arrangement
  useEffect(() => {
    if (!spatialAudioRef.current) return;
    const total = remoteList.length;
    remoteList.forEach((peer, idx) => {
      const normalizedX = total > 1 ? idx / (total - 1) : 0.5;
      spatialAudioRef.current?.updatePeerPan(peer.id, normalizedX);
    });
  }, [remoteList]);

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

  const handleToggleSignInterpreter = (peerId: string) => {
    setSignLanguageInterpreterId((curr) => {
      const next = curr === peerId ? null : peerId;
      if (next) {
        transportRef.current?.setTrackResolutionTier?.(
          peerId,
          'camera',
          'high',
        );
        onToast('Designated as Sign Language Interpreter (stream prioritized)');
        announce('Sign language interpreter designated');
      } else {
        onToast('Sign language interpreter designation cleared');
      }
      return next;
    });
  };

  const effectiveSpotlightId =
    signLanguageInterpreterId ??
    pinnedTargetId ??
    (activeScreenTile
      ? activeScreenTile.id
      : isSpeakerView
        ? (activeSpeakerId ?? remoteList[0]?.id ?? 'local')
        : null);

  const layout = useMemo(
    () =>
      computeLayout(totalParticipantCount, {
        hasSpotlight: Boolean(effectiveSpotlightId),
        isPortrait,
        isSpeakerView,
        isSfu: roomTransport === 'sfu',
        page: galleryPage,
        ...(manualPipPreference !== null
          ? { preferPip: manualPipPreference }
          : {}),
      }),
    [
      totalParticipantCount,
      effectiveSpotlightId,
      isPortrait,
      isSpeakerView,
      roomTransport,
      galleryPage,
      manualPipPreference,
    ],
  );

  const visibleRemoteList = useMemo(() => {
    if (layout.mode === 'gallery') {
      const startIndex = (layout.page - 1) * layout.pageSize;
      return remoteList.slice(startIndex, startIndex + layout.pageSize);
    }
    return remoteList;
  }, [remoteList, layout.mode, layout.page, layout.pageSize]);

  useEffect(() => {
    const transport = transportRef.current;
    if (!transport || typeof transport.setTrackVisibility !== 'function')
      return;

    const visibleIds = new Set(visibleRemoteList.map((p) => p.id));
    for (const peer of remoteList) {
      const isVisible = visibleIds.has(peer.id);
      void transport.setTrackVisibility(peer.id, 'camera', isVisible);
      if (isVisible && typeof transport.setTrackResolutionTier === 'function') {
        const tier =
          layout.mode === 'spotlight' || layout.mode === 'speaker'
            ? 'high'
            : 'medium';
        void transport.setTrackResolutionTier(peer.id, 'camera', tier);
      }
    }
  }, [visibleRemoteList, remoteList, layout.mode]);

  const isPipActive = Boolean(layout.isPip && remoteList.length === 1);
  const isLocalFloating = isPipActive && !isPiPSwapped;
  const isRemoteFloating = isPipActive && isPiPSwapped;

  const canModerate = selfRole === 'host' || selfRole === 'cohost';

  const hasActiveActivity = useMemo(() => {
    return Boolean(
      breakoutState?.active ||
      polls.some((p) => !p.closed) ||
      formItSession ||
      qaQuestions.some((q) => !q.answered && !q.dismissed) ||
      waitingPeers.length > 0 ||
      unreadChatCount > 0 ||
      webinarQaQuestions.some(
        (q) => q.status === 'pending' || q.status === 'approved',
      ) ||
      webinarState?.streamOut?.status === 'live',
    );
  }, [
    breakoutState?.active,
    polls,
    formItSession,
    qaQuestions,
    waitingPeers.length,
    unreadChatCount,
    webinarQaQuestions,
    webinarState?.streamOut?.status,
  ]);
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

  const handleToggleRecording = () => {
    if (!canModerate) return;
    if (isRecording) {
      signalingRef.current?.stopRecording();
    } else {
      setShowStartRecordingConfirm(true);
    }
  };

  const handleConfirmStartRecording = () => {
    setShowStartRecordingConfirm(false);
    signalingRef.current?.startRecording({
      layout: recordingLayoutChoice,
      audioOnly: recordingAudioOnlyChoice,
      isoTracks: recordingIsoChoice,
      retentionDays: recordingRetentionChoice,
    });
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

                <button
                  type="button"
                  className={`ctrl-btn ${videoEffectsConfig.effect !== 'none' || videoEffectsConfig.lowLightEnhancement || videoEffectsConfig.touchUp || videoEffectsConfig.autoFraming || videoEffectsConfig.gestureReactions ? 'active' : ''}`}
                  onClick={() => setShowVideoEffectsModal(true)}
                  aria-label="Visual effects and virtual backgrounds"
                  title="Visual effects and virtual backgrounds"
                  data-testid="lobby-effects-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <SparklesIcon size={14} style={{ color: 'var(--accent)' }} />
                  <span>Effects</span>
                </button>

                <button
                  type="button"
                  className={`ctrl-btn ${audioEffectsConfig.noiseSuppression !== 'off' || audioEffectsConfig.voiceBoost || audioEffectsConfig.spatialAudio ? 'active' : ''}`}
                  onClick={() => setShowAudioEffectsModal(true)}
                  aria-label="Audio intelligence and noise suppression"
                  title="Audio intelligence and noise suppression"
                  data-testid="lobby-audio-fx-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Volume2Icon size={14} style={{ color: 'var(--accent)' }} />
                  <span>Audio FX</span>
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
                <label
                  htmlFor="lobbyPasscodeInput"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <LockIcon size={14} /> Room passcode *
                </label>
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
          {isRecording && (
            <div
              className="recording-indicator-chip"
              role="status"
              aria-label={`Recording in progress, duration ${recordingDuration}`}
              title={`Recording in progress (${recordingDuration})`}
              data-testid="recording-indicator"
            >
              <span className="recording-dot-pulse" aria-hidden="true" />
              <span className="recording-label">REC</span>
              <span className="recording-timer">{recordingDuration}</span>
            </div>
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

        <div className="call-topbar-center">
          <TimerAgendaWidget
            timer={
              meetingTimer || {
                type: 'countdown',
                durationSeconds: 900,
                running: false,
                agenda: [],
              }
            }
            isHost={canModerate}
            onSendTimerAction={(params) =>
              signalingRef.current?.sendTimerAction(params)
            }
            isConfigOpen={showTimerConfigModal}
            onToggleConfig={setShowTimerConfigModal}
          />
        </div>

        <div className="call-topbar-right">
          <BackendStatusIndicator compact />
          <div
            className="call-participants-chip"
            title={`${totalParticipantCount} of ${layout.maxParticipants} participants in call`}
          >
            <Avatar
              name={displayName || user?.displayName || 'You'}
              src={user?.avatarUrl}
              className="call-topbar-avatar"
            />
            <span>{totalParticipantCount}</span>
          </div>

          {connectedRegion && (
            <div
              className="call-region-chip"
              title={`Connected via LiveKit regional edge: ${connectedRegion}`}
            >
              <span className="region-dot" />
              <span>{connectedRegion.toUpperCase()}</span>
            </div>
          )}

          {totalParticipantCount > 2 && (
            <button
              type="button"
              className={`call-topbar-icon-btn ${isSpeakerView ? 'active-toggle-btn' : ''}`}
              onClick={() => setIsSpeakerView((prev) => !prev)}
              aria-label={
                isSpeakerView
                  ? 'Switch to Grid Gallery view'
                  : 'Switch to Speaker view'
              }
              title={
                isSpeakerView
                  ? 'Switch to Grid Gallery view'
                  : 'Switch to Speaker view'
              }
            >
              {isSpeakerView ? <PanelRightIcon /> : <VidIcon />}
            </button>
          )}

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

      {feedbackDetected && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: '58px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 150,
            background: 'var(--danger, #ef4444)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            fontWeight: 500,
          }}
          data-testid="feedback-loop-alert"
        >
          <ShieldAlertIcon size={18} />
          <span>
            Acoustic feedback / echo loop detected. Please use headphones.
          </span>
          <button
            type="button"
            onClick={() => {
              if (!audioMuted) handleToggleMic();
              setFeedbackDetected(false);
            }}
            style={{
              background: '#fff',
              color: 'var(--danger, #ef4444)',
              border: 0,
              padding: '4px 10px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Mute Mic
          </button>
          <button
            type="button"
            onClick={() => setFeedbackDetected(false)}
            aria-label="Dismiss feedback alert"
            style={{
              background: 'transparent',
              border: 0,
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {breakoutState?.active && (
        <div className="active-breakout-banner" data-testid="breakout-banner">
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <UsersIcon size={15} /> <strong>Breakout Session Active</strong>
            {breakoutState.rooms.find((r) =>
              r.peerIds.includes(signalingRef.current?.selfId ?? ''),
            )
              ? ` — You are in ${
                  breakoutState.rooms.find((r) =>
                    r.peerIds.includes(signalingRef.current?.selfId ?? ''),
                  )?.name
                }`
              : ' — Main Room'}
          </span>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => setShowBreakoutModal(true)}
            style={{ marginLeft: 8 }}
          >
            Manage / View
          </button>
        </div>
      )}

      {/* Center workspace: full-stage video canvas + optional side chat or host panel */}
      <div
        className={`call-body ${showChatPanel || showHostPanel ? 'with-chat' : ''}`}
      >
        <main
          ref={callStageRef}
          className={`call-stage mode-${layout.mode}`}
          style={{
            gridTemplateColumns:
              layout.mode === 'spotlight' ||
              layout.mode === 'speaker' ||
              layout.mode === 'pip'
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

          {/* Recording Consent Notice Banner */}
          {showRecordingConsentNotice && (
            <div
              className="recording-consent-banner"
              role="alert"
              aria-live="assertive"
              data-testid="recording-consent-banner"
            >
              <div className="recording-consent-content">
                <span className="recording-consent-icon" aria-hidden="true">
                  🔴
                </span>
                <div className="recording-consent-text">
                  <strong>Recording in progress</strong>
                  <span>
                    This meeting is being recorded by the host. By staying, you
                    consent to being recorded.
                  </span>
                </div>
              </div>
              <div className="recording-consent-actions">
                <button
                  type="button"
                  className="btn btn-sm danger-outline-btn"
                  onClick={handleHangUp}
                >
                  Leave call
                </button>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  onClick={() => setShowRecordingConsentNotice(false)}
                >
                  I understand
                </button>
              </div>
            </div>
          )}

          {/* Phase 7 Webinar Mode Banner */}
          {webinarState?.enabled && (
            <div
              className={`webinar-status-banner ${webinarState.isLive ? 'live' : 'practice'}`}
              role="status"
              data-testid="webinar-status-banner"
            >
              <div className="webinar-status-info">
                <span className="webinar-status-badge">
                  {webinarState.isLive ? 'LIVE' : 'GREEN ROOM (PRACTICE)'}
                </span>
                <span className="webinar-status-desc">
                  {webinarState.isLive
                    ? `${webinarState.viewerCount ?? 0} attendees watching live`
                    : 'Practice session in progress. Only hosts & panelists can see and hear each other.'}
                </span>
              </div>
              <div className="webinar-status-actions">
                {canModerate && webinarState.practiceMode && (
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => signalingRef.current?.goLiveWebinar()}
                    data-testid="webinar-go-live-btn"
                  >
                    Go Live to Audience
                  </button>
                )}
                {canModerate && webinarState.isLive && (
                  <button
                    type="button"
                    className="btn danger-outline-btn btn-sm"
                    onClick={() => signalingRef.current?.endLiveWebinar()}
                    data-testid="webinar-end-live-btn"
                  >
                    End Webinar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Phase 7 Webinar Practice Mode Waiting Screen for Viewers */}
          {webinarState?.enabled &&
          webinarState?.practiceMode &&
          selfRole === 'viewer' ? (
            <div
              style={{ gridColumn: '1 / -1', width: '100%', height: '100%' }}
            >
              <WebinarWaitingScreen
                webinar={webinarState}
                roomTitle={roomTitle}
              />
            </div>
          ) : (
            <>
              {/* Simulive broadcast player if active */}
              {webinarState?.enabled && webinarState?.simulive?.enabled && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    width: '100%',
                    marginBottom: 12,
                  }}
                >
                  <WebinarSimulivePlayer
                    simulive={webinarState.simulive}
                    isHostOrModerator={canModerate}
                    onSyncState={(params) =>
                      signalingRef.current?.syncWebinarSimulive(params)
                    }
                  />
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
                  <div
                    className="call-ready-float"
                    data-testid="waiting-for-peer"
                  >
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
                      Share this meeting link with others you want in the call
                      (up to {MESH_MAX_PARTICIPANTS} participants).
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
              {visibleRemoteList.map((peer) => {
                const isFloating = Boolean(isPipActive && isRemoteFloating);
                const queueIdx = handRaiseQueue.findIndex(
                  (item) => item.peerId === peer.id,
                );
                const handRaiseOrder = queueIdx >= 0 ? queueIdx + 1 : null;
                return (
                  <RemoteVideoTile
                    key={peer.id}
                    participant={peer}
                    stats={peerStatsMap[peer.id]}
                    audioOnlyMode={bandwidthMode === 'audio_only'}
                    isSpeaking={activeSpeakerId === peer.id}
                    isPinned={effectiveSpotlightId === peer.id}
                    canModerate={canModerate}
                    handRaiseOrder={handRaiseOrder}
                    onLowerHand={() => signalingRef.current?.lowerHand(peer.id)}
                    isFloating={isFloating}
                    pipCorner={isFloating ? pipCorner : undefined}
                    dragOffset={isFloating ? dragOffset : undefined}
                    onPipPointerDown={
                      isFloating ? handlePipPointerDown : undefined
                    }
                    onPipPointerMove={
                      isFloating ? handlePipPointerMove : undefined
                    }
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
                    isSignInterpreter={signLanguageInterpreterId === peer.id}
                    onToggleSignInterpreter={() =>
                      handleToggleSignInterpreter(peer.id)
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
              {(() => {
                const selfQueueIdx = handRaiseQueue.findIndex(
                  (item) => item.peerId === signalingRef.current?.selfId,
                );
                return (
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
                    onPointerDown={
                      isLocalFloating ? handlePipPointerDown : undefined
                    }
                    onPointerMove={
                      isLocalFloating ? handlePipPointerMove : undefined
                    }
                    onPointerUp={
                      isLocalFloating ? handlePipPointerUp : undefined
                    }
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
                          <span className="hand-raised-pill">
                            ✋{' '}
                            {selfQueueIdx >= 0 ? `#${selfQueueIdx + 1} ` : ''}
                            Hand raised
                          </span>
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
                        {selfRole === 'host' && (
                          <span className="role-pill">Host</span>
                        )}
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
                        {audioMuted && (
                          <span className="muted-badge">Muted</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Gallery pagination bar */}
              {layout.totalPages > 1 && (
                <div
                  className="gallery-pagination-bar"
                  role="navigation"
                  aria-label="Gallery pagination"
                >
                  <button
                    type="button"
                    className="btn-gallery-page"
                    disabled={layout.page <= 1}
                    onClick={() => setGalleryPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    ‹ Prev
                  </button>
                  <span className="gallery-page-indicator">
                    Page {layout.page} of {layout.totalPages} (
                    {totalParticipantCount} in call)
                  </span>
                  <button
                    type="button"
                    className="btn-gallery-page"
                    disabled={layout.page >= layout.totalPages}
                    onClick={() =>
                      setGalleryPage((p) => Math.min(layout.totalPages, p + 1))
                    }
                    aria-label="Next page"
                  >
                    Next ›
                  </button>
                </div>
              )}
            </>
          )}
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
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {roomLocked ? (
                        <>
                          <UnlockIcon size={14} /> Unlock room
                        </>
                      ) : (
                        <>
                          <LockIcon size={14} /> Lock room
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`btn ${isRecording ? 'danger' : ''}`}
                      onClick={handleToggleRecording}
                      data-testid="host-recording-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {isRecording ? (
                        <>
                          <SquareIcon size={13} fill="currentColor" /> Stop
                          recording
                        </>
                      ) : (
                        <>
                          <CircleIcon size={13} fill="currentColor" /> Record
                          meeting
                        </>
                      )}
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

        {/* Phase 9 Marketplace App In-Meeting Panel */}
        {activeMarketplaceApp && (
          <aside
            className="call-chat-panel marketplace-app-panel"
            aria-label={activeMarketplaceApp.name}
            data-testid="marketplace-app-panel"
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            <div className="chat-panel-header">
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <LayoutGridIcon size={16} />
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                  {activeMarketplaceApp.name}
                </h3>
              </div>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setActiveMarketplaceApp(null)}
                aria-label="Close app panel"
              >
                <CloseIcon />
              </button>
            </div>
            <div
              style={{
                flex: 1,
                position: 'relative',
                width: '100%',
                minHeight: 320,
              }}
            >
              <iframe
                src={activeMarketplaceApp.iframeUrl}
                title={activeMarketplaceApp.name}
                sandbox="allow-scripts allow-forms allow-same-origin"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: 'var(--surface)',
                }}
              />
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
                    {msg.replyToId && (
                      <div className="chat-reply-quote">
                        <span>
                          ↳ In reply to{' '}
                          <strong>
                            {chatMessages.find((m) => m.id === msg.replyToId)
                              ?.displayName || 'message'}
                          </strong>
                        </span>
                        <small>
                          {chatMessages
                            .find((m) => m.id === msg.replyToId)
                            ?.text.slice(0, 60)}
                        </small>
                      </div>
                    )}
                    <div className="chat-message-meta">
                      <strong>{msg.displayName}</strong>
                      <time>
                        {new Date(msg.ts).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                    {msg.text && <p>{msg.text}</p>}
                    {msg.file && (
                      <div className="chat-file-attachment">
                        <span className="file-icon">
                          <PaperclipIcon size={14} />
                        </span>
                        <div className="file-info">
                          <a
                            href={msg.file.url}
                            download={msg.file.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="file-name"
                          >
                            {msg.file.name}
                          </a>
                          <span className="file-size">
                            {(msg.file.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="chat-msg-footer">
                      <div className="chat-msg-reactions">
                        {msg.reactions &&
                          Object.entries(msg.reactions).map(
                            ([emoji, peers]) => (
                              <button
                                key={emoji}
                                type="button"
                                className={`chat-reaction-tag ${
                                  peers.includes(
                                    signalingRef.current?.selfId ?? '',
                                  )
                                    ? 'reacted'
                                    : ''
                                }`}
                                onClick={() =>
                                  handleChatReaction(msg.id, emoji)
                                }
                                title={`Reacted by ${peers.length} participant(s)`}
                              >
                                <span>{emoji}</span>
                                <span className="reaction-count">
                                  {peers.length}
                                </span>
                              </button>
                            ),
                          )}
                        <button
                          type="button"
                          className="btn-add-chat-reaction"
                          title="Add thumbs up"
                          onClick={() => handleChatReaction(msg.id, '👍')}
                        >
                          +👍
                        </button>
                        <button
                          type="button"
                          className="btn-add-chat-reaction"
                          title="Add heart"
                          onClick={() => handleChatReaction(msg.id, '❤️')}
                        >
                          +❤️
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn-chat-reply"
                        onClick={() => setReplyingToMessage(msg)}
                        title="Reply to message"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {replyingToMessage && (
              <div className="chat-reply-banner">
                <span>
                  Replying to <strong>{replyingToMessage.displayName}</strong>
                </span>
                <button
                  type="button"
                  className="btn-close-reply"
                  onClick={() => setReplyingToMessage(null)}
                  title="Cancel reply"
                >
                  ✕
                </button>
              </div>
            )}

            {chatAttachment && (
              <div className="chat-attachment-preview">
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <PaperclipIcon size={13} /> {chatAttachment.name}
                </span>
                <button
                  type="button"
                  className="btn-close-reply"
                  onClick={() => setChatAttachment(null)}
                  title="Remove attachment"
                >
                  ✕
                </button>
              </div>
            )}

            <form className="chat-input-row" onSubmit={handleSendChat}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="btn-attach-file"
                title="Attach file (up to 25MB)"
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperclipIcon size={16} />
              </button>
              <input
                type="text"
                placeholder={
                  replyingToMessage
                    ? `Reply to ${replyingToMessage.displayName}…`
                    : 'Send a message to everyone…'
                }
                value={chatDraft}
                maxLength={2000}
                onChange={(e) => setChatDraft(e.target.value)}
                aria-label="Chat message"
                data-testid="chat-input"
              />
              <button
                type="submit"
                className="btn primary"
                disabled={!chatDraft.trim() && !chatAttachment}
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
            onClick={selfRole === 'viewer' ? undefined : handleToggleMic}
            disabled={selfRole === 'viewer'}
            aria-pressed={!audioMuted}
            aria-label={
              selfRole === 'viewer'
                ? 'Microphone disabled for viewers'
                : audioMuted
                  ? 'Unmute microphone (M)'
                  : 'Mute microphone (M)'
            }
            title={
              selfRole === 'viewer'
                ? 'Viewers are in listen-only mode'
                : audioMuted
                  ? 'Unmute microphone (M)'
                  : 'Mute microphone (M)'
            }
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
            onClick={
              selfRole === 'viewer' ? undefined : () => void handleToggleVideo()
            }
            disabled={selfRole === 'viewer'}
            aria-pressed={videoEnabled}
            aria-label={
              selfRole === 'viewer'
                ? 'Camera disabled for viewers'
                : videoEnabled
                  ? 'Stop camera (V)'
                  : 'Start camera (V)'
            }
            title={
              selfRole === 'viewer'
                ? 'Viewers cannot share camera'
                : videoEnabled
                  ? 'Stop camera (V)'
                  : 'Start camera (V)'
            }
            data-testid="call-cam-btn"
          >
            <VidIcon />
            <span className="dock-btn-label">
              {videoEnabled ? 'Camera' : 'Start cam'}
            </span>
          </button>

          <button
            type="button"
            className={`dock-btn icon-pill hide-on-mobile ${screenSharing ? 'active-share' : ''}`}
            onClick={
              selfRole === 'viewer'
                ? undefined
                : () => void handleToggleScreenShare()
            }
            disabled={selfRole === 'viewer'}
            aria-pressed={screenSharing}
            aria-label={
              selfRole === 'viewer'
                ? 'Screen sharing disabled for viewers'
                : screenSharing
                  ? 'Stop screen sharing (S)'
                  : 'Share screen (S)'
            }
            title={
              selfRole === 'viewer'
                ? 'Viewers cannot share screen'
                : screenSharing
                  ? 'Stop screen sharing (S)'
                  : 'Share screen (S)'
            }
            data-testid="call-screen-btn"
          >
            <ScrIcon />
            <span className="dock-btn-label">
              {screenSharing ? 'Stop share' : 'Present'}
            </span>
          </button>

          {/* Ephemeral Reactions popover (floating emoji bar above dock like Google Meet) */}
          <div className="dock-popover-anchor hide-on-mobile">
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
              <SmileIcon size={18} />
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
            <HandIcon size={18} />
            <span className="dock-btn-label">
              {handRaised ? 'Lower' : 'Hand'}
            </span>
          </button>

          {/* Mobile direct Chat trigger button */}
          <button
            type="button"
            className={`dock-btn icon-pill show-on-mobile-only ${showChatPanel ? 'active-panel' : ''}`}
            onClick={() => {
              setShowChatPanel((v) => !v);
              setShowHostPanel(false);
            }}
            aria-pressed={showChatPanel}
            aria-label="Toggle in-call chat"
            title="In-call chat"
            data-testid="mobile-call-chat-btn"
            style={{ position: 'relative' }}
          >
            <MessageSquareIcon size={18} />
            <span className="dock-btn-label">Chat</span>
            {unreadChatCount > 0 && (
              <span
                className="unread-chat-badge"
                style={{ top: -2, right: -2 }}
              >
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Mobile "More" Activities & Controls sheet trigger */}
          <button
            type="button"
            className={`dock-btn icon-pill show-on-mobile-only ${showMoreActivitiesSheet ? 'active-panel' : ''}`}
            onClick={() => setShowMoreActivitiesSheet((v) => !v)}
            aria-expanded={showMoreActivitiesSheet}
            aria-label="Activities and Controls"
            title="Activities & controls"
            data-testid="call-more-activities-btn"
            style={{ position: 'relative' }}
          >
            <MoreHorizontalIcon size={18} />
            <span className="dock-btn-label">More</span>
            {hasActiveActivity && <span className="dock-more-alert-dot" />}
          </button>

          {canModerate && (
            <button
              type="button"
              className={`dock-btn icon-pill hide-on-mobile ${isRecording ? 'recording-active-dock-btn' : ''}`}
              onClick={handleToggleRecording}
              aria-pressed={isRecording}
              aria-label={isRecording ? 'Stop recording' : 'Record meeting'}
              title={
                isRecording
                  ? `Stop recording (${recordingDuration})`
                  : 'Record meeting'
              }
              data-testid="call-record-btn"
            >
              <CircleIcon
                size={16}
                fill={isRecording ? 'currentColor' : 'none'}
              />
              <span className="dock-btn-label">
                {isRecording ? 'Rec' : 'Record'}
              </span>
            </button>
          )}

          {/* Closed Captions button */}
          <button
            type="button"
            className={`dock-btn icon-pill hide-on-mobile ${captionsEnabled ? 'active-panel' : ''}`}
            onClick={handleToggleCaptions}
            aria-pressed={captionsEnabled}
            aria-label={
              captionsEnabled
                ? 'Turn off closed captions'
                : 'Turn on closed captions (CC)'
            }
            title={
              captionsEnabled
                ? 'Turn off captions (click ⚙ on captions for settings)'
                : 'Turn on closed captions (CC)'
            }
            data-testid="call-captions-btn"
          >
            <span
              aria-hidden="true"
              style={{
                fontSize: 12,
                fontWeight: 800,
                border: '1.5px solid currentColor',
                borderRadius: 4,
                padding: '0 3px',
                lineHeight: '14px',
              }}
            >
              CC
            </span>
            <span className="dock-btn-label">
              {captionsEnabled ? 'CC On' : 'CC'}
            </span>
          </button>

          {/* Devices & Sound Settings popover */}
          <div className="dock-popover-anchor hide-on-mobile">
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

                {selfRole !== 'viewer' && (
                  <button
                    type="button"
                    className="panel-btn-secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      marginTop: '4px',
                      width: '100%',
                    }}
                    onClick={() => {
                      setShowVideoEffectsModal(true);
                      setShowDevicePopover(false);
                    }}
                    data-testid="call-open-effects-btn"
                  >
                    <SparklesIcon
                      size={15}
                      style={{ color: 'var(--accent)' }}
                    />
                    <span>Visual Effects &amp; Backgrounds</span>
                  </button>
                )}

                <button
                  type="button"
                  className="panel-btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    marginTop: '6px',
                    width: '100%',
                  }}
                  onClick={() => {
                    setShowAudioEffectsModal(true);
                    setShowDevicePopover(false);
                  }}
                  data-testid="call-open-audio-fx-btn"
                >
                  <Volume2Icon size={15} style={{ color: 'var(--accent)' }} />
                  <span>Audio Intelligence &amp; FX</span>
                </button>
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
          {/* Breakout Rooms */}
          <button
            type="button"
            className={`call-side-btn ${showBreakoutModal ? 'active-panel' : ''}`}
            onClick={() => setShowBreakoutModal(true)}
            aria-pressed={showBreakoutModal}
            aria-label="Breakout Rooms"
            title="Breakout Rooms"
            data-testid="call-breakout-btn"
          >
            <UsersIcon size={16} />
            <span>Rooms</span>
            {breakoutState?.active && (
              <span
                className="unread-chat-badge"
                style={{ background: 'var(--brand-primary, #6366f1)' }}
              >
                On
              </span>
            )}
          </button>

          {/* In-call Polls & Quizzes */}
          <button
            type="button"
            className={`call-side-btn ${showPollsPanel ? 'active-panel' : ''}`}
            onClick={() => setShowPollsPanel((v) => !v)}
            aria-pressed={showPollsPanel}
            aria-label="Polls & Quizzes"
            title="Polls & Quizzes"
            data-testid="call-polls-btn"
          >
            <BarChartIcon size={16} />
            <span>Polls</span>
            {polls.filter((p) => !p.closed).length > 0 && (
              <span className="unread-chat-badge">
                {polls.filter((p) => !p.closed).length}
              </span>
            )}
          </button>

          {/* FormIT survey launcher */}
          <button
            type="button"
            className={`call-side-btn ${showFormItModal ? 'active-panel' : ''}`}
            onClick={() => setShowFormItModal(true)}
            aria-pressed={showFormItModal}
            aria-label="FormIT Survey"
            title="FormIT Survey"
            data-testid="call-formit-btn"
          >
            <ClipboardIcon size={16} />
            <span>FormIT</span>
            {formItSession && (
              <span
                className="unread-chat-badge"
                style={{ background: '#10b981' }}
              >
                Live
              </span>
            )}
          </button>

          {/* Q&A panel */}
          <button
            type="button"
            className={`call-side-btn ${showQAPanel ? 'active-panel' : ''}`}
            onClick={() => setShowQAPanel((v) => !v)}
            aria-pressed={showQAPanel}
            aria-label="Q&A"
            title="Q&A"
            data-testid="call-qa-btn"
          >
            <HelpIcon size={16} />
            <span>Q&amp;A</span>
            {qaQuestions.filter((q) => !q.answered && !q.dismissed).length >
              0 && (
              <span className="unread-chat-badge">
                {qaQuestions.filter((q) => !q.answered && !q.dismissed).length}
              </span>
            )}
          </button>

          {/* Phase 7 Webinar Audience Q&A */}
          {webinarState?.enabled && (
            <button
              type="button"
              className={`call-side-btn ${showWebinarQaPanel ? 'active-panel' : ''}`}
              onClick={() => setShowWebinarQaPanel((v) => !v)}
              aria-pressed={showWebinarQaPanel}
              aria-label="Webinar Q&A"
              title="Webinar Audience Q&A"
              data-testid="call-webinar-qa-btn"
            >
              <MessageSquareIcon size={16} />
              <span>Webinar Q&amp;A</span>
              {webinarQaQuestions.filter(
                (q) => q.status === 'pending' || q.status === 'approved',
              ).length > 0 && (
                <span className="unread-chat-badge">
                  {
                    webinarQaQuestions.filter(
                      (q) => q.status === 'pending' || q.status === 'approved',
                    ).length
                  }
                </span>
              )}
            </button>
          )}

          {/* Phase 7 Live Stream Out (RTMP / HLS) */}
          {webinarState?.enabled && canModerate && (
            <button
              type="button"
              className={`call-side-btn ${showWebinarStreamModal ? 'active-panel' : ''}`}
              onClick={() => setShowWebinarStreamModal(true)}
              aria-pressed={showWebinarStreamModal}
              aria-label="Live Stream Out"
              title="Broadcast to YouTube / RTMP / HLS"
              data-testid="call-webinar-stream-btn"
            >
              <RadioIcon size={16} />
              <span>Stream</span>
              {webinarState?.streamOut?.status === 'live' && (
                <span
                  className="unread-chat-badge"
                  style={{ background: '#ef4444' }}
                >
                  Live
                </span>
              )}
            </button>
          )}

          {/* Phase 7 Webinar Attendee Analytics */}
          {webinarState?.enabled && canModerate && (
            <button
              type="button"
              className={`call-side-btn ${showWebinarAnalyticsModal ? 'active-panel' : ''}`}
              onClick={() => setShowWebinarAnalyticsModal(true)}
              aria-pressed={showWebinarAnalyticsModal}
              aria-label="Attendee Analytics"
              title="Webinar Analytics & Attendance"
              data-testid="call-webinar-analytics-btn"
            >
              <TrendingUpIcon size={16} />
              <span>Analytics</span>
            </button>
          )}

          {/* Whiteboard */}
          <button
            type="button"
            className={`call-side-btn ${showWhiteboardModal ? 'active-panel' : ''}`}
            onClick={() => setShowWhiteboardModal((v) => !v)}
            aria-pressed={showWhiteboardModal}
            aria-label="Shared Whiteboard"
            title="Shared Whiteboard"
            data-testid="call-whiteboard-btn"
          >
            <PaintbrushIcon size={16} />
            <span>Board</span>
          </button>

          {/* Shared Collaborative Notes */}
          <button
            type="button"
            className={`call-side-btn ${showSharedNotesPanel ? 'active-panel' : ''}`}
            onClick={() => setShowSharedNotesPanel((v) => !v)}
            aria-pressed={showSharedNotesPanel}
            aria-label="Collaborative Notes"
            title="Collaborative Notes"
            data-testid="call-notes-btn"
          >
            <FileTextIcon size={16} />
            <span>Notes</span>
          </button>

          {/* Phase 9 Apps Marketplace */}
          <button
            type="button"
            className={`call-side-btn ${showAppsModal || activeMarketplaceApp ? 'active-panel' : ''}`}
            onClick={() => setShowAppsModal(true)}
            aria-pressed={showAppsModal || !!activeMarketplaceApp}
            aria-label="Apps & Integrations"
            title="In-Meeting Apps Marketplace"
            data-testid="call-apps-btn"
          >
            <LayoutGridIcon size={16} />
            <span>Apps</span>
          </button>

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

      {/* Mobile Activities & Controls Bottom Sheet */}
      {showMoreActivitiesSheet && (
        <div
          className="mobile-activities-backdrop"
          onClick={() => setShowMoreActivitiesSheet(false)}
          data-testid="mobile-activities-backdrop"
        >
          <div
            className="mobile-activities-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Activities and Controls"
          >
            <div className="mobile-activities-handle" />
            <div className="mobile-activities-header">
              <h3>Activities &amp; Controls</h3>
              <button
                type="button"
                className="mobile-activities-close-btn"
                onClick={() => setShowMoreActivitiesSheet(false)}
                aria-label="Close menu"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="mobile-activities-body">
              {/* Quick Reactions */}
              <div className="mobile-reactions-bar">
                <span className="mobile-section-label">Quick Reactions</span>
                <div className="mobile-reactions-scroll">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="reaction-choice-btn"
                      onClick={() => {
                        handleSendReaction(emoji);
                        setShowMoreActivitiesSheet(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tools & Features Grid */}
              <div className="mobile-section-label">
                Collaboration &amp; Tools
              </div>
              <div className="mobile-activities-grid">
                {/* Breakout Rooms */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showBreakoutModal ? 'active' : ''}`}
                  onClick={() => {
                    setShowBreakoutModal(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-breakout-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <UsersIcon size={18} />
                    {breakoutState?.active && (
                      <span className="mobile-activity-badge live">On</span>
                    )}
                  </div>
                  <span>Rooms</span>
                </button>

                {/* Polls & Quizzes */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showPollsPanel ? 'active' : ''}`}
                  onClick={() => {
                    setShowPollsPanel(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-polls-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <BarChartIcon size={18} />
                    {polls.filter((p) => !p.closed).length > 0 && (
                      <span className="mobile-activity-badge">
                        {polls.filter((p) => !p.closed).length}
                      </span>
                    )}
                  </div>
                  <span>Polls</span>
                </button>

                {/* FormIT Survey */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showFormItModal ? 'active' : ''}`}
                  onClick={() => {
                    setShowFormItModal(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-formit-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <ClipboardIcon size={18} />
                    {formItSession && (
                      <span className="mobile-activity-badge live">Live</span>
                    )}
                  </div>
                  <span>FormIT</span>
                </button>

                {/* Q&A */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showQAPanel ? 'active' : ''}`}
                  onClick={() => {
                    setShowQAPanel(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-qa-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <HelpIcon size={18} />
                    {qaQuestions.filter((q) => !q.answered && !q.dismissed)
                      .length > 0 && (
                      <span className="mobile-activity-badge">
                        {
                          qaQuestions.filter((q) => !q.answered && !q.dismissed)
                            .length
                        }
                      </span>
                    )}
                  </div>
                  <span>Q&amp;A</span>
                </button>

                {/* Whiteboard */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showWhiteboardModal ? 'active' : ''}`}
                  onClick={() => {
                    setShowWhiteboardModal(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-whiteboard-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <PaintbrushIcon size={18} />
                  </div>
                  <span>Whiteboard</span>
                </button>

                {/* Collaborative Notes */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showSharedNotesPanel ? 'active' : ''}`}
                  onClick={() => {
                    setShowSharedNotesPanel(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-notes-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <FileTextIcon size={18} />
                  </div>
                  <span>Notes</span>
                </button>

                {/* Phase 9 Apps Marketplace */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showAppsModal || activeMarketplaceApp ? 'active' : ''}`}
                  onClick={() => {
                    setShowAppsModal(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-apps-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <LayoutGridIcon size={18} />
                    {activeMarketplaceApp && (
                      <span className="mobile-activity-badge live">On</span>
                    )}
                  </div>
                  <span>Apps</span>
                </button>

                {/* Timer & Agenda Controls */}
                {canModerate && (
                  <button
                    type="button"
                    className={`mobile-activity-card ${showTimerConfigModal ? 'active' : ''}`}
                    onClick={() => {
                      setShowTimerConfigModal(true);
                      setShowMoreActivitiesSheet(false);
                    }}
                    data-testid="mobile-sheet-timer-btn"
                  >
                    <div className="mobile-activity-icon-wrap">
                      <ClockIcon size={18} />
                    </div>
                    <span>Timer</span>
                  </button>
                )}

                {/* People & Host Controls */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showHostPanel ? 'active' : ''}`}
                  onClick={() => {
                    setShowHostPanel(true);
                    setShowChatPanel(false);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-host-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <UsrIcon />
                    {waitingPeers.length > 0 && (
                      <span className="mobile-activity-badge live">
                        {waitingPeers.length}
                      </span>
                    )}
                  </div>
                  <span>{canModerate ? 'Host' : 'People'}</span>
                </button>

                {/* Closed Captions Toggle */}
                <button
                  type="button"
                  className={`mobile-activity-card ${captionsEnabled ? 'active' : ''}`}
                  onClick={() => {
                    handleToggleCaptions();
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-captions-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 12,
                        border: '1.5px solid currentColor',
                        borderRadius: 3,
                        padding: '0 2px',
                      }}
                    >
                      CC
                    </span>
                  </div>
                  <span>{captionsEnabled ? 'CC On' : 'CC Off'}</span>
                </button>

                {/* Audio & Video Options */}
                <button
                  type="button"
                  className={`mobile-activity-card ${showDevicePopover ? 'active' : ''}`}
                  onClick={() => {
                    setShowDevicePopover(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-options-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <SlidersIcon size={18} />
                  </div>
                  <span>Options</span>
                </button>

                {/* Visual Effects & Backgrounds */}
                {selfRole !== 'viewer' && (
                  <button
                    type="button"
                    className={`mobile-activity-card ${videoEffectsConfig.effect !== 'none' || videoEffectsConfig.lowLightEnhancement || videoEffectsConfig.touchUp || videoEffectsConfig.autoFraming || videoEffectsConfig.gestureReactions ? 'active' : ''}`}
                    onClick={() => {
                      setShowVideoEffectsModal(true);
                      setShowMoreActivitiesSheet(false);
                    }}
                    data-testid="mobile-sheet-effects-btn"
                  >
                    <div className="mobile-activity-icon-wrap">
                      <SparklesIcon size={18} />
                    </div>
                    <span>Effects</span>
                  </button>
                )}

                {/* Audio Intelligence & Effects */}
                <button
                  type="button"
                  className={`mobile-activity-card ${audioEffectsConfig.noiseSuppression !== 'off' || audioEffectsConfig.voiceBoost || audioEffectsConfig.spatialAudio ? 'active' : ''}`}
                  onClick={() => {
                    setShowAudioEffectsModal(true);
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-audio-fx-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <Volume2Icon size={18} />
                  </div>
                  <span>Audio FX</span>
                </button>

                {/* Sign Language Mode */}
                <button
                  type="button"
                  className={`mobile-activity-card ${signLanguageInterpreterId ? 'active' : ''}`}
                  onClick={() => {
                    if (signLanguageInterpreterId) {
                      setSignLanguageInterpreterId(null);
                      onToast('Sign language interpreter unpinned');
                    } else if (remoteList.length > 0) {
                      handleToggleSignInterpreter(remoteList[0]!.id);
                    } else {
                      onToast(
                        'No remote attendees to designate as sign interpreter',
                      );
                    }
                    setShowMoreActivitiesSheet(false);
                  }}
                  data-testid="mobile-sheet-sign-mode-btn"
                >
                  <div className="mobile-activity-icon-wrap">
                    <LanguagesIcon size={18} />
                    {signLanguageInterpreterId && (
                      <span className="mobile-activity-badge live">On</span>
                    )}
                  </div>
                  <span>Sign Mode</span>
                </button>

                {/* Screen Share (if permitted) */}
                {selfRole !== 'viewer' && (
                  <button
                    type="button"
                    className={`mobile-activity-card ${screenSharing ? 'active' : ''}`}
                    onClick={() => {
                      void handleToggleScreenShare();
                      setShowMoreActivitiesSheet(false);
                    }}
                    data-testid="mobile-sheet-screen-btn"
                  >
                    <div className="mobile-activity-icon-wrap">
                      <ScrIcon />
                    </div>
                    <span>{screenSharing ? 'Stop Share' : 'Share'}</span>
                  </button>
                )}

                {/* Record Meeting (Host / Moderator) */}
                {canModerate && (
                  <button
                    type="button"
                    className={`mobile-activity-card ${isRecording ? 'active' : ''}`}
                    onClick={() => {
                      handleToggleRecording();
                      setShowMoreActivitiesSheet(false);
                    }}
                    data-testid="mobile-sheet-record-btn"
                  >
                    <div className="mobile-activity-icon-wrap">
                      <CircleIcon
                        size={18}
                        fill={isRecording ? 'currentColor' : 'none'}
                      />
                    </div>
                    <span>{isRecording ? 'Stop Rec' : 'Record'}</span>
                  </button>
                )}

                {/* Webinar Audience Q&A */}
                {webinarState?.enabled && (
                  <button
                    type="button"
                    className={`mobile-activity-card ${showWebinarQaPanel ? 'active' : ''}`}
                    onClick={() => {
                      setShowWebinarQaPanel(true);
                      setShowMoreActivitiesSheet(false);
                    }}
                    data-testid="mobile-sheet-webinar-qa-btn"
                  >
                    <div className="mobile-activity-icon-wrap">
                      <MessageSquareIcon size={18} />
                      {webinarQaQuestions.filter(
                        (q) =>
                          q.status === 'pending' || q.status === 'approved',
                      ).length > 0 && (
                        <span className="mobile-activity-badge">
                          {
                            webinarQaQuestions.filter(
                              (q) =>
                                q.status === 'pending' ||
                                q.status === 'approved',
                            ).length
                          }
                        </span>
                      )}
                    </div>
                    <span>Webinar Q&amp;A</span>
                  </button>
                )}

                {/* Webinar Stream Out */}
                {webinarState?.enabled && canModerate && (
                  <button
                    type="button"
                    className={`mobile-activity-card ${showWebinarStreamModal ? 'active' : ''}`}
                    onClick={() => {
                      setShowWebinarStreamModal(true);
                      setShowMoreActivitiesSheet(false);
                    }}
                    data-testid="mobile-sheet-stream-btn"
                  >
                    <div className="mobile-activity-icon-wrap">
                      <RadioIcon size={18} />
                      {webinarState?.streamOut?.status === 'live' && (
                        <span className="mobile-activity-badge live">Live</span>
                      )}
                    </div>
                    <span>Stream</span>
                  </button>
                )}

                {/* Webinar Analytics */}
                {webinarState?.enabled && canModerate && (
                  <button
                    type="button"
                    className={`mobile-activity-card ${showWebinarAnalyticsModal ? 'active' : ''}`}
                    onClick={() => {
                      setShowWebinarAnalyticsModal(true);
                      setShowMoreActivitiesSheet(false);
                    }}
                    data-testid="mobile-sheet-analytics-btn"
                  >
                    <div className="mobile-activity-icon-wrap">
                      <TrendingUpIcon size={18} />
                    </div>
                    <span>Analytics</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Confirmation modal before starting recording */}
      {showStartRecordingConfirm && (
        <div
          className="shortcuts-modal-backdrop"
          onClick={() => setShowStartRecordingConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rec-confirm-title"
          data-testid="start-recording-modal"
        >
          <div
            className="shortcuts-modal-card"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-modal-head">
              <h3 id="rec-confirm-title">Start recording this meeting?</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setShowStartRecordingConfirm(false)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <p
              style={{
                margin: '14px 0 16px',
                fontSize: '0.925rem',
                lineHeight: 1.5,
                color: 'var(--muted)',
              }}
            >
              All participants will see a persistent recording indicator and
              receive a consent notice that this meeting is being recorded.
            </p>

            <div
              style={{
                margin: '0 0 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <label className="device-select-group">
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Composite Recording Layout
                </span>
                <select
                  value={recordingLayoutChoice}
                  onChange={(e) =>
                    setRecordingLayoutChoice(
                      e.target.value as 'grid' | 'speaker',
                    )
                  }
                  data-testid="recording-layout-select"
                >
                  <option value="grid">Grid Gallery (All participants)</option>
                  <option value="speaker">
                    Speaker View (Active speaker spotlight)
                  </option>
                </select>
              </label>

              <label className="popover-checkbox-row">
                <input
                  type="checkbox"
                  checked={recordingAudioOnlyChoice}
                  onChange={(e) =>
                    setRecordingAudioOnlyChoice(e.target.checked)
                  }
                  data-testid="recording-audio-only-check"
                />
                <span style={{ fontSize: '0.85rem' }}>
                  Audio-only recording
                </span>
              </label>

              <label className="popover-checkbox-row">
                <input
                  type="checkbox"
                  checked={recordingIsoChoice}
                  onChange={(e) => setRecordingIsoChoice(e.target.checked)}
                  data-testid="recording-iso-tracks-check"
                />
                <span style={{ fontSize: '0.85rem' }}>
                  Export separate per-participant (ISO) tracks for video editing
                </span>
              </label>

              <label className="device-select-group">
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Workspace Retention Policy
                </span>
                <select
                  value={recordingRetentionChoice}
                  onChange={(e) =>
                    setRecordingRetentionChoice(Number(e.target.value))
                  }
                  data-testid="recording-retention-select"
                >
                  <option value={7}>7 Days (Compliance sprint)</option>
                  <option value={30}>30 Days (Standard default)</option>
                  <option value={90}>90 Days (Quarterly archive)</option>
                  <option value={365}>1 Year (Enterprise)</option>
                  <option value={0}>Indefinite / Keep forever</option>
                </select>
              </label>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => setShowStartRecordingConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleConfirmStartRecording}
                data-testid="confirm-start-recording-btn"
              >
                Start recording
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Closed Captions Overlay */}
      {captionsEnabled && liveCues.length > 0 && (
        <CaptionsOverlay
          cues={liveCues}
          fontSize={captionConfig.fontSize}
          position={captionConfig.position}
          onOpenSettings={() => setShowCaptionSettings(true)}
          onToggleCaptions={handleToggleCaptions}
        />
      )}

      {/* Caption Settings Modal */}
      {showCaptionSettings && (
        <CaptionSettingsModal
          config={captionConfig}
          onSave={(newConfig) => {
            setCaptionConfig(newConfig);
            onToast('Updated closed caption settings');
          }}
          onClose={() => setShowCaptionSettings(false)}
        />
      )}

      {/* Collaboration Modals & Panels */}
      <BreakoutModal
        isOpen={showBreakoutModal}
        onClose={() => setShowBreakoutModal(false)}
        isHost={canModerate}
        selfId={signalingRef.current?.selfId ?? ''}
        peers={remoteList}
        breakoutState={breakoutState}
        onStartBreakout={() => signalingRef.current?.startBreakout()}
        onCreateRooms={(rooms, durationMinutes) =>
          signalingRef.current?.createBreakoutRooms(rooms, durationMinutes)
        }
        onAssignPeer={(roomId, peerId) =>
          signalingRef.current?.assignBreakoutPeer(roomId, peerId)
        }
        onBroadcastMessage={(message) =>
          signalingRef.current?.broadcastBreakout(message)
        }
        onRecallBreakout={(noticeSeconds) =>
          signalingRef.current?.recallBreakout(noticeSeconds)
        }
        onEndBreakout={() => signalingRef.current?.endBreakout()}
        onJoinRoom={(roomId) => signalingRef.current?.joinBreakoutRoom(roomId)}
        onLeaveRoom={() => signalingRef.current?.leaveBreakoutRoom()}
      />

      <PollsPanel
        isOpen={showPollsPanel}
        onClose={() => setShowPollsPanel(false)}
        isHost={canModerate}
        selfId={signalingRef.current?.selfId ?? ''}
        polls={polls}
        onCreatePoll={(params) => signalingRef.current?.createPoll(params)}
        onVotePoll={(pollId, optionIndices) =>
          signalingRef.current?.votePoll(pollId, optionIndices)
        }
        onClosePoll={(pollId) => signalingRef.current?.closePoll(pollId)}
        onDeletePoll={(pollId) => signalingRef.current?.deletePoll(pollId)}
        onOpenFormItSurvey={() => setShowFormItModal(true)}
      />

      <FormItModal
        isOpen={showFormItModal}
        onClose={() => setShowFormItModal(false)}
        isHost={canModerate}
        selfId={signalingRef.current?.selfId ?? ''}
        displayName={displayName || user?.displayName || 'Guest'}
        activeSession={formItSession}
        onLaunchFormIt={(formUrl, title) =>
          signalingRef.current?.launchFormIt(formUrl, title)
        }
        onSubmitFormIt={(id, editKey) =>
          signalingRef.current?.submitFormIt(id, editKey)
        }
        onCloseFormIt={(id) => signalingRef.current?.closeFormIt(id)}
        onAttachToSummary={(session) => {
          onToast(`Attached FormIT survey (${session.slug}) to meeting notes.`);
        }}
      />

      <QAPanel
        isOpen={showQAPanel}
        onClose={() => setShowQAPanel(false)}
        isHost={canModerate}
        selfId={signalingRef.current?.selfId ?? ''}
        questions={qaQuestions}
        onAskQuestion={(question) =>
          signalingRef.current?.askQuestion(question)
        }
        onUpvoteQuestion={(questionId) =>
          signalingRef.current?.upvoteQuestion(questionId)
        }
        onAnswerQuestion={(questionId, answered) =>
          signalingRef.current?.answerQuestion(questionId, answered)
        }
        onDismissQuestion={(questionId, dismissed) =>
          signalingRef.current?.dismissQuestion(questionId, dismissed)
        }
        onDeleteQuestion={(questionId) =>
          signalingRef.current?.deleteQuestion(questionId)
        }
      />

      <WhiteboardModal
        isOpen={showWhiteboardModal}
        onClose={() => setShowWhiteboardModal(false)}
        selfId={signalingRef.current?.selfId ?? ''}
        whiteboardHistory={whiteboardHistory}
        onSendAction={(action) =>
          signalingRef.current?.sendWhiteboardAction(action)
        }
      />

      <SharedNotesPanel
        isOpen={showSharedNotesPanel}
        onClose={() => setShowSharedNotesPanel(false)}
        selfDisplayName={displayName || user?.displayName || 'Participant'}
        notesDoc={notesDoc}
        onUpdateNotes={(content, version) =>
          signalingRef.current?.updateSharedNotes(content, version)
        }
        onAttachToMeetingRecord={() => {
          onToast('Collaborative notes synced to meeting summary.');
        }}
      />

      {/* Phase 7 Webinar Modals & Panels */}
      <WebinarStreamModal
        isOpen={showWebinarStreamModal}
        onClose={() => setShowWebinarStreamModal(false)}
        streamOut={webinarState?.streamOut}
        roomCode={roomCode}
        onStartStream={(params) =>
          signalingRef.current?.startWebinarStream(params)
        }
        onStopStream={() => signalingRef.current?.stopWebinarStream()}
      />

      <WebinarAnalyticsModal
        isOpen={showWebinarAnalyticsModal}
        onClose={() => setShowWebinarAnalyticsModal(false)}
        roomCode={roomCode}
      />

      {showWebinarQaPanel && (
        <aside
          className="call-side-panel webinar-qa-panel-container"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 84,
            width: 360,
            maxHeight: 520,
            zIndex: 100,
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
          data-testid="webinar-qa-floating-container"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '6px 8px',
              background: 'var(--color-bg-subtle, #1e293b)',
            }}
          >
            <button
              type="button"
              className="btn-icon-subtle"
              onClick={() => setShowWebinarQaPanel(false)}
              aria-label="Close Webinar Q&A"
            >
              <CloseIcon />
            </button>
          </div>
          <WebinarQaPanel
            questions={webinarQaQuestions}
            isHostOrModerator={canModerate}
            onAskQuestion={(question) =>
              signalingRef.current?.askWebinarQuestion(question)
            }
            onUpvoteQuestion={(questionId) =>
              signalingRef.current?.upvoteWebinarQuestion(questionId)
            }
            onModerateQuestion={(questionId, status, answer) =>
              signalingRef.current?.moderateWebinarQuestion(
                questionId,
                status,
                answer,
              )
            }
          />
        </aside>
      )}

      {/* Phase 8 Video Effects & Backgrounds Modal */}
      <VideoEffectsModal
        isOpen={showVideoEffectsModal}
        onClose={() => setShowVideoEffectsModal(false)}
        currentConfig={videoEffectsConfig}
        onApplyConfig={(cfg) => void handleApplyVideoEffects(cfg)}
        activeMediaStream={localStream}
      />

      {/* Phase 8 Audio Intelligence & Effects Modal */}
      <AudioEffectsModal
        isOpen={showAudioEffectsModal}
        onClose={() => setShowAudioEffectsModal(false)}
        currentConfig={audioEffectsConfig}
        onApplyConfig={(cfg) => void handleApplyAudioEffects(cfg)}
        liveAudioLevel={audioProcessorRef.current?.getAudioLevel() ?? 0}
      />

      {/* Phase 9 In-Meeting Apps Marketplace Modal */}
      <AppsMarketplaceModal
        isOpen={showAppsModal}
        onClose={() => setShowAppsModal(false)}
        activeAppId={activeMarketplaceApp?.id ?? null}
        onLaunchApp={(app) => {
          setActiveMarketplaceApp(app);
          setShowAppsModal(false);
          onToast(`Launched ${app.name}`);
        }}
        onCloseActiveApp={() => {
          setActiveMarketplaceApp(null);
          onToast('Closed active app');
        }}
      />
    </div>
  );
}
