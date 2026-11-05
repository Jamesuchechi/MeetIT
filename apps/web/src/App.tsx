import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { LandingView } from './components/LandingView';
import { DashboardView } from './components/DashboardView';
import { AuthView } from './components/AuthView';
import { MeetingRoomView } from './components/MeetingRoomView';
import { EndedView } from './components/EndedView';
import { NotFoundView } from './components/NotFoundView';
import { Toast } from './components/Toast';
import { Logo } from './components/Logo';
import { normalizeRoomCode, type ViewMode, type DashboardTab } from './types';

interface ParsedRoute {
  view: ViewMode;
  roomCode: string | null;
  dashTab?: DashboardTab;
  profileUserId?: string | null;
}

function parseLocationRoute(pathname: string, hash: string): ParsedRoute {
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
  const target = cleanHash || cleanPath;

  if (!target || target === 'home') {
    return { view: 'home', roomCode: null };
  }
  if (target === 'dashboard') {
    return { view: 'dashboard', roomCode: null, dashTab: 'home' };
  }
  if (target === 'settings' || target === 'dashboard/settings') {
    return { view: 'dashboard', roomCode: null, dashTab: 'settings' };
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
  if (target === '404') {
    return { view: '404', roomCode: null };
  }

  if (target.startsWith('m/')) {
    const rawCode = target.slice(2);
    const normalized = normalizeRoomCode(rawCode);
    if (normalized) {
      return { view: 'room', roomCode: normalized };
    }
    return { view: '404', roomCode: null };
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

  // Sync with browser popstate and hashchange
  useEffect(() => {
    function syncLocation() {
      const next = parseLocationRoute(
        window.location.pathname,
        window.location.hash,
      );
      if (next.roomCode) {
        setLastRoomCode(next.roomCode);
      }
      setRoute(next);
      window.scrollTo(0, 0);
    }

    window.addEventListener('popstate', syncLocation);
    window.addEventListener('hashchange', syncLocation);
    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener('hashchange', syncLocation);
    };
  }, []);

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
