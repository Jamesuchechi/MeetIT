import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { MeshTransport, type ConnectionState } from '@meetit/media';
import type { PeerInfo, PeerState, ReactionEmoji } from '@meetit/protocol';
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
import { copyToClipboard, type AuthUser } from '../types';

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
const REACTION_EMOJIS: ReactionEmoji[] = ['👍', '👏', '❤️', '🎉', '😂', '😮'];

function RemoteVideoTile({
  participant,
  isSpeaking,
  isPinned,
  onTogglePin,
  onToast,
}: {
  participant: RemoteParticipant;
  isSpeaking: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  onToast: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (participant.stream && el.srcObject !== participant.stream) {
      el.srcObject = participant.stream;
      void el.play().catch(() => {});
    }
  }, [participant.stream]);

  const hasVideo =
    participant.state.video &&
    participant.stream &&
    participant.stream.getVideoTracks().length > 0;

  const initial = (participant.displayName[0] || 'G').toUpperCase();

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
      className={`call-tile remote-tile ${isSpeaking ? 'active-speaker-ring' : ''} ${isPinned ? 'pinned-tile' : ''} ${!hasVideo ? 'camera-off-studio' : ''}`}
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
        </div>
      )}

      {/* Top-right tile quick actions: Pin, PiP, Hand Raised */}
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
  const [stage, setStage] = useState<'lobby' | 'call'>('lobby');
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
  const localMeta = useMemo(() => findRoomMetadataByCode(roomCode), [roomCode]);
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
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

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

  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  const callLocalVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const transportRef = useRef<MeshTransport | null>(null);
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
      setIsPortrait(window.innerWidth < 768);
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
          vTrack.enabled = videoEnabled;
        }
      }

      localStreamRef.current = res.stream;
      setLocalStream(res.stream);
      setMediaErrorKind(res.errorKind);
      setMediaErrorMsg(res.errorMessage);
      setRecoverySteps(res.recoverySteps);
      await refreshDevices();
    },
    [audioMuted, videoEnabled, refreshDevices],
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
      el.srcObject = localStream;
      void el.play().catch(() => {});
    }
  }, [localStream, stage, videoEnabled]);

  // Attach local stream to active call video element
  useEffect(() => {
    const el = callLocalVideoRef.current;
    if (el && localStream) {
      el.srcObject = localStream;
      void el.play().catch(() => {});
    }
  }, [localStream, stage, videoEnabled, pinnedTargetId]);

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

    signaling.on('joined', (payload) => {
      if (payload.roomState.title) {
        setRoomTitle(payload.roomState.title);
      }
      if (payload.roomState.description) {
        setRoomDescription(payload.roomState.description);
      }
      const map: Record<string, RemoteParticipant> = {};
      for (const p of payload.peers) {
        seenAttendeesRef.current.set(p.id, {
          id: p.id,
          displayName: p.displayName,
          role: p.role,
          ...(p.verified !== undefined ? { verified: p.verified } : {}),
        });
        map[p.id] = {
          ...p,
          stream: null,
          screenStream: null,
          connectionStatus: 'connecting',
        };
      }
      setRemotePeers(map);
      if (soundsEnabledRef.current) {
        playCallChime('join');
      }

      void (async () => {
        await transport.connect({
          roomId: roomCode,
          selfId: payload.selfId,
          iceServers: payload.iceServers as RTCIceServer[],
          signaling,
          peerIds: payload.peers.map((p) => p.id),
        });

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
        setRoomFull(true);
        setStage('lobby');
        signaling.disconnect();
        void transport.disconnect();
      } else if (err.code === 'ROOM_LOCKED') {
        setRoomLocked(true);
        setStage('lobby');
        signaling.disconnect();
        void transport.disconnect();
      } else if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
        setLobbyError(err.message);
        setStage('lobby');
        signaling.disconnect();
        void transport.disconnect();
      }
      onToast(err.message);
    });

    signalingRef.current = signaling;
    transportRef.current = transport;
    signaling.connect();
    setStage('call');
  };

  const handleHangUp = () => {
    if (callStartedAtRef.current) {
      recordCompletedMeetingSession({
        roomCode,
        roomTitle,
        startedAtMs: callStartedAtRef.current,
        endedAtMs: Date.now(),
        attendees: Array.from(seenAttendeesRef.current.values()),
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
    Boolean(localStream && localStream.getVideoTracks().length > 0);
  const localInitial = (
    (displayName || user?.displayName || 'G')[0] || 'G'
  ).toUpperCase();

  const remoteList = useMemo(() => Object.values(remotePeers), [remotePeers]);
  const totalParticipantCount = remoteList.length + 1;

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
      }),
    [totalParticipantCount, effectiveSpotlightId, isPortrait],
  );

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

          <button
            type="button"
            className="call-topbar-icon-btn"
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

      {/* Center workspace: full-stage video canvas + optional side chat panel */}
      <div className={`call-body ${showChatPanel ? 'with-chat' : ''}`}>
        <main
          className={`call-stage mode-${layout.mode}`}
          style={{
            gridTemplateColumns:
              layout.mode === 'spotlight'
                ? undefined
                : `repeat(${layout.columns}, minmax(0, 1fr))`,
          }}
          data-layout-mode={layout.mode}
        >
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
          {remoteList.map((peer) => (
            <RemoteVideoTile
              key={peer.id}
              participant={peer}
              isSpeaking={activeSpeakerId === peer.id}
              isPinned={effectiveSpotlightId === peer.id}
              onTogglePin={() =>
                setPinnedTargetId((curr) => (curr === peer.id ? null : peer.id))
              }
              onToast={onToast}
            />
          ))}

          {/* Local Participant Tile */}
          <div
            className={`call-tile local-tile ${activeSpeakerId === 'local' ? 'active-speaker-ring' : ''} ${effectiveSpotlightId === 'local' ? 'pinned-tile' : ''} ${!hasLocalVideoTrack ? 'camera-off-studio' : ''}`}
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
              </div>
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
                {audioMuted && <span className="muted-badge">Muted</span>}
              </div>
            </div>
          </div>
        </main>

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

          <button
            type="button"
            className="dock-btn end"
            onClick={handleHangUp}
            aria-label="Leave call"
            title="Leave call"
            data-testid="leave-call-btn"
          >
            <EndIcon />
          </button>
        </div>

        <div className="call-dock-right">
          {/* In-call Chat toggle button with unread badge */}
          <button
            type="button"
            className={`call-side-btn ${showChatPanel ? 'active-panel' : ''}`}
            onClick={() => setShowChatPanel((v) => !v)}
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
