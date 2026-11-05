import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { LandingView } from './components/LandingView';
import { DashboardView } from './components/DashboardView';
import { AuthView } from './components/AuthView';
import { Toast } from './components/Toast';
import type { ViewMode } from './types';

function parseHashView(hash: string): ViewMode {
  const clean = hash.replace(/^#/, '').toLowerCase();
  if (clean === 'dashboard') return 'dashboard';
  if (clean === 'signin' || clean === 'login' || clean === 'auth')
    return 'signin';
  if (clean === 'signup' || clean === 'register') return 'signup';
  return 'home';
}

function AppContent() {
  const { user, isLoading, signOut } = useAuth();
  const [view, setView] = useState<ViewMode>(() =>
    parseHashView(window.location.hash),
  );
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

  const navigateTo = useCallback((nextView: ViewMode) => {
    window.location.hash = `#${nextView}`;
    setView(nextView);
    window.scrollTo(0, 0);
  }, []);

  // Hash change synchronization
  useEffect(() => {
    function handleHashChange() {
      const nextView = parseHashView(window.location.hash);
      setView(nextView);
      window.scrollTo(0, 0);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Protected route enforcement for Dashboard
  useEffect(() => {
    if (isLoading) return;

    if (view === 'dashboard' && !user) {
      // User is not logged in: protect route and redirect to signin
      showToast('Please sign in to access your dashboard.');
      navigateTo('signin');
    } else if ((view === 'signin' || view === 'signup') && user) {
      // User is already logged in: redirect to dashboard
      navigateTo('dashboard');
    }
  }, [view, user, isLoading, navigateTo, showToast]);

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

  return (
    <>
      {view === 'home' && (
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
            onToast={showToast}
          />
        </div>
      )}

      {(view === 'signin' || view === 'signup') && (
        <AuthView
          initialMode={view}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onNavigateHome={() => navigateTo('home')}
          onNavigateDashboard={() => navigateTo('dashboard')}
          onToast={showToast}
        />
      )}

      {view === 'dashboard' && (
        <DashboardView
          user={user}
          onSignOut={handleSignOut}
          currentTheme={theme}
          onToggleTheme={handleToggleTheme}
          onNavigateHome={() => navigateTo('home')}
          onToast={showToast}
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
