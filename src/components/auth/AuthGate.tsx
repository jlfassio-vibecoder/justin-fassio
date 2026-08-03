import { useEffect, useState } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { OwnerPendingPanel } from '@/components/auth/OwnerPendingPanel';
import { PendingApprovalScreen } from '@/components/auth/PendingApprovalScreen';
import { WrongPortalScreen } from '@/components/auth/WrongPortalScreen';
import { RepCommandCenter } from '@/components/RepCommandCenter';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { isApprovedOwner, isApprovedStaff } from '@/lib/auth';
import { pingAuthorizedServer } from '@/lib/serverPing';

function AuthGateInner() {
  const { loading, session, user, profile, configured } = useAuth();
  const [pingBusy, setPingBusy] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && configured && !session) {
      window.location.replace('/rep-login');
    }
  }, [loading, configured, session]);

  if (!configured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="m-0 text-2xl">App unavailable</h1>
        <p className="text-ink/70 m-0 text-sm">
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
      <div className="text-ink/60 flex min-h-dvh items-center justify-center px-6 text-sm">
        {loading ? 'Checking session…' : 'Redirecting to sign in…'}
      </div>
    );
  }

  if (profile?.role === 'buyer') {
    return <WrongPortalScreen email={user?.email} />;
  }

  if (profile?.status === 'rejected') {
    return <PendingApprovalScreen email={user?.email} variant="rejected" />;
  }

  if (!isApprovedStaff(profile)) {
    return <PendingApprovalScreen email={user?.email} variant="pending" />;
  }

  async function handlePingServer() {
    setPingBusy(true);
    setPingStatus(null);
    const result = await pingAuthorizedServer();
    setPingBusy(false);
    if (result.ok) {
      setPingStatus('Server: ok');
      return;
    }
    const detail = result.error ? ` ${result.error}` : '';
    setPingStatus(
      result.status > 0 ? `Server: ${result.status}${detail}` : `Server: error${detail}`,
    );
  }

  return (
    <div>
      <div className="border-ink/10 bg-surface/60 text-ink/70 flex flex-wrap items-center justify-end gap-3 border-b px-7 py-2 text-xs">
        <span className="truncate">{user?.email}</span>
        {profile?.role && (
          <span className="bg-bg rounded-full px-2.5 py-0.5 font-semibold capitalize">
            {profile.role}
          </span>
        )}
        {isApprovedOwner(profile) ? <OwnerPendingPanel /> : null}
        {pingStatus && <span className="text-ink/60">{pingStatus}</span>}
        <Button
          type="button"
          variant="ghost"
          className="text-xs"
          disabled={pingBusy}
          onClick={() => {
            void handlePingServer();
          }}
        >
          {pingBusy ? 'Pinging…' : 'Ping server'}
        </Button>
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

/** Root island for `/app` — owns AuthProvider so nested islands are not required. */
export function AuthGate() {
  return (
    <AuthProvider>
      <AuthGateInner />
    </AuthProvider>
  );
}
