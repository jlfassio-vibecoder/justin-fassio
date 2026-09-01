import { useEffect, useState, type ReactNode } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { OwnerPendingPanel } from '@/components/auth/OwnerPendingPanel';
import { OwnerWholesaleBuyersPanel } from '@/components/auth/OwnerWholesaleBuyersPanel';
import { PendingApprovalScreen } from '@/components/auth/PendingApprovalScreen';
import { WrongPortalScreen } from '@/components/auth/WrongPortalScreen';
import { StaffAccountPage } from '@/components/staff/StaffAccountPage';
import { OpsTerritoryReviewWorkspace } from '@/components/opsTerritoryReview/OpsTerritoryReviewWorkspace';
import { OpsTerritoryReviewNavLink } from '@/components/opsTerritoryReview/OpsTerritoryReviewNavLink';
import { ProspectiveLinesWorkspace } from '@/components/ProspectiveLinesWorkspace';
import { RepCommandCenter } from '@/components/RepCommandCenter';
import { AIAssistantModal } from '@/components/ui/AIAssistantModal';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { AiAssistProvider } from '@/lib/AiAssistProvider';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { isApprovedOwner, isApprovedStaff } from '@/lib/auth';
import { LineProvider, useLineContext } from '@/lib/lineContext';
import { persistLastLineSlug, readLastLineSlug } from '@/lib/lineContextStorage';
import { pingAuthorizedServer } from '@/lib/serverPing';
import { createStaffAvatarSignedUrl, staffAccountInitials } from '@/lib/staffAccount';
import type { StaffIslandFeatureFlags } from '@/lib/staffFeatures';
import type { TabKey } from '@/types';

export type AuthGatePage = 'app' | 'account' | 'prospective' | 'opsTerritoryReview';

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
  'territories',
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
    <span className="bg-accent font-heading text-on-accent flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full text-[10px]">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

const STAFF_FEATURES_OFF: StaffIslandFeatureFlags = {
  FEATURE_MULTI_LINE_UI: false,
  FEATURE_MULTI_LINE_WRITES: false,
  FEATURE_MULTI_LINE_AI: false,
  FEATURE_LINE_TERRITORY_ADMIN: false,
  FEATURE_EAGLE_PEAK_SELLING: false,
  FEATURE_EAGLE_PEAK_OUTREACH: false,
  FEATURE_BIG_FISH_SELLING: false,
  FEATURE_BIG_FISH_OUTREACH: false,
  FEATURE_LIVING_IN_SUNSHINE_SELLING: false,
  FEATURE_PROSPECTIVE_LINES: false,
};

async function fetchStaffFeatures(): Promise<StaffIslandFeatureFlags> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      return STAFF_FEATURES_OFF;
    }
    const res = await fetch('/api/staff/features', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return STAFF_FEATURES_OFF;
    const payload = (await res.json()) as { features?: StaffIslandFeatureFlags };
    return {
      FEATURE_MULTI_LINE_UI: Boolean(payload.features?.FEATURE_MULTI_LINE_UI),
      FEATURE_MULTI_LINE_WRITES: Boolean(payload.features?.FEATURE_MULTI_LINE_WRITES),
      FEATURE_MULTI_LINE_AI: Boolean(payload.features?.FEATURE_MULTI_LINE_AI),
      FEATURE_LINE_TERRITORY_ADMIN: Boolean(payload.features?.FEATURE_LINE_TERRITORY_ADMIN),
      FEATURE_EAGLE_PEAK_SELLING: Boolean(payload.features?.FEATURE_EAGLE_PEAK_SELLING),
      FEATURE_EAGLE_PEAK_OUTREACH: Boolean(payload.features?.FEATURE_EAGLE_PEAK_OUTREACH),
      FEATURE_BIG_FISH_SELLING: Boolean(payload.features?.FEATURE_BIG_FISH_SELLING),
      FEATURE_BIG_FISH_OUTREACH: Boolean(payload.features?.FEATURE_BIG_FISH_OUTREACH),
      FEATURE_LIVING_IN_SUNSHINE_SELLING: Boolean(
        payload.features?.FEATURE_LIVING_IN_SUNSHINE_SELLING,
      ),
      FEATURE_PROSPECTIVE_LINES: Boolean(payload.features?.FEATURE_PROSPECTIVE_LINES),
    };
  } catch {
    return STAFF_FEATURES_OFF;
  }
}

