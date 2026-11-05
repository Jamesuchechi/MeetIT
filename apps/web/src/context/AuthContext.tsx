import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isSupabaseActive: boolean;
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error?: string }>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ error?: string; confirmationSent?: boolean }>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
}

const STORAGE_KEY = 'meetit_auth_user';

export const DEMO_USER: AuthUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'ada@brightline.design',
  displayName: 'Ada Okafor',
  isPro: true,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session from Supabase or localStorage
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (isSupabaseConfigured && supabase) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              displayName:
                session.user.user_metadata?.display_name ||
                session.user.email?.split('@')[0] ||
                'User',
              avatarUrl: session.user.user_metadata?.avatar_url,
              isPro: true,
            });
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('[MeetIT Auth] Supabase session check error:', err);
        }

        // Listen for auth changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!mounted) return;
          if (session?.user) {
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              displayName:
                session.user.user_metadata?.display_name ||
                session.user.email?.split('@')[0] ||
                'User',
              avatarUrl: session.user.user_metadata?.avatar_url,
              isPro: true,
            });
          } else {
            setUser(null);
          }
          setIsLoading(false);
        });

        return () => {
          subscription.unsubscribe();
        };
      }

      // Fallback: check localStorage for saved session
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && mounted) {
          const parsed = JSON.parse(stored) as AuthUser;
          setUser(parsed);
        }
      } catch {
        // ignore parse errors
      }

      if (mounted) {
        setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!email || !password) {
        return { error: 'Please enter both email and password.' };
      }

      if (isSupabaseConfigured && supabase) {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) return { error: error.message };
          return {};
        } catch (err) {
          return { error: (err as Error).message || 'Failed to sign in.' };
        }
      }

      // Demo / offline mode
      const mockUser: AuthUser = {
        id: `usr_${Date.now()}`,
        email,
        displayName: email.split('@')[0] || 'User',
        isPro: true,
      };
      setUser(mockUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
      return {};
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!email || !password) {
        return { error: 'Please enter both email and password.' };
      }
      if (password.length < 6) {
        return { error: 'Password must be at least 6 characters.' };
      }

      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName || email.split('@')[0] },
            },
          });
          if (error) return { error: error.message };
          if (data.session === null) {
            return { confirmationSent: true };
          }
          return {};
        } catch (err) {
          return { error: (err as Error).message || 'Failed to sign up.' };
        }
      }

      // Demo / offline mode
      const mockUser: AuthUser = {
        id: `usr_${Date.now()}`,
        email,
        displayName: displayName.trim() || email.split('@')[0] || 'User',
        isPro: true,
      };
      setUser(mockUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
      return {};
    },
    [],
  );

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!email) {
      return { error: 'Please enter an email address.' };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) return { error: error.message };
        return {};
      } catch (err) {
        return {
          error: (err as Error).message || 'Failed to send magic link.',
        };
      }
    }

    // Demo / offline mode: instantly sign in with link simulation
    const mockUser: AuthUser = {
      id: `usr_${Date.now()}`,
      email,
      displayName: email.split('@')[0] || 'User',
      isPro: true,
    };
    setUser(mockUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
    return {};
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) return { error: error.message };
        return {};
      } catch (err) {
        return {
          error: (err as Error).message || 'Failed to sign in with Google.',
        };
      }
    }

    // Demo / offline mode
    setUser(DEMO_USER);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_USER));
    return {};
  }, []);

  const signInDemo = useCallback(() => {
    setUser(DEMO_USER);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_USER));
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSupabaseActive: isSupabaseConfigured,
        signInWithEmail,
        signUpWithEmail,
        signInWithMagicLink,
        signInWithGoogle,
        signInDemo,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
