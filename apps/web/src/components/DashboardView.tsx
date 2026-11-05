import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  normalizeRoomCode,
  copyToClipboard,
  personalRoomCodeForUser,
  type AuthUser,
  type DashboardTab,
} from '../types';
import { createRoomViaApi } from '../lib/signalingClient';
import {
  downloadIcsFile,
  ensurePersonalRoomForUser,
  formatRecurrenceLabel,
  loadLocalRooms,
  loadMeetingHistory,
  loadScheduledMeetings,
  type MeetingHistoryItem,
  type SavedRoom,
  type ScheduledMeetingItem,
} from '../lib/meetingsStore';
import { Avatar } from './Avatar';
import { ProfileView } from './ProfileView';
import { ProfileEditView } from './ProfileEditView';
import { SettingsView } from './SettingsView';
import { MeetingsView } from './MeetingsView';
import { ScheduleView } from './ScheduleView';

interface DashboardViewProps {
  user?: AuthUser | null;
  initialTab?: DashboardTab;
  viewedProfileUserId?: string | null;
  onSignOut?: () => void;
  currentTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onEnterRoom: (code: string) => void;
  onToast: (msg: string) => void;
}

interface ActionItem {
  id: number;
  text: string;
  done: boolean;
}

const TAB_LABELS: Record<DashboardTab, string> = {
  home: 'Overview',
  meetings: 'Meetings & History',
  schedule: 'Schedule',
  notes: 'Notes',
  recordings: 'Recordings',
  settings: 'Settings',
  profile: 'Public Profile',
  'profile-edit': 'Edit Profile',
};

