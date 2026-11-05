import React, { useState, useMemo } from 'react';
import { Logo } from './Logo';
import {
  HomeIcon,
  UsrIcon,
  CalIcon,
  NotesIcon,
  RecIcon,
  SetIcon,
  PlusIcon,
  LnkIcon,
  KbIcon,
  CheckIcon,
  PanelRightIcon,
  CloseIcon,
  MenuIcon,
  SunIcon,
  MoonIcon,
} from './Icons';
import {
  generateRoomCode,
  normalizeRoomCode,
  copyToClipboard,
  type AuthUser,
} from '../types';

interface DashboardViewProps {
  user?: AuthUser | null;
  onSignOut?: () => void;
  currentTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onNavigateHome: () => void;
  onToast: (msg: string) => void;
}

interface ActionItem {
  id: number;
  text: string;
  done: boolean;
}

export function DashboardView({
  user,
  onSignOut,
  currentTheme = 'dark',
  onToggleTheme,
  onNavigateHome,
  onToast,
}: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<
    'home' | 'meetings' | 'schedule' | 'notes' | 'recordings' | 'settings'
  >('home');
  const [dashInput, setDashInput] = useState('');
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [isAudioFirst, setIsAudioFirst] = useState(true);
  const [isDataSaver, setIsDataSaver] = useState(false);
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isContextBarOpen, setIsContextBarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1040;
    }
    return true;
  });

  const [tasks, setTasks] = useState<ActionItem[]>([
    { id: 1, text: 'Ship lobby waiting room controls', done: true },
    { id: 2, text: 'Verify audio fallback on low bandwidth', done: false },
    { id: 3, text: 'Share webhook events schema with Mei', done: false },
  ]);

  const displayName = user?.displayName || 'Ada Okafor';
  const initial = (displayName[0] || 'A').toUpperCase();
  const firstName = displayName.split(' ')[0] || 'Ada';

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${firstName}`;
    if (hour < 18) return `Good afternoon, ${firstName}`;
    return `Good evening, ${firstName}`;
  }, [firstName]);

  const normalizedDashCode = normalizeRoomCode(dashInput);
  const isDashJoinDisabled = !normalizedDashCode;

  const handleInstantMeeting = async () => {
    const code = generateRoomCode();
    const url = `https://meetit.app/m/${code}`;
    const copied = await copyToClipboard(url);
    if (copied) {
      onToast(`Room ${code} is ready. Link copied.`);
    } else {
      onToast(`Room ${code} is ready.`);
    }
  };

  const handleJoinDash = () => {
    if (normalizedDashCode) {
      onToast(`Joining ${normalizedDashCode}…`);
      setDashInput('');
    }
  };

  const handleCopyPersonalRoom = async () => {
    const url = 'https://meetit.app/m/ada-okafor';
    const copied = await copyToClipboard(url);
    if (copied) {
      setCopiedRoom(true);
      onToast('Link copied to clipboard.');
      setTimeout(() => setCopiedRoom(false), 2000);
    } else {
      onToast('Copy failed. Select link and copy manually.');
    }
  };

  const handleJoinMeeting = (name: string) => {
    onToast(`Connecting to ${name}…`);
  };

  const handleComingSoon = (feature: string) => {
    onToast(`${feature} is coming in the next release.`);
  };

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  return (
    <div
      className={`app ${!isContextBarOpen ? 'no-context' : ''}`}
      data-view="dashboard"
    >
      {/* Mobile Navigation Drawer Backdrop */}
      {isNavDrawerOpen && (
        <div
          className="left-nav-backdrop"
          onClick={() => setIsNavDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. Left Navigation Sidebar (Desktop + Mobile Slide-over Drawer) */}
      <aside
        className={`left-nav ${isNavDrawerOpen ? 'drawer-open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="left-nav-header">
          <button
            type="button"
            className="brand-btn"
            onClick={() => {
              setIsNavDrawerOpen(false);
              onNavigateHome();
            }}
            aria-label="Back to MeetIT Home"
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Logo size="md" />
          </button>

          <button
            type="button"
            className="left-nav-close-btn"
            onClick={() => setIsNavDrawerOpen(false)}
            aria-label="Close navigation menu"
            title="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label="Dashboard views">
          <button
            type="button"
            aria-current={activeTab === 'home' ? 'page' : undefined}
            onClick={() => {
              setActiveTab('home');
              setIsNavDrawerOpen(false);
            }}
          >
            <HomeIcon />
            <span>Home</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'meetings' ? 'page' : undefined}
            onClick={() => {
              setActiveTab('meetings');
              setIsNavDrawerOpen(false);
              handleComingSoon('Meetings directory');
            }}
          >
            <UsrIcon />
            <span>Meetings</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'schedule' ? 'page' : undefined}
            onClick={() => {
              setActiveTab('schedule');
              setIsNavDrawerOpen(false);
              handleComingSoon('Schedule view');
            }}
          >
            <CalIcon />
            <span>Schedule</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'notes' ? 'page' : undefined}
            onClick={() => {
              setActiveTab('notes');
              setIsNavDrawerOpen(false);
              handleComingSoon('Meeting notes and AI summaries');
            }}
          >
            <NotesIcon />
            <span>Notes</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'recordings' ? 'page' : undefined}
            onClick={() => {
              setActiveTab('recordings');
              setIsNavDrawerOpen(false);
              handleComingSoon('Recordings archive');
            }}
          >
            <RecIcon />
            <span>Recordings</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            onClick={() => {
              setActiveTab('settings');
              setIsNavDrawerOpen(false);
              handleComingSoon('Account settings');
            }}
          >
            <SetIcon />
            <span>Settings</span>
          </button>
        </nav>

        <div className="me">
          <div className="av">{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName}
            </div>
            <small
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.email || 'Pro plan'}
            </small>
          </div>
          {onSignOut && (
            <button
              type="button"
              className="btn-icon-subtle"
              onClick={onSignOut}
              title="Sign out of account"
              aria-label="Sign out"
              style={{ width: '32px', height: '32px', borderRadius: '8px' }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
          {onToggleTheme && (
            <button
              type="button"
              className="theme-toggle"
              onClick={onToggleTheme}
              aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
              style={{ width: '32px', height: '32px' }}
            >
              {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          )}
        </div>
      </aside>

      {/* 2. Center Main Content Area */}
      <div className="dash-center">
        {/* Mobile Header Bar */}
        <header className="dash-mobile-header" aria-label="Mobile header">
          <div className="dash-mobile-header-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsNavDrawerOpen(true)}
              aria-label="Open navigation menu"
              title="Open menu"
            >
              <MenuIcon />
            </button>

            <button
              type="button"
              className="brand-btn"
              onClick={onNavigateHome}
              aria-label="Back to MeetIT Home"
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Logo size="sm" />
            </button>
          </div>

          <div className="dash-mobile-header-actions">
            {onToggleTheme && (
              <button
                type="button"
                className="theme-toggle"
                onClick={onToggleTheme}
                aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {currentTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            )}

            <button
              type="button"
              className="btn-icon-subtle"
              onClick={() => setIsContextBarOpen(true)}
              aria-label="Open Room and Tools drawer"
              title="Open Room and Tools"
            >
              <PanelRightIcon />
              <span className="dot-indicator" />
            </button>

            <div
              className="av-mobile"
              onClick={() => setIsNavDrawerOpen(true)}
              role="button"
              tabIndex={0}
              aria-label="Open user navigation drawer"
              title={`${displayName} · ${user?.email || 'Pro plan'}`}
              style={{ cursor: 'pointer' }}
            >
              {initial}
            </div>
          </div>
        </header>

        <main className="dash">
          <div className="head">
            <div>
              <h2 id="greet">{greeting}</h2>
              <p>You have 2 meetings today.</p>
            </div>

            <div className="head-actions">
              <div className="start" style={{ margin: 0 }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleInstantMeeting}
                >
                  <PlusIcon />
                  <span>New meeting</span>
                </button>
                <div className="code">
                  <KbIcon style={{ color: 'var(--muted)' }} />
                  <input
                    id="codeIn2"
                    type="text"
                    value={dashInput}
                    onChange={(e) => setDashInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isDashJoinDisabled) {
                        handleJoinDash();
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
                    id="joinBtn2"
                    disabled={isDashJoinDisabled}
                    onClick={handleJoinDash}
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Ribbon */}
          <div className="stats-ribbon" aria-label="Daily summary metrics">
            <div className="stat-card">
              <small>Today&apos;s Schedule</small>
              <strong>2 Meetings</strong>
            </div>
            <div className="stat-card">
              <small>Weekly Scheduled</small>
              <strong>4.5 Hours</strong>
            </div>
            <div className="stat-card">
              <small>Audio Resilience</small>
              <strong>100% Protected</strong>
            </div>
          </div>

          {/* Spotlight Next Meeting */}
          <div className="sec">
            <div className="next">
              <div>
                <small>Starts in 12 minutes</small>
                <h4>Client review: Brightline</h4>
                <small>2:00 PM, 45 min, 4 guests</small>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => handleJoinMeeting('Client review: Brightline')}
              >
                Join meeting
              </button>
            </div>
          </div>

          {/* Today's Schedule */}
          <div className="sec">
            <h3>
              <span>Today</span>
              <button
                type="button"
                onClick={() => handleComingSoon('Full schedule')}
              >
                Open schedule
              </button>
            </h3>
            <div className="row">
              <time>2:00 PM</time>
              <div>
                Client review: Brightline
                <small>Waiting room on</small>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => handleJoinMeeting('Client review: Brightline')}
              >
                Join
              </button>
            </div>
            <div className="row">
              <time>4:30 PM</time>
              <div>
                Cohort 7 office hours
                <small>23 registered</small>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => handleJoinMeeting('Cohort 7 office hours')}
              >
                Join
              </button>
            </div>
          </div>

          {/* Recent Meetings */}
          <div className="sec">
            <h3>
              <span>Recent meetings</span>
              <button
                type="button"
                onClick={() => handleComingSoon('Past meetings history')}
              >
                View all
              </button>
            </h3>
            <div className="row">
              <time>Mon</time>
              <div>
                Design sync
                <p className="sum">
                  Ship the lobby first and defer breakout rooms. Three action
                  items assigned.
                </p>
              </div>
              <span className="chip">Summary ready</span>
            </div>
            <div className="row">
              <time>Fri</time>
              <div>
                Onboarding call: Mei
                <p className="sum">
                  Agreed on the embed timeline and the webhook events to build
                  first.
                </p>
              </div>
              <span className="chip">Summary ready</span>
            </div>
            <div className="row">
              <time>Thu</time>
              <div>
                Weekly check-in
                <p className="sum">Recording is processing.</p>
              </div>
              <span
                className="chip"
                style={{ background: 'var(--line)', color: 'var(--muted)' }}
              >
                Processing
              </span>
            </div>
          </div>
        </main>

        {/* Reopen context bar tab (shown when context bar is collapsed on desktop) */}
        {!isContextBarOpen && (
          <button
            type="button"
            className="context-reopen-tab"
            onClick={() => setIsContextBarOpen(true)}
            aria-label="Open Room & Tools panel"
            title="Open Room & Tools panel"
          >
            <PanelRightIcon />
            <span>Room &amp; Tools</span>
          </button>
        )}
      </div>

      {/* 3. Right Context Bar (Desktop Sidebar & Mobile Drawer) */}
      {isContextBarOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="context-mobile-backdrop"
            onClick={() => setIsContextBarOpen(false)}
            aria-hidden="true"
          />

          <aside
            className="context-bar"
            aria-label="Meeting context and room tools"
          >
            <div className="context-header">
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <button
                  type="button"
                  className="context-collapse-btn"
                  onClick={() => setIsContextBarOpen(false)}
                  aria-label="Collapse right context bar"
                  title="Collapse right context bar"
                >
                  <PanelRightIcon />
                </button>
                <h3>Room &amp; Tools</h3>
              </div>

              <div className="context-header-actions">
                <span className="context-status">Connected</span>
                <button
                  type="button"
                  className="context-mobile-close"
                  onClick={() => setIsContextBarOpen(false)}
                  aria-label="Close panel"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            {/* Personal Room Panel */}
            <div className="panel">
              <h3>Your personal room</h3>
              <div className="link">
                <LnkIcon />
                <span id="roomLink">meetit.app/m/ada-okafor</span>
                <button
                  type="button"
                  id="copyBtn"
                  onClick={handleCopyPersonalRoom}
                  aria-label="Copy personal room link"
                >
                  {copiedRoom ? (
                    <CheckIcon style={{ width: 16, height: 16 }} />
                  ) : (
                    'Copy'
                  )}
                </button>
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => handleJoinMeeting('Ada Okafor Personal Room')}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Start in my room
              </button>
            </div>

            {/* Network & Connection Panel */}
            <div className="panel">
              <h3>Connection check</h3>
              <div className="q">
                <div className="bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div>
                  <b>Strong</b>
                  <small style={{ display: 'block', color: 'var(--muted)' }}>
                    38 ms latency, 0.2% loss
                  </small>
                </div>
              </div>

              <div className="sw">
                <div>
                  Audio first
                  <small>Protect voice on weak networks</small>
                </div>
                <button
                  type="button"
                  aria-pressed={isAudioFirst}
                  aria-label="Toggle Audio first mode"
                  onClick={() => {
                    const next = !isAudioFirst;
                    setIsAudioFirst(next);
                    onToast(
                      next
                        ? 'Audio first mode enabled.'
                        : 'Audio first mode disabled.',
                    );
                  }}
                />
              </div>

              <div className="sw">
                <div>
                  Data saver
                  <small>Cap video at 360p</small>
                </div>
                <button
                  type="button"
                  aria-pressed={isDataSaver}
                  aria-label="Toggle Data saver mode"
                  onClick={() => {
                    const next = !isDataSaver;
                    setIsDataSaver(next);
                    onToast(
                      next
                        ? 'Data saver active (360p cap).'
                        : 'Data saver turned off.',
                    );
                  }}
                />
              </div>
            </div>

            {/* Follow-up Action Items */}
            <div className="context-sec">
              <div className="context-sec-head">
                <span>Follow-up action items</span>
                <span className="badge">
                  {tasks.filter((t) => !t.done).length} pending
                </span>
              </div>
              <div className="task-list">
                {tasks.map((task) => (
                  <label
                    key={task.id}
                    className={`task-item ${task.done ? 'done' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                    />
                    <span>{task.text}</span>
                  </label>
                ))}
              </div>
            </div>
          </aside>
        </>
      )}

      {/* 4. Mobile Bottom Navigation Bar */}
      <nav className="dash-mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={activeTab === 'home' ? 'active' : ''}
          onClick={() => setActiveTab('home')}
        >
          <HomeIcon />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={activeTab === 'meetings' ? 'active' : ''}
          onClick={() => {
            setActiveTab('meetings');
            handleComingSoon('Meetings directory');
          }}
        >
          <UsrIcon />
          <span>Meetings</span>
        </button>
        <button
          type="button"
          className={activeTab === 'schedule' ? 'active' : ''}
          onClick={() => {
            setActiveTab('schedule');
            handleComingSoon('Schedule view');
          }}
        >
          <CalIcon />
          <span>Schedule</span>
        </button>
        <button
          type="button"
          className={activeTab === 'notes' ? 'active' : ''}
          onClick={() => {
            setActiveTab('notes');
            handleComingSoon('Meeting notes and AI summaries');
          }}
        >
          <NotesIcon />
          <span>Notes</span>
        </button>
      </nav>
    </div>
  );
}
