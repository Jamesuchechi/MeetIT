import React, { useState, useRef, useEffect } from 'react';
import { VidIcon, LnkIcon, CalIcon, HomeIcon, KbIcon } from './Icons';
import { CallPreview } from './CallPreview';
import { Logo } from './Logo';
import { normalizeRoomCode, copyToClipboard } from '../types';
import { createRoomViaApi } from '../lib/signalingClient';

interface LandingViewProps {
  onNavigateDashboard: () => void;
  onEnterRoom: (code: string) => void;
  onToast: (message: string) => void;
}

export function LandingView({
  onNavigateDashboard,
  onEnterRoom,
  onToast,
}: LandingViewProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [meetingInput, setMeetingInput] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const newBtnRef = useRef<HTMLButtonElement>(null);

  const normalizedCode = normalizeRoomCode(meetingInput);
  const isJoinDisabled = !normalizedCode;

  // Close popup menu when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        newBtnRef.current?.focus();
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleInstantMeeting = async () => {
    setIsMenuOpen(false);
    const code = await createRoomViaApi();
    const url = `${window.location.origin}/m/${code}`;
    const copied = await copyToClipboard(url);
    if (copied) {
      onToast(`Room ${code} created. Invite link copied.`);
    } else {
      onToast(`Room ${code} created.`);
    }
    onEnterRoom(code);
  };

  const handleScheduleLater = async () => {
    setIsMenuOpen(false);
    const code = await createRoomViaApi();
    const url = `${window.location.origin}/m/${code}`;
    const copied = await copyToClipboard(url);
    if (copied) {
      onToast(`Meeting link ${code} copied for later.`);
    } else {
      onToast(`Meeting code for later: ${code}`);
    }
  };

  const handleOpenDashboard = () => {
    setIsMenuOpen(false);
    onNavigateDashboard();
  };

  const handleJoin = () => {
    if (normalizedCode) {
      setMeetingInput('');
      onEnterRoom(normalizedCode);
    }
  };

  return (
    <div data-view="home">
      <div className="wrap">
        <section className="hero">
          <div>
            <h1>Video meetings that keep going.</h1>
            <p className="lede">
              Start a call in one click and invite anyone with a link. When
              someone’s connection drops, MeetIT holds on to the audio so the
              conversation doesn’t stop.
            </p>

            <div className="start">
              <div className="menu" ref={menuRef}>
                <button
                  type="button"
                  ref={newBtnRef}
                  className="btn primary"
                  id="newBtn"
                  aria-haspopup="true"
                  aria-expanded={isMenuOpen}
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  <VidIcon />
                  <span>New meeting</span>
                </button>

                {isMenuOpen && (
                  <div
                    className="pop"
                    role="menu"
                    aria-label="Create meeting options"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleInstantMeeting()}
                    >
                      <LnkIcon />
                      <span>Start an instant meeting</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleScheduleLater()}
                    >
                      <CalIcon />
                      <span>Create a meeting for later</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenDashboard}
                    >
                      <HomeIcon />
                      <span>Open my dashboard</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="code">
                <KbIcon style={{ color: 'var(--muted)' }} />
                <input
                  id="codeIn"
                  type="text"
                  value={meetingInput}
                  onChange={(e) => setMeetingInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isJoinDisabled) {
                      handleJoin();
                    }
                  }}
                  placeholder="Enter a code or link"
                  aria-label="Meeting code or link"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={80}
                />
                <button
                  type="button"
                  className="btn"
                  id="joinBtn"
                  disabled={isJoinDisabled}
                  onClick={handleJoin}
                >
                  Join
                </button>
              </div>
            </div>

            <p className="fine">
              Guests join with just a name. No account, no install.{' '}
              <button
                type="button"
                onClick={onNavigateDashboard}
                className="btn-link"
              >
                Sign in
              </button>{' '}
              to schedule and record.
            </p>
          </div>

          <CallPreview onAction={onToast} />
        </section>

        <section className="pillars" aria-label="MeetIT key capabilities">
          <div>
            <h3>Audio comes first</h3>
            <p>
              On a weak network MeetIT lowers video quality before it ever
              touches your voice, then restores it when the signal returns.
            </p>
          </div>
          <div>
            <h3>Guests walk right in</h3>
            <p>
              Share a link and people join from any browser. Hosts get a waiting
              room, a lock and mute-all when they need them.
            </p>
          </div>
          <div>
            <h3>Notes when it ends</h3>
            <p>
              Turn on captions and get a summary with decisions and action items
              as soon as the meeting is over.
            </p>
          </div>
        </section>
      </div>

      <footer className="wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo size="sm" />
        </div>
        <span>A sibling to FormIT</span>
      </footer>
    </div>
  );
}
