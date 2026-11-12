import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setupMediaSession,
  updateMediaSessionSpeaker,
  updateMediaSessionAudioState,
  clearMediaSession,
} from './mediaSessionService';

describe('mediaSessionService', () => {
  let actionHandlers: Record<string, (() => void) | null>;
  let mockMediaSession: any;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    actionHandlers = {};
    mockMediaSession = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn((action: string, handler: any) => {
        actionHandlers[action] = handler;
      }),
    };

    (globalThis as any).window = {
      MediaMetadata: class {
        title: string;
        artist: string;
        album: string;
        artwork: any[];
        constructor(init: any) {
          this.title = init.title;
          this.artist = init.artist;
          this.album = init.album;
          this.artwork = init.artwork;
        }
      },
    };

    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue({
        setAttribute: vi.fn(),
        style: {},
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        remove: vi.fn(),
      }),
      body: {
        appendChild: vi.fn(),
      },
    };

    Object.defineProperty(globalThis.navigator, 'mediaSession', {
      value: mockMediaSession,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    clearMediaSession();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    vi.restoreAllMocks();
  });

  it('sets up media session metadata and playback state', () => {
    const onToggleMute = vi.fn();
    const onLeaveCall = vi.fn();

    setupMediaSession({
      roomTitle: 'Team Standup',
      roomCode: 'abc-defg-hij',
      audioMuted: false,
      activeSpeaker: 'Alice',
      onToggleMute,
      onLeaveCall,
    });

    expect(mockMediaSession.metadata.title).toBe('Team Standup');
    expect(mockMediaSession.metadata.artist).toBe('Speaking: Alice');
    expect(mockMediaSession.playbackState).toBe('playing');
    expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(
      'play',
      expect.any(Function),
    );
    expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(
      'pause',
      expect.any(Function),
    );
    expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(
      'stop',
      expect.any(Function),
    );
  });

  it('triggers onToggleMute when play/pause action is invoked', () => {
    const onToggleMute = vi.fn();
    const onLeaveCall = vi.fn();

    setupMediaSession({
      roomTitle: 'Design Review',
      roomCode: 'xyz-uvw-rst',
      audioMuted: false,
      onToggleMute,
      onLeaveCall,
    });

    // When playing and pause action is pressed
    actionHandlers['pause']?.();
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    // Update state to muted
    updateMediaSessionAudioState(true);
    expect(mockMediaSession.playbackState).toBe('paused');

    // When paused and play action is pressed
    actionHandlers['play']?.();
    expect(onToggleMute).toHaveBeenCalledTimes(2);
  });

  it('updates active speaker on metadata dynamically', () => {
    setupMediaSession({
      roomTitle: 'Weekly Sync',
      roomCode: '123-456-789',
      audioMuted: true,
      onToggleMute: vi.fn(),
      onLeaveCall: vi.fn(),
    });

    updateMediaSessionSpeaker('Bob');
    expect(mockMediaSession.metadata.artist).toBe('Speaking: Bob');
  });

  it('clears handlers and metadata on cleanup', () => {
    setupMediaSession({
      roomTitle: 'Catchup',
      roomCode: 'aaa-bbb-ccc',
      audioMuted: false,
      onToggleMute: vi.fn(),
      onLeaveCall: vi.fn(),
    });

    clearMediaSession();
    expect(mockMediaSession.metadata).toBeNull();
    expect(mockMediaSession.playbackState).toBe('none');
  });
});
