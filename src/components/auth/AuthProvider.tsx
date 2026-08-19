import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from '@/components/auth/auth-context';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { syncProfileEmailWithAuthUser } from '@/lib/staffAccount';
import type { Profile } from '@/types/database';

const PROFILE_FETCH_RETRY_MS = 250;

/** Browser/chrome transport failures (ERR_NETWORK_CHANGED → Failed to fetch). */
export function isTransientAuthFetchError(error: { message?: string } | null | undefined): boolean {
  const message = (error?.message ?? '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network changed') ||
    message.includes('network_changed') ||
    message.includes('load failed')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(() => isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const reloadProfileRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    async function fetchProfileRow(userId: string) {
      return supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    }

    async function loadProfile(userId: string, authEmail: string | null | undefined) {
      let { data, error } = await fetchProfileRow(userId);
      if (error && isTransientAuthFetchError(error)) {
        await delay(PROFILE_FETCH_RETRY_MS);
        if (!active) return;
        ({ data, error } = await fetchProfileRow(userId));
      }
      if (!active) return;
      if (error && isTransientAuthFetchError(error) && profileRef.current) {
        return;
      }
      if (error || !data) {
        profileRef.current = null;
        setProfile(null);
        return;
      }

      const synced = await syncProfileEmailWithAuthUser(supabase, {
        userId,
        authEmail,
        profileEmail: data.email,
      });
      if (!active) return;
      const next =
        synced.ok && synced.email !== data.email ? { ...data, email: synced.email } : data;
      profileRef.current = next;
      setProfile(next);
    }

    async function syncSession(next: Session | null) {
      if (active) setLoading(true);
      setSession(next);
      if (next?.user) await loadProfile(next.user.id, next.user.email);
      else {
        profileRef.current = null;
        setProfile(null);
      }
      if (active) setLoading(false);
    }

    reloadProfileRef.current = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;
      await loadProfile(user.id, user.email);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void syncSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      // Avoid pending-screen flash / loading flicker on token refresh.
      if (event === 'TOKEN_REFRESHED') {
        setSession(next);
        return;
      }
      void syncSession(next);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const reloadProfile = useCallback(() => reloadProfileRef.current(), []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        profile,
        configured: isSupabaseConfigured,
        reloadProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