export function DashboardView({
  user,
  initialTab = 'home',
  viewedProfileUserId = null,
  onSignOut,
  currentTheme = 'dark',
  onToggleTheme,
  onEnterRoom,
  onToast,
}: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [profileUserId, setProfileUserId] = useState<string | null>(
    viewedProfileUserId,
  );
  const [dashInput, setDashInput] = useState('');
  const [topbarCodeInput, setTopbarCodeInput] = useState('');
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [isAudioFirst, setIsAudioFirst] = useState(true);
  const [isDataSaver, setIsDataSaver] = useState(false);
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isContextBarOpen, setIsContextBarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1120;
    }
    return true;
  });

  const [rooms, setRooms] = useState<SavedRoom[]>(() =>
    loadLocalRooms(user?.id),
  );
  const [history, setHistory] = useState<MeetingHistoryItem[]>(() =>
    loadMeetingHistory(),
  );
  const [scheduled, setScheduled] = useState<ScheduledMeetingItem[]>(() =>
    loadScheduledMeetings(),
  );

  const refreshMeetingsData = useCallback(() => {
    if (user) {
      ensurePersonalRoomForUser({
        id: user.id,
        displayName: user.displayName,
      });
    }
    setRooms(loadLocalRooms(user?.id));
    setHistory(loadMeetingHistory());
    setScheduled(loadScheduledMeetings());
  }, [user]);

  useEffect(() => {
    refreshMeetingsData();
  }, [refreshMeetingsData]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setProfileUserId(viewedProfileUserId);
  }, [viewedProfileUserId]);

  const [tasks, setTasks] = useState<ActionItem[]>([
    { id: 1, text: 'Ship lobby waiting room controls', done: true },
    { id: 2, text: 'Verify audio fallback on low bandwidth', done: false },
    { id: 3, text: 'Share webhook events schema with Mei', done: false },
  ]);

  const displayName = user?.displayName || 'there';
  const personalRoomCode = personalRoomCodeForUser(user?.id ?? '');
  const firstName = displayName.split(' ')[0] || 'there';

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${firstName}`;
    if (hour < 18) return `Good afternoon, ${firstName}`;
    return `Good evening, ${firstName}`;
  }, [firstName]);

  const normalizedDashCode = normalizeRoomCode(dashInput);
  const isDashJoinDisabled = !normalizedDashCode;

  const normalizedTopbarCode = normalizeRoomCode(topbarCodeInput);
  const isTopbarJoinDisabled = !normalizedTopbarCode;

  const selectTab = (tab: DashboardTab, nextProfileUserId?: string | null) => {
    setActiveTab(tab);
    if (nextProfileUserId !== undefined) {
      setProfileUserId(nextProfileUserId);
    } else if (tab === 'profile' || tab === 'profile-edit') {
      setProfileUserId(user?.id ?? null);
    }
    window.scrollTo(0, 0);
  };

  const handleInstantMeeting = async () => {
    const code = await createRoomViaApi({
      title: `${firstName}'s Instant Meeting`,
      kind: 'instant',
      ...(user?.id ? { ownerId: user.id } : {}),
    });
    const url = `${window.location.origin}/m/${code}`;
    const copied = await copyToClipboard(url);
    if (copied) {
      onToast(`Room ${code} is ready. Link copied.`);
    } else {
      onToast(`Room ${code} is ready.`);
    }
    onEnterRoom(code);
  };

  const handleJoinDash = () => {
    if (normalizedDashCode) {
      setDashInput('');
      onEnterRoom(normalizedDashCode);
    }
  };

  const handleJoinTopbar = () => {
    if (normalizedTopbarCode) {
      setTopbarCodeInput('');
      onEnterRoom(normalizedTopbarCode);
    }
  };

  const handleCopyPersonalRoom = async () => {
    const url = `${window.location.origin}/m/${personalRoomCode}`;
    const copied = await copyToClipboard(url);
    if (copied) {
      setCopiedRoom(true);
      onToast('Link copied to clipboard.');
      setTimeout(() => setCopiedRoom(false), 2000);
    } else {
      onToast('Copy failed. Select link and copy manually.');
    }
  };

  const handleJoinMeeting = (name: string, code = personalRoomCode) => {
    onToast(`Entering ${name}…`);
    onEnterRoom(code);
  };

  const handleComingSoon = (feature: string) => {
    onToast(`${feature} is coming in the next release.`);
  };

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  // Compute real metrics from scheduled meetings and call history
  const nextScheduled = scheduled[0] ?? null;
  const totalScheduledMinutes = scheduled.reduce(
    (sum, m) => sum + m.durationMinutes,
    0,
  );
  const scheduledHoursLabel =
    totalScheduledMinutes > 0
      ? `${(totalScheduledMinutes / 60).toFixed(1)} Hours`
      : '0 Hours';

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
              selectTab('home');
            }}
            aria-label="MeetIT Dashboard Home"
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
              selectTab('home');
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
              selectTab('meetings');
              setIsNavDrawerOpen(false);
            }}
          >
            <UsrIcon />
            <span>Meetings</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'schedule' ? 'page' : undefined}
            onClick={() => {
              selectTab('schedule');
              setIsNavDrawerOpen(false);
            }}
          >
            <CalIcon />
            <span>Schedule</span>
          </button>
          <button
            type="button"
            aria-current={activeTab === 'notes' ? 'page' : undefined}
            onClick={() => {
              selectTab('notes');
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
              selectTab('recordings');
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
              selectTab('settings');
              setIsNavDrawerOpen(false);
            }}
          >
            <SetIcon />
            <span>Settings</span>
          </button>
        </nav>

        <div className="me">
          <button
            type="button"
            className={`me-profile-trigger ${activeTab === 'profile' || activeTab === 'profile-edit' ? 'active' : ''}`}
            onClick={() => {
              selectTab('profile', user?.id ?? null);
              setIsNavDrawerOpen(false);
            }}
            title="View your public profile"
            aria-label="View your public profile"
          >
            <Avatar name={displayName} src={user?.avatarUrl} className="av" />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
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
                View profile
              </small>
            </div>
          </button>

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
        </div>
      </aside>

      {/* 2. Center Main Content Area */}
      <div className="dash-center">
        {/* Desktop Top Bar */}
        <header
          className="dash-desktop-topbar"
          aria-label="Workspace top bar"
          data-testid="desktop-topbar"
        >
          <div className="topbar-left">
            <div className="topbar-breadcrumb">
              <button
                type="button"
                className="breadcrumb-root"
                onClick={() => selectTab('home')}
              >
                Dashboard
              </button>
              <span className="breadcrumb-sep" aria-hidden="true">
                /
              </span>
              <span className="breadcrumb-current">
                {TAB_LABELS[activeTab]}
              </span>
            </div>

            <div className="topbar-quick-join">
              <KbIcon
                style={{ color: 'var(--muted)', width: 15, height: 15 }}
              />
              <input
                type="text"
                value={topbarCodeInput}
                onChange={(e) => setTopbarCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isTopbarJoinDisabled) {
                    handleJoinTopbar();
                  }
                }}
                placeholder="Join with code or link…"
                aria-label="Quick join meeting code"
                maxLength={80}
              />
              <button
                type="button"
                className="topbar-join-btn"
                disabled={isTopbarJoinDisabled}
                onClick={handleJoinTopbar}
              >
                Join
              </button>
            </div>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="btn primary topbar-new-btn"
              onClick={() => void handleInstantMeeting()}
            >
              <PlusIcon />
              <span>New meeting</span>
            </button>

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
              className={`topbar-context-btn ${isContextBarOpen ? 'active' : ''}`}
              onClick={() => setIsContextBarOpen((prev) => !prev)}
              aria-pressed={isContextBarOpen}
              aria-label={
                isContextBarOpen
                  ? 'Hide Room & Tools panel'
                  : 'Show Room & Tools panel'
              }
              title={
                isContextBarOpen
                  ? 'Hide Room & Tools panel'
                  : 'Show Room & Tools panel'
              }
            >
              <PanelRightIcon />
              <span>Room &amp; Tools</span>
            </button>

            <button
              type="button"
              className={`topbar-profile-chip ${activeTab === 'profile' || activeTab === 'profile-edit' ? 'active' : ''}`}
              onClick={() => selectTab('profile', user?.id ?? null)}
              aria-label="Open your public profile"
              title="View your public profile"
              data-testid="topbar-profile-chip"
            >
              <Avatar
                name={displayName}
                src={user?.avatarUrl}
                className="av-topbar"
              />
              <span>{firstName}</span>
            </button>
          </div>
        </header>

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
              onClick={() => selectTab('home')}
              aria-label="MeetIT Dashboard Home"
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

            <button
              type="button"
              className="av-mobile-btn"
              onClick={() => selectTab('profile', user?.id ?? null)}
              aria-label="Open your public profile"
              title={`${displayName} · Public profile`}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <Avatar
                name={displayName}
                src={user?.avatarUrl}
                className="av-mobile"
              />
            </button>
          </div>
        </header>

        <main className="dash">
          {activeTab === 'profile' ? (
            <ProfileView
              currentUser={user ?? null}
              viewedUserId={profileUserId ?? user?.id ?? null}
              onEditProfile={() => selectTab('profile-edit', user?.id ?? null)}
              onEnterRoom={onEnterRoom}
              onToast={onToast}
            />
          ) : activeTab === 'profile-edit' ? (
            <ProfileEditView
              currentUser={user ?? null}
              targetUserId={profileUserId ?? user?.id ?? null}
              onCancel={() => selectTab('profile', user?.id ?? null)}
              onSaved={() => selectTab('profile', user?.id ?? null)}
              onToast={onToast}
            />
          ) : activeTab === 'settings' ? (
            <SettingsView
              user={user ?? null}
              currentTheme={currentTheme}
              {...(onToggleTheme ? { onToggleTheme } : {})}
              onOpenProfile={() => selectTab('profile', user?.id ?? null)}
              onOpenProfileEdit={() =>
                selectTab('profile-edit', user?.id ?? null)
              }
              {...(onSignOut ? { onSignOut } : {})}
              onToast={onToast}
            />
          ) : activeTab === 'meetings' ? (
            <MeetingsView
              user={user ?? null}
              rooms={rooms}
              history={history}
              onRefreshData={refreshMeetingsData}
              onEnterRoom={onEnterRoom}
              onToast={onToast}
            />
          ) : activeTab === 'schedule' ? (
            <ScheduleView
              user={user ?? null}
              scheduled={scheduled}
              onRefreshData={refreshMeetingsData}
              onEnterRoom={onEnterRoom}
              onToast={onToast}
            />
          ) : (
            <>
              <div className="head">
                <div>
                  <h2 id="greet">{greeting}</h2>
                  <p>
                    {scheduled.length === 0
                      ? 'Your personal room is ready for instant or scheduled calls.'
                      : `You have ${scheduled.length} scheduled ${scheduled.length === 1 ? 'meeting' : 'meetings'}.`}
                  </p>
                </div>

                <div className="head-actions">
                  <div className="start" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => void handleInstantMeeting()}
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
                  <small>Scheduled Sessions</small>
                  <strong>
                    {scheduled.length}{' '}
                    {scheduled.length === 1 ? 'Meeting' : 'Meetings'}
                  </strong>
                </div>
                <div className="stat-card">
                  <small>Scheduled Duration</small>
                  <strong>{scheduledHoursLabel}</strong>
                </div>
                <div className="stat-card">
                  <small>Completed Calls</small>
                  <strong>
                    {history.length}{' '}
                    {history.length === 1 ? 'Session' : 'Sessions'}
                  </strong>
                </div>
              </div>

              {/* Spotlight Next Meeting or Personal Room Card */}
              <div className="sec">
                {nextScheduled ? (
                  <div className="next">
                    <div>
                      <small>
                        Next scheduled ·{' '}
                        {new Date(nextScheduled.startsAt).toLocaleString(
                          undefined,
                          {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          },
                        )}
                      </small>
                      <h4>{nextScheduled.title}</h4>
                      <small>
                        {nextScheduled.durationMinutes} min · Room{' '}
                        {nextScheduled.roomCode}
                        {nextScheduled.rrule
                          ? ` · ${formatRecurrenceLabel(nextScheduled.rrule)}`
                          : ''}
                      </small>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => downloadIcsFile(nextScheduled)}
                      >
                        .ics Invite
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          handleJoinMeeting(
                            nextScheduled.title,
                            nextScheduled.roomCode,
                          )
                        }
                      >
                        Join meeting
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="next">
                    <div>
                      <small>Permanent Personal Room · Always ready</small>
                      <h4>{firstName}&apos;s Personal Studio</h4>
                      <small>
                        meetit.app/m/{personalRoomCode} · Up to 4 HD mesh peers
                      </small>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => selectTab('schedule')}
                      >
                        Schedule a call
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          handleJoinMeeting(
                            'your personal room',
                            personalRoomCode,
                          )
                        }
                      >
                        Start in my room
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Upcoming Schedule */}
              <div className="sec">
                <h3>
                  <span>Upcoming schedule</span>
                  <button type="button" onClick={() => selectTab('schedule')}>
                    {scheduled.length > 0
                      ? 'Manage schedule'
                      : '+ Schedule meeting'}
                  </button>
                </h3>
                {scheduled.length === 0 ? (
                  <div className="empty-state-box">
                    <p>
                      No upcoming meetings scheduled. Click{' '}
                      <strong>+ Schedule meeting</strong> to create a one-time
                      or recurring session with a downloadable `.ics` invite.
                    </p>
                  </div>
                ) : (
                  scheduled.slice(0, 4).map((item) => {
                    const start = new Date(item.startsAt);
                    const timeStr = start.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    });
                    return (
                      <div key={item.id} className="row">
                        <time>{timeStr}</time>
                        <div>
                          {item.title}
                          <small>
                            {start.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            · {item.durationMinutes} min ·{' '}
                            <code>{item.roomCode}</code>
                            {item.rrule
                              ? ` · ${formatRecurrenceLabel(item.rrule)}`
                              : ''}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            handleJoinMeeting(item.title, item.roomCode)
                          }
                        >
                          Join
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Recent Meetings History */}
              <div className="sec">
                <h3>
                  <span>Recent meetings</span>
                  <button type="button" onClick={() => selectTab('meetings')}>
                    View all history
                  </button>
                </h3>
                {history.length === 0 ? (
                  <div className="empty-state-box">
                    <p>
                      No past calls recorded yet. Once you complete a call, its
                      duration and attendee list will appear here automatically.
                    </p>
                  </div>
                ) : (
                  history.slice(0, 4).map((item) => {
                    const dateLabel = new Date(
                      item.startedAt,
                    ).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    });
                    return (
                      <div key={item.id} className="row">
                        <time>{dateLabel}</time>
                        <div>
                          {item.roomTitle}
                          <p className="sum">
                            {item.durationMinutes} min ·{' '}
                            {item.attendees
                              .map((a) => a.displayName)
                              .join(', ') || 'Solo session'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => onEnterRoom(item.roomCode)}
                        >
                          Rejoin
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </main>
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
                <span id="roomLink">{`meetit.app/m/${personalRoomCode}`}</span>
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
                onClick={() => handleJoinMeeting('your personal room')}
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
          onClick={() => selectTab('home')}
        >
          <HomeIcon />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={activeTab === 'meetings' ? 'active' : ''}
          onClick={() => selectTab('meetings')}
        >
          <UsrIcon />
          <span>Meetings</span>
        </button>
        <button
          type="button"
          className={activeTab === 'schedule' ? 'active' : ''}
          onClick={() => selectTab('schedule')}
        >
          <CalIcon />
          <span>Schedule</span>
        </button>
        <button
          type="button"
          className={activeTab === 'notes' ? 'active' : ''}
          onClick={() => {
            selectTab('notes');
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