function LineUnknownGate({
  requestedSlug,
  children,
}: {
  requestedSlug: string | null;
  children: ReactNode;
}) {
  const line = useLineContext();
  if (line.multiLineUi && line.loading) {
    return (
      <div className="text-ink/60 flex min-h-dvh items-center justify-center px-6 text-sm">
        Checking session…
      </div>
    );
  }
  if (line.unknownLine) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="m-0 text-2xl">Unknown line</h1>
        <p className="text-ink/70 m-0 text-sm">
          <code className="text-ink">{requestedSlug}</code> is not a represented sales line.
        </p>
        <a href="/app/lines" className="font-heading text-accent-700 no-underline">
          Back to lines
        </a>
      </div>
    );
  }
  return children;
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
  const [opsReviewReloadToken, setOpsReviewReloadToken] = useState(0);
  const [defaultTab] = useState<TabKey | undefined>(() => pathTab ?? tabFromSearch());
  const [features, setFeatures] = useState<StaffIslandFeatureFlags | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(
    page === 'app' || page === 'account' || page === 'prospective',
  );

  useEffect(() => {
    if (!loading && configured && !session) {
      window.location.replace('/rep-login');
    }
  }, [loading, configured, session]);

  useEffect(() => {
    if (
      (page !== 'app' && page !== 'account' && page !== 'prospective') ||
      !session ||
      !isApprovedStaff(profile)
    ) {
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
  const multiLineAi = Boolean(features?.FEATURE_MULTI_LINE_AI);
  const multiLineTerritoryAdmin = Boolean(features?.FEATURE_LINE_TERRITORY_ADMIN);
  const eaglePeakSelling = Boolean(features?.FEATURE_EAGLE_PEAK_SELLING);
  const eaglePeakOutreach = Boolean(features?.FEATURE_EAGLE_PEAK_OUTREACH);
  const bigFishSelling = Boolean(features?.FEATURE_BIG_FISH_SELLING);
  const bigFishOutreach = Boolean(features?.FEATURE_BIG_FISH_OUTREACH);
  const urlLineSlug = lineSlugProp?.trim().toLowerCase() || null;

  const prospectiveLines = Boolean(features?.FEATURE_PROSPECTIVE_LINES);
  const staffAppOrAccount =
    (page === 'app' || page === 'account' || page === 'prospective') &&
    Boolean(session) &&
    isApprovedStaff(profile);
  const effectiveFeaturesLoading = staffAppOrAccount ? featuresLoading : false;
  const effectiveMultiLineUi = staffAppOrAccount ? multiLineUi : false;
  const effectiveMultiLineWrites = staffAppOrAccount ? multiLineWrites : false;
  const effectiveMultiLineAi = staffAppOrAccount ? multiLineAi : false;
  const effectiveMultiLineTerritoryAdmin = staffAppOrAccount ? multiLineTerritoryAdmin : false;
  const effectiveEaglePeakSelling = staffAppOrAccount ? eaglePeakSelling : false;
  const effectiveEaglePeakOutreach = staffAppOrAccount ? eaglePeakOutreach : false;
  const effectiveBigFishSelling = staffAppOrAccount ? bigFishSelling : false;
  const effectiveBigFishOutreach = staffAppOrAccount ? bigFishOutreach : false;

  // Flag off + prospective URLs → redirect to /app
  useEffect(() => {
    if (page !== 'prospective' || effectiveFeaturesLoading || features == null) return;
    if (features.FEATURE_PROSPECTIVE_LINES) return;
    window.location.replace('/app');
  }, [page, effectiveFeaturesLoading, features]);

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

  if (
    featuresLoading &&
    (page === 'app' || page === 'account' || page === 'prospective') &&
    isApprovedStaff(profile)
  ) {
    return (
      <div className="text-ink/60 flex min-h-dvh items-center justify-center px-6 text-sm">
        Checking session…
      </div>
    );
  }

  if (page === 'prospective' && !effectiveFeaturesLoading && features != null) {
    if (!features.FEATURE_PROSPECTIVE_LINES) {
      return (
        <div className="text-ink/60 flex min-h-dvh items-center justify-center px-6 text-sm">
          Redirecting…
        </div>
      );
    }
    if (!isApprovedOwner(profile)) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
          <h1 className="m-0 text-2xl">Forbidden</h1>
          <p className="text-ink/70 m-0 text-sm">Prospective Lines is available to owners only.</p>
          <a href="/app" className="font-heading text-accent-700 no-underline">
            Back to command center
          </a>
        </div>
      );
    }
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

  const appShell =
    page === 'prospective' ? (
      <ProspectiveLinesWorkspace lineSlug={urlLineSlug} />
    ) : page === 'opsTerritoryReview' ? (
      <OpsTerritoryReviewWorkspace
        reloadToken={opsReviewReloadToken}
        onQueueChanged={() => setOpsReviewReloadToken((n) => n + 1)}
      />
    ) : (
      <LineUnknownGate requestedSlug={urlLineSlug}>
        {page === 'account' ? (
          <StaffAccountPage />
        ) : (
          <RepCommandCenter
            defaultTab={defaultTab}
            multiLineUi={effectiveMultiLineUi}
            lineAccountId={lineAccountId}
          />
        )}
      </LineUnknownGate>
    );

  return (
    <AiAssistProvider>
      <LineProvider
        multiLineUi={effectiveMultiLineUi}
        multiLineWrites={effectiveMultiLineWrites}
        multiLineAi={effectiveMultiLineAi}
        multiLineTerritoryAdmin={effectiveMultiLineTerritoryAdmin}
        eaglePeakSelling={effectiveEaglePeakSelling}
        eaglePeakOutreach={effectiveEaglePeakOutreach}
        bigFishSelling={effectiveBigFishSelling}
        bigFishOutreach={effectiveBigFishOutreach}
        urlLineSlug={urlLineSlug}
      >
        <div>
          <div className="border-ink/10 bg-surface/60 text-ink/70 flex flex-wrap items-center justify-end gap-3 border-b px-7 py-2 text-xs">
            {page === 'account' || page === 'prospective' || page === 'opsTerritoryReview' ? (
              <a href="/app" className="text-ink/80 hover:text-ink no-underline">
                Command Center
              </a>
            ) : null}
            {isApprovedStaff(profile) ? (
              <OpsTerritoryReviewNavLink reloadToken={opsReviewReloadToken} />
            ) : null}
            {isApprovedOwner(profile) && prospectiveLines ? (
              <a href="/app/prospective-lines" className="text-ink/80 hover:text-ink no-underline">
                Prospective Lines
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
            <ThemeToggle />
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
      </LineProvider>
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
    <ThemeProvider>
      <AuthProvider>
        <AuthGateInner
          page={page}
          lineSlug={lineSlug}
          lineAccountId={lineAccountId}
          pathTab={pathTab}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}
