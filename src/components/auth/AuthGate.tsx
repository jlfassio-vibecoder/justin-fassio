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
import { LineProvider } from '@/lib/lineContext';
import { persistLastLineSlug, readLastLineSlug } from '@/lib/lineContextStorage';
import { isRepresentedLineCode } from '@/lib/lines';
import { pingAuthorizedServer } from '@/lib/serverPing';
import { createStaffAvatarSignedUrl, staffAccountInitials } from '@/lib/staffAccount';
import type { StaffFeatureFlags } from '@/lib/staffFeatures';
import type { TabKey } from '@/types';

export type AuthGatePage = 'app' | 'account';

const TAB_KEYS: TabKey[] = [
  'briefing',
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

async function fetchStaffFeatures(): Promise<StaffFeatureFlags> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      return { FEATURE_MULTI_LINE_UI: false, FEATURE_MULTI_LINE_WRITES: false };
    }
    const res = await fetch('/api/staff/features', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { FEATURE_MULTI_LINE_UI: false, FEATURE_MULTI_LINE_WRITES: false };
    const payload = (await res.json()) as { features?: StaffFeatureFlags };
    return {
      FEATURE_MULTI_LINE_UI: Boolean(payload.features?.FEATURE_MULTI_LINE_UI),
      FEATURE_MULTI_LINE_WRITES: Boolean(payload.features?.FEATURE_MULTI_LINE_WRITES),
    };
  } catch {
    return { FEATURE_MULTI_LINE_UI: false, FEATURE_MULTI_LINE_WRITES: false };
  }
}

function AuthGateInner({
  page,
  lineSlug: lineSlugProp,
  lineAccountId,
  pathTab,
}: {
  page: AuthGatePage;
  lineSlug?: string;
  lineAccountId?: string;
  pathTab?: TabKey;
}) {
  const { loading, session, user, profile, configured } = useAuth();
  const [pingBusy, setPingBusy] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [defaultTab] = useState<TabKey | undefined>(() => pathTab ?? tabFromSearch());
  const [features, setFeatures] = useState<StaffFeatureFlags | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(page === 'app' || page === 'account');

  useEffect(() => {
    if (!loading && configured && !session) {
      window.location.replace('/rep-login');
    }
  }, [loading, configured, session]);

  useEffect(() => {
    if ((page !== 'app' && page !== 'account') || !session || !isApprovedStaff(profile)) {
      return;
    }
    let active = true;
    void fetchStaffFeatures().then((flags) => {
      if (!active) return;
      setFeatures(flags);
      setFeaturesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [page, session, profile]);

  const multiLineUi = Boolean(features?.FEATURE_MULTI_LINE_UI);
  const multiLineWrites = Boolean(features?.FEATURE_MULTI_LINE_WRITES);
  const urlLineSlug = lineSlugProp?.trim().toLowerCase() || null;
  const unknownLine = Boolean(urlLineSlug && !isRepresentedLineCode(urlLineSlug));

  const staffAppOrAccount =
    (page === 'app' || page === 'account') && Boolean(session) && isApprovedStaff(profile);
  const effectiveFeaturesLoading = staffAppOrAccount ? featuresLoading : false;
  const effectiveMultiLineUi = staffAppOrAccount ? multiLineUi : false;
  const effectiveMultiLineWrites = staffAppOrAccount ? multiLineWrites : false;

  // Flag off + line-prefixed URL → redirect to /app preserving ?tab=
  useEffect(() => {
    if (page !== 'app' || effectiveFeaturesLoading || features == null) return;
    if (features.FEATURE_MULTI_LINE_UI) return;
    if (!urlLineSlug && !lineAccountId) return;
    const params = new URLSearchParams(window.location.search);
    if (pathTab && !params.get('tab')) params.set('tab', pathTab);
    const qs = params.toString();
    window.location.replace(qs ? `/app?${qs}` : '/app');
  }, [page, effectiveFeaturesLoading, features, urlLineSlug, lineAccountId, pathTab]);

  // Flag on + bare /app → canonical /app/lines/:slug with query preserved
  useEffect(() => {
    if (page !== 'app' || effectiveFeaturesLoading || features == null) return;
    if (!features.FEATURE_MULTI_LINE_UI) return;
    if (urlLineSlug) return;
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (path === '/app/lines' || path === '/app/lines/') return;
    if (path !== '/app' && path !== '/app/') return;

    const slug = readLastLineSlug() ?? 'ogr';
    persistLastLineSlug(slug);
    const qs = window.location.search || '';
    window.location.replace(`/app/lines/${slug}${qs}`);
  }, [page, effectiveFeaturesLoading, features, urlLineSlug]);

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

  if (featuresLoading && (page === 'app' || page === 'account') && isApprovedStaff(profile)) {
    return (
      <div className="text-ink/60 flex min-h-dvh items-center justify-center px-6 text-sm">
        Checking session…
      </div>
    );
  }

  if (page === 'app' && effectiveMultiLineUi && unknownLine) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="m-0 text-2xl">Unknown line</h1>
        <p className="text-ink/70 m-0 text-sm">
          <code className="text-ink">{urlLineSlug}</code> is not a represented sales line.
        </p>
        <a href="/app/lines" className="font-heading text-accent-700 no-underline">
          Back to lines
        </a>
      </div>
    );
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

  const appShell = (
    <LineProvider
      multiLineUi={effectiveMultiLineUi}
      multiLineWrites={effectiveMultiLineWrites}
      urlLineSlug={urlLineSlug}
    >
      {page === 'account' ? (
        <StaffAccountPage />
      ) : (
        <RepCommandCenter
          defaultTab={defaultTab}
          multiLineUi={effectiveMultiLineUi}
          lineAccountId={lineAccountId}
        />
      )}
    </LineProvider>
  );

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
        {appShell}
      </div>
    </AiAssistProvider>
  );
}

/** Root island for `/app` — owns AuthProvider so nested islands are not required. */
export function AuthGate({
  page = 'app',
  lineSlug,
  lineAccountId,
  pathTab,
}: {
  page?: AuthGatePage;
  lineSlug?: string;
  lineAccountId?: string;
  pathTab?: TabKey;
}) {
  return (
    <AuthProvider>
      <AuthGateInner
        page={page}
        lineSlug={lineSlug}
        lineAccountId={lineAccountId}
        pathTab={pathTab}
      />
    </AuthProvider>
  );
}
