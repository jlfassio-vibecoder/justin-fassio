import { useEffect } from 'react';
import { RepCommandCenter } from '@/components/RepCommandCenter';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

export function AuthGate() {
  const { loading, session, user, profile, configured } = useAuth();

  useEffect(() => {
    if (!loading && configured && !session) {
      window.location.replace('/login');
    }
  }, [loading, configured, session]);

  if (!configured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="m-0 text-2xl">App unavailable</h1>
        <p className="m-0 text-sm text-ink/70">
          Supabase env vars are missing, so sign-in cannot run in this environment.
        </p>
        <a href="/" className="font-heading text-accent-700 no-underline">
          Back to home
        </a>
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-sm text-ink/60">
        {loading ? 'Checking session…' : 'Redirecting to sign in…'}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-3 border-b border-ink/10 bg-surface/60 px-7 py-2 text-xs text-ink/70">
        <span className="truncate">{user?.email}</span>
        {profile?.role && (
          <span className="rounded-full bg-bg px-2.5 py-0.5 font-semibold capitalize">
            {profile.role}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          className="text-xs"
          onClick={() => {
            void supabase.auth.signOut().then(() => {
              window.location.href = '/';
            });
          }}
        >
          Sign out
        </Button>
      </div>
      <RepCommandCenter />
    </div>
  );
}
