import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from '@/components/auth/auth-context';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { syncProfileEmailWithAuthUser } from '@/lib/staffAccount';
import type { Profile } from '@/types/database';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(() => isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const reloadProfileRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    async function loadProfile(userId: string, authEmail: string | null | undefined) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setProfile(null);
        return;
      }

      const synced = await syncProfileEmailWithAuthUser(supabase, {
        userId,
        authEmail,
        profileEmail: data.email,
      });
      if (!active) return;
      setProfile(
        synced.ok && synced.email !== data.email ? { ...data, email: synced.email } : data,
      );
    }

    async function syncSession(next: Session | null) {
      if (active) setLoading(true);
      setSession(next);
      if (next?.user) await loadProfile(next.user.id, next.user.email);
      else setProfile(null);
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
