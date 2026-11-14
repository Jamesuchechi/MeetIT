/**
 * MeetIT Embeddable SDK Types (Phase 9)
 */

export type MeetItTheme = 'light' | 'dark' | 'auto';

export interface MeetItEmbedOptions {
  /** Room code in abc-defg-hij format */
  roomCode: string;
  /** Optional authentication token (e.g. hostToken or guestToken) */
  token?: string | undefined;
  /** Pre-filled participant display name */
  displayName?: string | undefined;
  /** MeetIT instance base URL (default: 'https://meetit.app') */
  baseUrl?: string | undefined;
  /** UI theme */
  theme?: MeetItTheme | undefined;
  /** Container or iframe width (default: '100%') */
  width?: string | number | undefined;
  /** Container or iframe height (default: '100%') */
  height?: string | number | undefined;
  /** Initial mic state (default: false = unmuted) */
  audioMuted?: boolean | undefined;
  /** Initial camera state (default: true = camera on) */
  videoEnabled?: boolean | undefined;
  /** Hide branding logo for white-label embedding */
  hideLogo?: boolean | undefined;
  /** Custom primary brand hex color */
  primaryColor?: string | undefined;
}

export interface MeetItParticipantInfo {
  id: string;
  displayName: string;
  role: 'host' | 'cohost' | 'speaker' | 'listener' | 'guest';
}

export interface MeetItEvents {
  /** Fired when the embedded iframe has loaded and initialized */
  ready: void;
  /** Fired when local user successfully joins the room */
  joined: { roomCode: string; selfId: string; displayName: string };
  /** Fired when local user leaves or is kicked from the room */
  left: { reason: string };
  /** Fired when another participant joins the room */
  participant_joined: { participant: MeetItParticipantInfo };
  /** Fired when a participant leaves */
  participant_left: { peerId: string };
  /** Fired when meeting recording starts or stops */
  recording_status: { isRecording: boolean; duration?: string | undefined };
  /** Fired on error */
  error: { code: string; message: string };
}

export type MeetItEventName = keyof MeetItEvents;

export interface MeetItCommandMessage {
  type:
    | 'meetit:cmd:set_mic'
    | 'meetit:cmd:set_camera'
    | 'meetit:cmd:leave'
    | 'meetit:cmd:send_chat'
    | 'meetit:cmd:start_recording'
    | 'meetit:cmd:stop_recording';
  payload?: unknown;
}

export interface MeetItInstance {
  /** Destroys the embed iframe and removes all listeners */
  destroy(): void;
  /** Mute or unmute microphone */
  setMic(enabled: boolean): void;
  /** Enable or disable video camera */
  setCamera(enabled: boolean): void;
  /** Hang up and leave meeting */
  leave(): void;
  /** Send message to in-meeting chat */
  sendChat(text: string): void;
  /** Subscribe to SDK events */
  on<E extends MeetItEventName>(
    event: E,
    handler: (payload: MeetItEvents[E]) => void,
  ): () => void;
  /** Returns the underlying iframe element */
  getIframe(): HTMLIFrameElement;
}

export interface MeetItSupportWidgetOptions {
  /** Support room code (e.g. abc-defg-hij) */
  roomCode: string;
  /** MeetIT base URL */
  baseUrl?: string | undefined;
  /** Button label (default: 'Live Support') */
  buttonText?: string | undefined;
  /** Customer display name */
  customerName?: string | undefined;
  /** Brand color */
  primaryColor?: string | undefined;
  /** Position on page */
  position?: 'bottom-right' | 'bottom-left' | undefined;
}

export interface MeetItSupportWidgetInstance {
  /** Open the click-to-call support popover */
  open(): void;
  /** Close the support popover */
  close(): void;
  /** Remove widget from DOM */
  destroy(): void;
}
