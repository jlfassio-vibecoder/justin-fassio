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

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) void loadProfile(data.session.user.id);
      else setProfile(null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) void loadProfile(next.user.id);
      else setProfile(null);
      setLoading(false);
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
