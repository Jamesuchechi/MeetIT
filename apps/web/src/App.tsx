import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { LandingView } from './components/LandingView';
import { DashboardView } from './components/DashboardView';
import { AuthView } from './components/AuthView';
import { MeetingRoomView } from './components/MeetingRoomView';
import { WebinarRegistrationView } from './components/WebinarRegistrationView';
import { BookingPageView } from './components/BookingPageView';
import { EndedView } from './components/EndedView';
import { NotFoundView } from './components/NotFoundView';
import { StatusPageView } from './components/StatusPageView';
import { Toast } from './components/Toast';
import { Logo } from './components/Logo';
import { Zap, X } from 'lucide-react';
import { normalizeRoomCode, type ViewMode, type DashboardTab } from './types';

interface ParsedRoute {
  view: ViewMode;
  roomCode: string | null;
  dashTab?: DashboardTab;
  profileUserId?: string | null;
}

export function extractSharedRoomCodeFromSearch(search: string): string | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(
      search.startsWith('?') ? search : `?${search}`,
    );
    const candidates = [
      params.get('room'),
      params.get('code'),
      params.get('roomCode'),
      params.get('m'),
      params.get('url'),
      params.get('text'),
      params.get('title'),
    ];
    for (const candidate of candidates) {
      if (candidate) {
        const normalized = normalizeRoomCode(candidate);
        if (normalized) return normalized;
      }
    }
  } catch {
    // ignore malformed query string
  }
  return null;
}

