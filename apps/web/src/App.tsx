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
import { normalizeRoomCode, type ViewMode } from './types';

interface ParsedRoute {
  view: ViewMode;
  roomCode: string | null;
}

function parseLocationRoute(pathname: string, hash: string): ParsedRoute {
  const cleanHash = hash.replace(/^#\/?/, '').trim().toLowerCase();
  const cleanPath = pathname
    .replace(/^\/+|\/+$/g, '')
    .trim()
    .toLowerCase();

  // Check hash first if present, otherwise pathname
  const target = cleanHash || cleanPath;

  if (!target || target === 'home') {
    return { view: 'home', roomCode: null };
  }
  if (target === 'dashboard') {
    return { view: 'dashboard', roomCode: null };
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
    (nextView: ViewMode, roomCode?: string | null) => {
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

      window.history.pushState({}, '', nextUrl);
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

  // Protected route enforcement for Dashboard
  useEffect(() => {
    if (isLoading) return;

    if (route.view === 'dashboard' && !user) {
      showToast('Please sign in to access your dashboard.');
      navigateTo('signin');
    } else if ((route.view === 'signin' || route.view === 'signup') && user) {
      navigateTo('dashboard');
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
    await signOut();
    showToast('Signed out successfully.');
    navigateTo('home');
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
      {route.view === 'home' && (
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

      {(route.view === 'signin' || route.view === 'signup') && (
        <AuthView
          initialMode={route.view}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onNavigateHome={() => navigateTo('home')}
          onNavigateDashboard={() => navigateTo('dashboard')}
          onToast={showToast}
        />
      )}

      {route.view === 'dashboard' && (
        <DashboardView
          user={user}
          onSignOut={handleSignOut}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onNavigateHome={() => navigateTo('home')}
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
