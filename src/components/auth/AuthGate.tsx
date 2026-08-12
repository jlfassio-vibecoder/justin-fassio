import { useEffect, useState } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { OwnerPendingPanel } from '@/components/auth/OwnerPendingPanel';
import { OwnerWholesaleBuyersPanel } from '@/components/auth/OwnerWholesaleBuyersPanel';
import { PendingApprovalScreen } from '@/components/auth/PendingApprovalScreen';
import { WrongPortalScreen } from '@/components/auth/WrongPortalScreen';
import { StaffAccountPage } from '@/components/staff/StaffAccountPage';
import { RepCommandCenter } from '@/components/RepCommandCenter';
import { AIAssistantModal } from '@/components/ui/AIAssistantModal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { AiAssistProvider } from '@/lib/AiAssistProvider';
import { supabase } from '@/lib/supabase';
import { isApprovedOwner, isApprovedStaff } from '@/lib/auth';
import { pingAuthorizedServer } from '@/lib/serverPing';
import { createStaffAvatarSignedUrl, staffAccountInitials } from '@/lib/staffAccount';
import type { TabKey } from '@/types';

export type AuthGatePage = 'app' | 'account';

const TAB_KEYS: TabKey[] = [
  'catalog',
  'dashboard',
  'calls',
  'prospects',
  'accounts',
  'contacts',
  'insights',
  'messages',
  'calendar',
];

function tabFromSearch(): TabKey | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('tab');
  return TAB_KEYS.find((key) => key === raw);
}

function StaffToolbarAvatar({
  avatarPath,
  displayName,
  emails,
}: {
  avatarPath: string | null | undefined;
  displayName: string | null | undefined;
  emails: Array<string | null | undefined>;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void createStaffAvatarSignedUrl(avatarPath).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [avatarPath]);

  const initials = staffAccountInitials(displayName, emails);
  return (
    <span className="bg-accent font-heading text-bg flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full text-[10px]">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

function AuthGateInner({ page }: { page: AuthGatePage }) {
  const { loading, session, user, profile, configured } = useAuth();
  const [pingBusy, setPingBusy] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [defaultTab] = useState<TabKey | undefined>(() => tabFromSearch());

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
    <AiAssistProvider>
      <div>
        <div className="border-ink/10 bg-surface/60 text-ink/70 flex flex-wrap items-center justify-end gap-3 border-b px-7 py-2 text-xs">
          {page === 'account' ? (
            <a href="/app" className="text-ink/80 hover:text-ink no-underline">
              Command Center
            </a>
          ) : null}
          <a
            href="/app/account"
            className="text-ink/80 hover:text-ink inline-flex items-center gap-1.5 no-underline"
          >
            <StaffToolbarAvatar
              avatarPath={profile?.avatar_path}
              displayName={profile?.display_name}
              emails={[user?.email, profile?.email]}
            />
            <span>Account</span>
          </a>
          <span className="truncate">{user?.email}</span>
          {profile?.role && (
            <span className="bg-bg rounded-full px-2.5 py-0.5 font-semibold capitalize">
              {profile.role}
            </span>
          )}
          {isApprovedStaff(profile) ? <OwnerWholesaleBuyersPanel /> : null}
          {isApprovedOwner(profile) ? <OwnerPendingPanel /> : null}
          <AIAssistantModal />
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
        {page === 'account' ? <StaffAccountPage /> : <RepCommandCenter defaultTab={defaultTab} />}
      </div>
    </AiAssistProvider>
  );
}

/** Root island for `/app` — owns AuthProvider so nested islands are not required. */
export function AuthGate({ page = 'app' }: { page?: AuthGatePage }) {
  return (
    <AuthProvider>
      <AuthGateInner page={page} />
    </AuthProvider>
  );
}