function parseLocationRoute(
  pathname: string,
  hash: string,
  search = typeof window !== 'undefined' ? window.location.search : '',
): ParsedRoute {
  // 0. Check Web Share Target query parameters (?share-target=1&url=...&text=...)
  const sharedCode = extractSharedRoomCodeFromSearch(search);
  if (sharedCode) {
    return { view: 'room', roomCode: sharedCode };
  }

  const rawHash = hash.replace(/^#\/?/, '').trim();
  const cleanHash = rawHash.toLowerCase();
  const cleanPath = pathname
    .replace(/^\/+|\/+$/g, '')
    .trim()
    .toLowerCase();

  // Auth redirects (OAuth / magic link / email confirm) land on `#access_token=...`
  if (
    cleanHash.startsWith('access_token=') ||
    cleanHash.startsWith('error=') ||
    cleanHash.includes('refresh_token=')
  ) {
    return { view: 'home', roomCode: null };
  }

  // Check hash first if present, otherwise pathname
  const target = (cleanHash || cleanPath).split('?')[0] ?? '';

  if (!target || target === 'home') {
    return { view: 'home', roomCode: null };
  }
  if (target === 'dashboard') {
    return { view: 'dashboard', roomCode: null, dashTab: 'home' };
  }
  if (target === 'notes' || target === 'dashboard/notes') {
    return { view: 'dashboard', roomCode: null, dashTab: 'notes' };
  }
  if (target === 'schedule' || target === 'dashboard/schedule') {
    return { view: 'dashboard', roomCode: null, dashTab: 'schedule' };
  }
  if (target === 'meetings' || target === 'dashboard/meetings') {
    return { view: 'dashboard', roomCode: null, dashTab: 'meetings' };
  }
  if (target === 'settings' || target === 'dashboard/settings') {
    return { view: 'dashboard', roomCode: null, dashTab: 'settings' };
  }
  if (
    target === 'analytics' ||
    target === 'dashboard/analytics' ||
    target === 'insights' ||
    target === 'dashboard/insights'
  ) {
    return { view: 'dashboard', roomCode: null, dashTab: 'analytics' };
  }
  if (
    target === 'cost' ||
    target === 'telemetry' ||
    target === 'dashboard/cost' ||
    target === 'dashboard/telemetry'
  ) {
    return { view: 'dashboard', roomCode: null, dashTab: 'cost' };
  }
  if (
    target === 'audit' ||
    target === 'audit-log' ||
    target === 'dashboard/audit' ||
    target === 'dashboard/audit-log'
  ) {
    return { view: 'dashboard', roomCode: null, dashTab: 'audit' };
  }
  if (
    target === 'memory' ||
    target === 'memory-lab' ||
    target === 'dashboard/memory'
  ) {
    return { view: 'dashboard', roomCode: null, dashTab: 'memory' };
  }
  if (
    target === 'slides' ||
    target === 'presentations' ||
    target === 'dashboard/slides'
  ) {
    return { view: 'dashboard', roomCode: null, dashTab: 'slides' };
  }
  if (target === 'profile' || target === 'dashboard/profile') {
    return { view: 'dashboard', roomCode: null, dashTab: 'profile' };
  }
  if (
    target === 'profile/edit' ||
    target === 'profile-edit' ||
    target === 'dashboard/profile/edit'
  ) {
    return { view: 'dashboard', roomCode: null, dashTab: 'profile-edit' };
  }
  if (target.startsWith('profile/')) {
    const idPart = rawHash ? rawHash.slice('profile/'.length) : target.slice(8);
    return {
      view: 'dashboard',
      roomCode: null,
      dashTab: 'profile',
      profileUserId: idPart || null,
    };
  }
  if (target === 'signin' || target === 'login' || target === 'auth') {
    return { view: 'signin', roomCode: null };
  }
  if (target === 'signup' || target === 'register') {
    return { view: 'signup', roomCode: null };
  }
  if (target === 'ended') {
    return { view: 'ended', roomCode: null };
  }
  if (target === 'status' || target === 'system-status') {
    return { view: 'status', roomCode: null };
  }
  if (target === '404') {
    return { view: '404', roomCode: null };
  }

  // Support Webinar registration: /w/xxx/register, /webinar/xxx/register, /register/xxx
  if (target.startsWith('w/') || target.startsWith('webinar/')) {
    const parts = target.split('/');
    if (parts.length >= 3 && parts[2] === 'register') {
      const normalized = normalizeRoomCode(parts[1] ?? '');
      if (normalized) {
        return { view: 'webinar-register', roomCode: normalized };
      }
    }
  }
  if (target.startsWith('register/')) {
    const rawCode = target.slice('register/'.length);
    const normalized = normalizeRoomCode(rawCode);
    if (normalized) {
      return { view: 'webinar-register', roomCode: normalized };
    }
  }

  // Support Free Booking Page: /book/:handle or #book/:handle
  if (target.startsWith('book/')) {
    const handle = target.slice('book/'.length).trim();
    if (handle) {
      return { view: 'booking', roomCode: handle };
    }
  }

  // Support /m/xxx, /room/xxx, /join/xxx, /meet/xxx
  if (
    target.startsWith('m/') ||
    target.startsWith('room/') ||
    target.startsWith('join/') ||
    target.startsWith('meet/')
  ) {
    const slashIdx = target.indexOf('/');
    const rawCode = target.slice(slashIdx + 1);
    const normalized = normalizeRoomCode(rawCode);
    if (normalized) {
      return { view: 'room', roomCode: normalized };
    }
    return { view: '404', roomCode: null };
  }

  // Support direct room code in path or hash (e.g. /abc-defg-hij or /abcdefghij)
  const directRoomCode = normalizeRoomCode(target);
  if (directRoomCode) {
    return { view: 'room', roomCode: directRoomCode };
  }

  return { view: '404', roomCode: null };
}

function AppContent() {
  const { user, isLoading, signOut } = useAuth();
  const [route, setRoute] = useState<ParsedRoute>(() =>
    parseLocationRoute(window.location.pathname, window.location.hash),
  );
  const [lastRoomCode, setLastRoomCode] = useState<string | null>(() => {
    const initial = parseLocationRoute(
      window.location.pathname,
      window.location.hash,
    );
    return initial.roomCode;
  });
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  } | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const signingOutRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  const navigateTo = useCallback(
    (
      nextView: ViewMode,
      roomCode?: string | null,
      options: { replace?: boolean } = {},
    ) => {
      let nextUrl = '/';
      if (nextView === 'home') {
        nextUrl = '/';
      } else if (nextView === 'room' && roomCode) {
        nextUrl = `/m/${roomCode}`;
        setLastRoomCode(roomCode);
      } else if (nextView === 'ended') {
        nextUrl = '/ended';
      } else if (nextView === '404') {
        nextUrl = '/404';
      } else {
        nextUrl = `/#${nextView}`;
      }

      if (options.replace) {
        window.history.replaceState({}, '', nextUrl);
      } else {
        window.history.pushState({}, '', nextUrl);
      }
      setRoute({ view: nextView, roomCode: roomCode ?? null });
      window.scrollTo(0, 0);
    },
    [],
  );

  // Sync with browser popstate, hashchange, online/offline, and PWA install prompt
  useEffect(() => {
    function syncLocation() {
      const next = parseLocationRoute(
        window.location.pathname,
        window.location.hash,
        window.location.search,
      );
      if (next.roomCode) {
        setLastRoomCode(next.roomCode);
      }
      setRoute(next);
      window.scrollTo(0, 0);
    }

    const handleOnline = () => {
      setIsOffline(false);
      showToast('Back online — connection restored.');
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast('You are offline — running in offline shell mode.');
    };
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(
        e as unknown as {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
        },
      );
    };

    window.addEventListener('popstate', syncLocation);
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener('hashchange', syncLocation);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
    };
  }, [showToast]);

  // Route guards:
  //  - dashboard requires a session
  //  - signed-in users never see the landing page or auth pages; they go to the dashboard
  useEffect(() => {
    if (isLoading || signingOutRef.current) return;

    if (route.view === 'dashboard' && !user) {
      showToast('Please sign in to access your dashboard.');
      navigateTo('signin', null, { replace: true });
    } else if (
      user &&
      (route.view === 'signin' ||
        route.view === 'signup' ||
        route.view === 'home')
    ) {
      navigateTo('dashboard', null, { replace: true });
    }
  }, [route.view, user, isLoading, navigateTo, showToast]);

  // Theme setup: check prefers-color-scheme
  useEffect(() => {
    const isDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = isDark ? 'dark' : 'light';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const handleSignOut = async () => {
    signingOutRef.current = true;
    navigateTo('home', null, { replace: true });
    await signOut();
    signingOutRef.current = false;
    showToast('Signed out successfully.');
  };

  const handleEnterRoom = useCallback(
    (code: string) => {
      const normalized = normalizeRoomCode(code);
      if (!normalized) {
        navigateTo('404');
        return;
      }
      navigateTo('room', normalized);
    },
    [navigateTo],
  );

  const handleLeaveCall = useCallback(
    (code: string) => {
      setLastRoomCode(code);
      navigateTo('ended');
    },
    [navigateTo],
  );

  return (
    <>
      {isOffline && (
        <div
          className="pwa-offline-banner"
          role="status"
          aria-live="polite"
          data-testid="pwa-offline-banner"
        >
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Zap size={14} /> Offline shell active — your scheduled meetings,
            notes, and action items are available locally. Calls will reconnect
            automatically when back online.
          </span>
        </div>
      )}

      {deferredInstallPrompt && route.view !== 'room' && (
        <div className="pwa-install-pill" data-testid="pwa-install-pill">
          <span>Install MeetIT for 1-tap desktop &amp; mobile access</span>
          <button
            type="button"
            className="btn primary"
            style={{ padding: '5px 12px', fontSize: 12.5 }}
            onClick={() => {
              void (async () => {
                await deferredInstallPrompt.prompt();
                await deferredInstallPrompt.userChoice;
                setDeferredInstallPrompt(null);
              })();
            }}
          >
            Install app
          </button>
          <button
            type="button"
            className="btn-icon-subtle"
            style={{ width: 28, height: 28 }}
            onClick={() => setDeferredInstallPrompt(null)}
            aria-label="Dismiss install prompt"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isLoading && route.view !== 'room' && (
        <div
          className="auth-splash"
          role="status"
          aria-live="polite"
          aria-label="Restoring your session"
        >
          <Logo size="md" />
        </div>
      )}

      {!isLoading && route.view === 'home' && !user && (
        <div className="landing-wrapper">
          <div className="wrap">
            <Header
              user={user}
              currentTheme={theme}
              onToggleTheme={handleToggleTheme}
              onNavigateDashboard={() => navigateTo('dashboard')}
              onNavigateHome={() => navigateTo('home')}
              onNavigateSignIn={() => navigateTo('signin')}
              onSignOut={handleSignOut}
              onShowNotice={showToast}
            />
          </div>
          <LandingView
            onNavigateDashboard={() => navigateTo('dashboard')}
            onEnterRoom={handleEnterRoom}
            onToast={showToast}
          />
        </div>
      )}

      {!isLoading && (route.view === 'signin' || route.view === 'signup') && (
        <AuthView
          initialMode={route.view}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onNavigateHome={() => navigateTo('home')}
          onNavigateDashboard={() => navigateTo('dashboard')}
          onToast={showToast}
        />
      )}

      {!isLoading && route.view === 'dashboard' && user && (
        <DashboardView
          user={user}
          {...(route.dashTab ? { initialTab: route.dashTab } : {})}
          {...(route.profileUserId !== undefined
            ? { viewedProfileUserId: route.profileUserId }
            : {})}
          onSignOut={handleSignOut}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onEnterRoom={handleEnterRoom}
          onToast={showToast}
        />
      )}

      {route.view === 'room' && route.roomCode && (
        <MeetingRoomView
          roomCode={route.roomCode}
          user={user}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onLeaveCall={handleLeaveCall}
          onNavigateHome={() => navigateTo('home')}
          onToast={showToast}
        />
      )}

      {route.view === 'webinar-register' && route.roomCode && (
        <WebinarRegistrationView
          roomCode={route.roomCode}
          onRegistered={(_token) => {
            showToast('Registration confirmed! Unique join link generated.');
          }}
          onJoinDirectly={(token) => {
            window.location.href = `/m/${route.roomCode}?webinarToken=${encodeURIComponent(token)}`;
          }}
        />
      )}

      {route.view === 'booking' && route.roomCode && (
        <BookingPageView
          handle={route.roomCode}
          onEnterRoom={handleEnterRoom}
          onNavigateHome={() => navigateTo('home')}
          onToast={showToast}
        />
      )}

      {route.view === 'ended' && (
        <EndedView
          lastRoomCode={lastRoomCode}
          isAuthenticated={Boolean(user)}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onRejoin={(code) => handleEnterRoom(code)}
          onNavigateHome={() => navigateTo('home')}
          onNavigateDashboard={() => navigateTo('dashboard')}
        />
      )}

      {route.view === 'status' && (
        <StatusPageView
          onBackToApp={() => navigateTo(user ? 'dashboard' : 'home')}
        />
      )}

      {route.view === '404' && (
        <NotFoundView
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onNavigateHome={() => navigateTo('home')}
        />
      )}

      <Toast message={toastMessage} />
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
