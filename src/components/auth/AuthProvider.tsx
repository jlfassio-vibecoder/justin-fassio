import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from '@/components/auth/auth-context';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(() => isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    async function loadProfile(userId: string) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setProfile(null);
        return;
      }
      setProfile(data);
    }

    async function syncSession(next: Session | null) {
      if (active) setLoading(true);
      setSession(next);
      if (next?.user) await loadProfile(next.user.id);
      else setProfile(null);
      if (active) setLoading(false);
    }

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

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        profile,
        configured: isSupabaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
