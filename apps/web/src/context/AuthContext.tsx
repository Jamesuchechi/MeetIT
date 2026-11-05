import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type { User } from '@supabase/supabase-js';
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
  signOut: () => Promise<void>;
  updateProfile: (changes: {
    displayName?: string;
    headline?: string;
    bio?: string;
    organization?: string;
    location?: string;
    timezone?: string;
    avatarFile?: File | null;
    removeAvatar?: boolean;
  }) => Promise<{ error?: string }>;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

const NOT_CONFIGURED_ERROR =
  'Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';

const AuthContext = createContext<AuthContextValue | null>(null);

function mapSupabaseUser(u: User): AuthUser {
  const meta = u.user_metadata as
    | {
        display_name?: string;
        full_name?: string;
        avatar_url?: string;
        headline?: string;
        bio?: string;
        organization?: string;
        location?: string;
        timezone?: string;
      }
    | undefined;
  return {
    id: u.id,
    email: u.email ?? '',
    displayName:
      meta?.display_name || meta?.full_name || u.email?.split('@')[0] || 'User',
    ...(meta?.avatar_url ? { avatarUrl: meta.avatar_url } : {}),
    ...(meta?.headline ? { headline: meta.headline } : {}),
    ...(meta?.bio ? { bio: meta.bio } : {}),
    ...(meta?.organization ? { organization: meta.organization } : {}),
    ...(meta?.location ? { location: meta.location } : {}),
    ...(meta?.timezone ? { timezone: meta.timezone } : {}),
    ...(u.created_at ? { createdAt: u.created_at } : {}),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore the persisted Supabase session and keep it in sync afterwards.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    const client = supabase;

    void client.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setUser(session?.user ? mapSupabaseUser(session.user) : null);
      })
      .catch((err: unknown) => {
        console.warn('[MeetIT Auth] session restore failed:', err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!email || !password) {
        return { error: 'Please enter both email and password.' };
      }
      if (!isSupabaseConfigured || !supabase) {
        return { error: NOT_CONFIGURED_ERROR };
      }
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return error ? { error: error.message } : {};
      } catch (err) {
        return { error: (err as Error).message || 'Failed to sign in.' };
      }
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
      if (!isSupabaseConfigured || !supabase) {
        return { error: NOT_CONFIGURED_ERROR };
      }
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0] },
            emailRedirectTo: window.location.origin,
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
    },
    [],
  );

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!email) {
      return { error: 'Please enter an email address.' };
    }
    if (!isSupabaseConfigured || !supabase) {
      return { error: NOT_CONFIGURED_ERROR };
    }
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      return error ? { error: error.message } : {};
    } catch (err) {
      return {
        error: (err as Error).message || 'Failed to send magic link.',
      };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      return { error: NOT_CONFIGURED_ERROR };
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      return error ? { error: error.message } : {};
    } catch (err) {
      return {
        error: (err as Error).message || 'Failed to sign in with Google.',
      };
    }
  }, []);

  const updateProfile = useCallback(
    async (changes: {
      displayName?: string;
      headline?: string;
      bio?: string;
      organization?: string;
      location?: string;
      timezone?: string;
      avatarFile?: File | null;
      removeAvatar?: boolean;
    }) => {
      if (!isSupabaseConfigured || !supabase) {
        return { error: NOT_CONFIGURED_ERROR };
      }
      if (!user) {
        return { error: 'You must be signed in to update your profile.' };
      }

      const metadata: Record<string, string | null> = {};
      let nextName = user.displayName;
      let nextAvatar: string | null = user.avatarUrl ?? null;

      if (changes.displayName !== undefined) {
        const trimmed = changes.displayName.trim();
        if (trimmed.length < 1 || trimmed.length > 80) {
          return { error: 'Display name must be 1 to 80 characters.' };
        }
        metadata.display_name = trimmed;
        nextName = trimmed;
      }

      if (changes.headline !== undefined) {
        metadata.headline = changes.headline.trim().slice(0, 120);
      }
      if (changes.bio !== undefined) {
        metadata.bio = changes.bio.trim().slice(0, 600);
      }
      if (changes.organization !== undefined) {
        metadata.organization = changes.organization.trim().slice(0, 100);
      }
      if (changes.location !== undefined) {
        metadata.location = changes.location.trim().slice(0, 100);
      }
      if (changes.timezone !== undefined) {
        metadata.timezone = changes.timezone.trim().slice(0, 80);
      }

      try {
        if (changes.avatarFile) {
          const file = changes.avatarFile;
          if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
            return { error: 'Avatar must be a PNG, JPEG, WebP or GIF image.' };
          }
          if (file.size > MAX_AVATAR_BYTES) {
            return { error: 'Avatar must be 2 MB or smaller.' };
          }
          const ext = file.type.split('/')[1] ?? 'png';
          const path = `${user.id}/avatar-${Date.now()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(path, file, { contentType: file.type, upsert: true });
          if (uploadError) {
            return { error: `Avatar upload failed: ${uploadError.message}` };
          }
          const { data } = supabase.storage.from('avatars').getPublicUrl(path);
          nextAvatar = data.publicUrl;
          metadata.avatar_url = nextAvatar;
        } else if (changes.removeAvatar) {
          nextAvatar = null;
          metadata.avatar_url = null;
        }

        if (Object.keys(metadata).length === 0) {
          return {};
        }

        const { data: updated, error: authError } =
          await supabase.auth.updateUser({ data: metadata });
        if (authError) return { error: authError.message };

        const { error: profileError } = await supabase.from('profiles').upsert({
          id: user.id,
          display_name: nextName,
          avatar_url: nextAvatar,
        });
        if (profileError) {
          console.warn('[MeetIT Auth] profiles upsert failed:', profileError);
        }

        if (updated.user) {
          setUser(mapSupabaseUser(updated.user));
        }
        return {};
      } catch (err) {
        return { error: (err as Error).message || 'Failed to update profile.' };
      }
    },
    [user],
  );

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore network errors; local session is cleared by supabase-js
      }
    }
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
        signOut,
        updateProfile,
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
