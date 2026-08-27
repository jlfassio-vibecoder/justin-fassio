import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { AccountResearchContactPickModal } from '@/components/accountResearch/AccountResearchContactPickModal';
import { ContactDiscoverPreview } from '@/components/accountResearch/ContactDiscoverPreview';
import { ManualSourceLockFields } from '@/components/accountResearch/ManualSourceLockFields';
import { manualSourceLockConfig } from '@/components/accountResearch/manualSourceLockConfig';
import type { OgrProductEmailComposerDraft } from '@/components/OgrProductEmailComposerModal';
import {
  isAccountResearchV1Scope,
  type AccountResearchV1Scope,
} from '@/lib/accountResearch/constants';
import type { SuggestionWithCitations } from '@/lib/accountResearch/suggestions';
import { isUsableFreshRun } from '@/lib/accountResearch/freshness';
import {
  applyAccountResearchSuggestion,
  createAccountProductMatchClient,
  fetchLatestAccountResearch,
  generateAccountResearchSuggestions,
  listAccountResearchSuggestions,
  loadLatestProductMatch,
  lockAccountResearchSource,
  rejectAccountResearchSuggestion,
  runAccountResearchUntilDone,
  startAccountResearch,
  unlockAccountResearchSource,
  verifyYelpDirectoryMatch,
  type AccountResearchSnapshotDto,
  type LoadedProductMatch,
} from '@/lib/accountResearchClient';
import { readSearchCandidates } from '@/lib/accountResearch/candidates';
import { generateDraftFromResearchMatch } from '@/lib/accountResearchDraftHandoff';
import type { MatchItemResponse } from '@/lib/accountProductMatch';
import type { AccountContact } from '@/lib/accountContacts';
import type { CatalogItem } from '@/lib/catalog';
import { useOptionalLineContext } from '@/lib/lineContext';
import type { Prospect } from '@/lib/prospects';
import type {
  AccountProductMatchEmptyReason,
  AccountResearchCitation,
  AccountResearchSourceSearch,
} from '@/types/database';

export type AccountResearchPanelProps = {
  prospect: Prospect;
  retailerLineAccountId?: string | null;
  onProspectUpdated?: (prospect: Prospect) => void;
  onContactAdded?: (contact: AccountContact) => void;
  onOpenDraftComposer?: (input: {
    draft: OgrProductEmailComposerDraft;
    catalogItem: CatalogItem;
  }) => void;
};

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  shopify: 'Shopify',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
};

const EMPTY_REASON_LABELS: Record<AccountProductMatchEmptyReason, string> = {
  no_eligible_products: 'No published products in the outreach pool for this line.',
  all_recently_emailed: 'All pool products were emailed to this account in the last 90 days.',
  no_accepted_evidence: 'No accepted research citations to support matching.',
  identity_unresolved: 'Identity confidence must be high before product match.',
};

function formatFieldPath(path: string): string {
  return path.replace(/_/g, ' ');
}

function formatJsonValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sourceStatusLabel(
  source: AccountResearchSourceSearch,
  locked: boolean,
  candidateCount: number,
): string {
  if (locked) return source.status.replace(/_/g, ' ');
  const meta = source.provider_metadata as { empty_outcome?: string } | null;
  if (candidateCount > 0 && (source.status === 'succeeded' || source.status === 'none_indexed')) {
    return 'Awaiting staff URL';
  }
  if (source.status === 'none_indexed') {
    if (source.source_type === 'shopify') {
      return 'No Shopify storefront found';
    }
    if (meta?.empty_outcome === 'no_profile') {
      return 'No official profile confirmed';
    }
    if (meta?.empty_outcome === 'no_activity') {
      return 'No recent public indexed activity found';
    }
    return 'No recent public indexed activity found';
  }
  return source.status.replace(/_/g, ' ');
}

function identityBlocksResearch(snapshot: AccountResearchSnapshotDto | null): boolean {
  if (!snapshot) return false;
  if (snapshot.run.status === 'needs_identity_review') return true;
  return snapshot.run.identity_confidence !== 'high';
}

export function AccountResearchPanel({
  prospect,
  retailerLineAccountId = null,
  onProspectUpdated,
  onContactAdded,
  onOpenDraftComposer,
}: AccountResearchPanelProps) {
  const line = useOptionalLineContext();
  const abortRef = useRef<AbortController | null>(null);
  const runInFlightRef = useRef(false);
  const latestSalesLineIdRef = useRef(line.salesLineId);

  const [snapshot, setSnapshot] = useState<AccountResearchSnapshotDto | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionWithCitations[]>([]);
  const [matchResult, setMatchResult] = useState<LoadedProductMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [ignoreDedup, setIgnoreDedup] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [contactPickItem, setContactPickItem] = useState<MatchItemResponse | null>(null);
  const [selectedCandidateBySource, setSelectedCandidateBySource] = useState<
    Record<string, string>
  >({});
  const [dismissedCandidatesBySource, setDismissedCandidatesBySource] = useState<
    Record<string, boolean>
  >({});
  // Locks are retailer-wide, not run-scoped, but the panel's main `snapshot`
  // only hydrates from the latest 'all'-scope run. Right after the dedicated
  // website flow (a 'website'-scope run) locks the site, there may be no
  // 'all' run yet at all — this fallback lets "Run Search All" know the
  // website is locked even before it's ever been run.
  const [websiteLockFallback, setWebsiteLockFallback] = useState(false);

  useEffect(() => {
    latestSalesLineIdRef.current = line.salesLineId;
  }, [line.salesLineId]);

  const eaglePeakOutreachBlocked = line.lineSlug === 'eagle-peak' && !line.eaglePeakOutreach;
  const bigFishOutreachBlocked = line.lineSlug === 'big-fish' && !line.bigFishOutreach;
  const outreachBlocked = eaglePeakOutreachBlocked || bigFishOutreachBlocked;

  const fresh = snapshot ? isUsableFreshRun(snapshot.run) : false;
  const identityBlocked = identityBlocksResearch(snapshot);
  const websiteLocked =
    Boolean(snapshot?.locksBySourceType?.website) || (snapshot == null && websiteLockFallback);
  const contactDiscoveryWebsite =
    snapshot?.run.resolved_website ?? snapshot?.locksBySourceType?.website?.locked_url ?? null;
  const running =
    snapshot?.run.status === 'pending' ||
    snapshot?.run.status === 'running' ||
    busyAction === 'refresh' ||
    busyAction === 'process' ||
    Boolean(
      busyAction?.startsWith('run-') ||
      busyAction?.startsWith('lock-') ||
      busyAction?.startsWith('unlock-') ||
      busyAction === 'yelp-verify',
    );
  // Copilot suggestion ignored: Search All remains available during snapshot hydration so staff can start a new run when no prior run exists.

  const citationsFlat = useMemo(() => {
    if (!snapshot) return [] as AccountResearchCitation[];
    return Object.values(snapshot.citationsBySourceId)
      .flat()
      .filter((c) => c.acceptance_status === 'accepted');
  }, [snapshot]);

  const directoryCitation = useMemo(
    () => citationsFlat.find((c) => c.platform === 'directory') ?? null,
    [citationsFlat],
  );

  const hydrateSuggestions = useCallback(async (runId: string) => {
    const listed = await listAccountResearchSuggestions(runId);
    if (listed.ok) setSuggestions(listed.suggestions);
  }, []);

  const hydrateMatch = useCallback(
    async (runId: string) => {
      if (!line.salesLineId) return;
      const requestedSalesLineId = line.salesLineId;
      const loaded = await loadLatestProductMatch({
        retailerId: prospect.id,
        salesLineId: requestedSalesLineId,
        researchRunId: runId,
      });
      if (latestSalesLineIdRef.current !== requestedSalesLineId) return;
      setMatchResult(loaded);
    },
    [line.salesLineId, prospect.id],
  );

  const hydrateAll = useCallback(async (): Promise<AccountResearchSnapshotDto | null> => {
    setLoading(true);
    setError(null);
    const latest = await fetchLatestAccountResearch(prospect.id, 'all');
    if (!latest.ok) {
      setError(latest.error);
      setSnapshot(null);
      setDismissedCandidatesBySource({});
      setSuggestions([]);
      setMatchResult(null);
      setLoading(false);
      return null;
    }
    if (latest.outcome === 'none') {
      setSnapshot(null);
      setDismissedCandidatesBySource({});
      setSuggestions([]);
      setMatchResult(null);
      const websiteLatest = await fetchLatestAccountResearch(prospect.id, 'website');
      if (websiteLatest.ok && websiteLatest.outcome !== 'none') {
        const hasWebsiteLock = Boolean(websiteLatest.locksBySourceType?.website);
        const isActive =
          websiteLatest.run.status === 'pending' || websiteLatest.run.status === 'running';
        if (isActive || hasWebsiteLock) {
          const snap: AccountResearchSnapshotDto = {
            run: websiteLatest.run,
            sources: websiteLatest.sources,
            citationsBySourceId: websiteLatest.citationsBySourceId,
            sourceFreshness: websiteLatest.sourceFreshness,
            locksBySourceType: websiteLatest.locksBySourceType ?? {},
          };
          setWebsiteLockFallback(hasWebsiteLock);
          setSnapshot(snap);
          setDismissedCandidatesBySource({});
          setLoading(false);
          return snap;
        }
      }
      setWebsiteLockFallback(
        websiteLatest.ok &&
          websiteLatest.outcome !== 'none' &&
          Boolean(websiteLatest.locksBySourceType?.website),
      );
      setLoading(false);
      return null;
    }
    setWebsiteLockFallback(false);
    const snap: AccountResearchSnapshotDto = {
      run: latest.run,
      sources: latest.sources,
      citationsBySourceId: latest.citationsBySourceId,
      sourceFreshness: latest.sourceFreshness,
      locksBySourceType: latest.locksBySourceType ?? {},
    };
    setSnapshot(snap);
    setDismissedCandidatesBySource({});
    if (latest.run.status !== 'pending' && latest.run.status !== 'running') {
      await Promise.all([hydrateSuggestions(latest.run.id), hydrateMatch(latest.run.id)]);
    }
    setLoading(false);
    return snap;
  }, [hydrateMatch, hydrateSuggestions, prospect.id]);

  const processRunUntilDone = useCallback(
    async (runId: string, busyKey: string, scopeHint?: AccountResearchV1Scope) => {
      if (runInFlightRef.current) return;
      runInFlightRef.current = true;
      setBusyAction(busyKey);
      setError(null);
      setProgress(
        scopeHint === 'website'
          ? 'Searching for website… This can take a minute.'
          : 'Processing sources… This can take a minute.',
      );

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const done = await runAccountResearchUntilDone(runId, {
          signal: controller.signal,
          onProgress: (snap) => {
            setSnapshot(snap);
            const completed = snap.sources.filter(
              (s) => s.status !== 'pending' && s.status !== 'running',
            ).length;
            const scopeLabel =
              snap.run.requested_scope === 'website'
                ? 'Searching for website'
                : 'Processing sources';
            setProgress(
              `${scopeLabel} (${completed}/${snap.sources.length})… This can take a minute.`,
            );
          },
        });
        if (!done.ok) {
          if (done.error !== 'Aborted') {
            await hydrateAll();
            setError(done.error);
          }
          return;
        }
        setSnapshot(done);
        await Promise.all([hydrateSuggestions(runId), hydrateMatch(runId)]);
      } finally {
        runInFlightRef.current = false;
        setBusyAction(null);
        setProgress(null);
      }
    },
    [hydrateAll, hydrateMatch, hydrateSuggestions],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await hydrateAll();
      if (cancelled || !snap) return;
      if (snap.run.status === 'pending' || snap.run.status === 'running') {
        const scope = isAccountResearchV1Scope(snap.run.requested_scope)
          ? snap.run.requested_scope
          : undefined;
        await processRunUntilDone(snap.run.id, 'process', scope);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [hydrateAll, processRunUntilDone]);

  async function runResearch(scope: AccountResearchV1Scope, forceRefresh: boolean) {
    if (runInFlightRef.current) return;

    setBusyAction(forceRefresh ? 'refresh' : `run-${scope}`);
    setError(null);
    setProgress(
      forceRefresh
        ? 'Starting refresh…'
        : scope === 'website'
          ? 'Searching for website… This can take a minute.'
          : 'Starting research… This can take a minute.',
    );
    setSuggestions([]);
    setMatchResult(null);
    setDismissedCandidatesBySource({});

    runInFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    const started = await startAccountResearch({
      retailerId: prospect.id,
      scope,
      forceRefresh,
    });
    if (!started.ok) {
      runInFlightRef.current = false;
      if (started.outcome === 'active_conflict') {
        const snap = await hydrateAll();
        setBusyAction(null);
        setProgress(null);
        if (snap && (snap.run.status === 'pending' || snap.run.status === 'running')) {
          const resumeScope = isAccountResearchV1Scope(snap.run.requested_scope)
            ? snap.run.requested_scope
            : scope;
          await processRunUntilDone(snap.run.id, 'process', resumeScope);
          return;
        }
        setError(started.error);
        return;
      }
      setError(started.error);
      setBusyAction(null);
      setProgress(null);
      return;
    }

    setSnapshot({
      run: started.run,
      sources: started.sources,
      citationsBySourceId: started.citationsBySourceId,
      sourceFreshness: started.sourceFreshness,
      locksBySourceType: started.locksBySourceType ?? {},
    });
    setDismissedCandidatesBySource({});

    if (started.run.status === 'pending' || started.run.status === 'running') {
      // processRunUntilDone owns the in-flight flag from here
      runInFlightRef.current = false;
      await processRunUntilDone(started.run.id, forceRefresh ? 'refresh' : `run-${scope}`, scope);
      return;
    }

    runInFlightRef.current = false;
    setProgress(null);
    setBusyAction(null);
    await Promise.all([hydrateSuggestions(started.run.id), hydrateMatch(started.run.id)]);
  }

  async function handleGenerateSuggestions() {
    if (!snapshot) return;
    setBusyAction('suggestions');
    setError(null);
    const result = await generateAccountResearchSuggestions(snapshot.run.id);
    setBusyAction(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const listed = await listAccountResearchSuggestions(snapshot.run.id);
    if (!listed.ok) {
      setError(listed.error);
      return;
    }
    setSuggestions(listed.suggestions);
  }

  async function handleApplySuggestion(suggestionId: string) {
    // Copilot suggestion ignored: protected-field overwrite confirmation is a larger UX flow outside this targeted triage.
    setBusyAction(`apply-${suggestionId}`);
    setError(null);
    const result = await applyAccountResearchSuggestion(suggestionId);
    setBusyAction(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onProspectUpdated?.(result.prospect);
    if (snapshot) await hydrateSuggestions(snapshot.run.id);
  }

  async function handleRejectSuggestion(suggestionId: string) {
    setBusyAction(`reject-${suggestionId}`);
    setError(null);
    const result = await rejectAccountResearchSuggestion(suggestionId);
    setBusyAction(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (snapshot) await hydrateSuggestions(snapshot.run.id);
  }

  async function handleRunMatch() {
    if (!snapshot || !line.salesLineId) return;
    const requestedSalesLineId = line.salesLineId;
    setBusyAction('match');
    setError(null);
    const result = await createAccountProductMatchClient({
      retailerId: prospect.id,
      salesLineId: requestedSalesLineId,
      researchRunId: snapshot.run.id,
      ignoreRecentSendDedup: ignoreDedup,
    });
    setBusyAction(null);
    if (latestSalesLineIdRef.current !== requestedSalesLineId) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMatchResult({ run: result.run, items: result.items });
    if (result.outcome === 'empty' && result.empty_reason) {
      setError(EMPTY_REASON_LABELS[result.empty_reason] ?? result.empty_reason);
    }
  }

  // Copilot suggestion ignored: a full contact-to-draft component suite is broader test expansion; focused handoff tests cover this seam.
  async function handleContactPicked(contact: {
    accountContactId: string;
    toEmail: string;
    toName: string;
  }) {
    const item = contactPickItem;
    setContactPickItem(null);
    if (!item || !onOpenDraftComposer) return;

    setBusyAction('draft');
    setError(null);
    const generated = await generateDraftFromResearchMatch({
      prospect,
      matchItem: item,
      contact,
      salesLineId: line.salesLineId ?? undefined,
      retailerLineAccountId: retailerLineAccountId ?? undefined,
    });
    setBusyAction(null);
    if (!generated.ok) {
      setError(generated.error);
      return;
    }
    onOpenDraftComposer({
      draft: generated.draft,
      catalogItem: generated.catalogItem,
    });
  }

  async function handleLockSource(source: AccountResearchSourceSearch) {
    const url = selectedCandidateBySource[source.id]?.trim();
    if (!url) {
      setError('Select a candidate or enter a URL to lock in.');
      return;
    }
    setBusyAction(`lock-${source.id}`);
    setError(null);
    setProgress('Locking URL and indexing activity…');
    const result = await lockAccountResearchSource({
      retailerId: prospect.id,
      sourceType: source.source_type,
      url,
    });
    setBusyAction(null);
    setProgress(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSnapshot(result);
    setDismissedCandidatesBySource({});
    if (source.source_type === 'website') setWebsiteLockFallback(true);
    await Promise.all([hydrateSuggestions(result.run.id), hydrateMatch(result.run.id)]);
  }

  async function handleVerifyYelp() {
    if (!snapshot) return;
    setBusyAction('yelp-verify');
    setError(null);
    const result = await verifyYelpDirectoryMatch(snapshot.run.id);
    if (!result.ok) {
      setBusyAction(null);
      setError(result.error);
      return;
    }
    setSnapshot({
      run: result.run,
      sources: result.sources,
      citationsBySourceId: result.citationsBySourceId,
      sourceFreshness: result.sourceFreshness,
      locksBySourceType: result.locksBySourceType ?? {},
    });
    const generated = await generateAccountResearchSuggestions(snapshot.run.id);
    if (generated.ok) {
      const listed = await listAccountResearchSuggestions(snapshot.run.id);
      if (listed.ok) setSuggestions(listed.suggestions);
    }
    setBusyAction(null);
  }

  async function handleUnlockSource(source: AccountResearchSourceSearch) {
    setBusyAction(`unlock-${source.id}`);
    setError(null);
    const result = await unlockAccountResearchSource({
      retailerId: prospect.id,
      sourceType: source.source_type,
    });
    setBusyAction(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSnapshot(result);
    setDismissedCandidatesBySource({});
    if (source.source_type === 'website') setWebsiteLockFallback(false);
    setSelectedCandidateBySource((prev) => {
      const next = { ...prev };
      delete next[source.id];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading m-0 text-base">Account research</h3>
        {snapshot ? (
          <>
            <Tag variant={fresh ? 'accent-2' : 'neutral'}>{fresh ? 'Fresh' : 'Stale'}</Tag>
            <Tag variant="neutral">Identity: {snapshot.run.identity_confidence}</Tag>
            <Tag variant="neutral">{snapshot.run.status.replace(/_/g, ' ')}</Tag>
          </>
        ) : (
          <Tag variant="neutral">No run yet</Tag>
        )}
      </div>

      {snapshot?.run.completed_at ? (
        <p className="text-ink/55 m-0 text-xs">
          Completed {snapshot.run.completed_at.slice(0, 10)}
        </p>
      ) : null}

      {identityBlocked ? (
        <p className="text-ink/70 m-0 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm">
          Identity must be high confidence before suggestions or product match. Refresh research or
          review citations when identity is unresolved.
        </p>
      ) : null}

      <section className="border-ink/10 flex flex-col gap-2 rounded-md border px-3 py-3">
        <h4 className="text-ink/70 m-0 text-xs font-semibold tracking-wider uppercase">
          Business verification (Yelp)
        </h4>
        <p className="text-ink/55 m-0 text-xs leading-relaxed">
          Verify the physical business on Yelp before locking the official website. Blank phone and
          address suggestions can use directory evidence after verify.
        </p>
        {directoryCitation ? (
          <div className="text-ink/60 flex flex-col gap-0.5 text-xs">
            <p className="m-0">
              Yelp verified:{' '}
              <span className="text-ink/80 font-medium">
                {directoryCitation.title ?? 'Listing'}
              </span>
              {typeof directoryCitation.confidence === 'string' ? (
                <span className="text-ink/55"> · {directoryCitation.confidence} confidence</span>
              ) : null}
            </p>
            <p className="m-0">
              Directory listing:{' '}
              <a
                href={directoryCitation.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-700 underline"
              >
                {directoryCitation.source_url}
              </a>
            </p>
          </div>
        ) : (
          <p className="text-ink/55 m-0 text-xs">Not verified on Yelp for this research run yet.</p>
        )}
        {!directoryCitation && snapshot && !websiteLocked ? (
          <p className="text-ink/55 m-0 text-xs">
            Verify on Yelp first for blank phone/address suggestions.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={running || !snapshot}
            onClick={() => void handleVerifyYelp()}
          >
            {busyAction === 'yelp-verify' ? 'Verifying…' : 'Verify on Yelp'}
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={running}
          onClick={() => void runResearch('website', false)}
        >
          {busyAction === 'run-website' || busyAction === 'process'
            ? 'Running…'
            : 'Run Website Search'}
        </Button>
        <Button
          variant="secondary"
          disabled={running || !websiteLocked}
          onClick={() => void runResearch('all', false)}
        >
          {busyAction === 'run-all' ? 'Running…' : 'Run Search All'}
        </Button>
        <Button
          variant="secondary"
          disabled={running || !snapshot}
          onClick={() =>
            void runResearch(
              snapshot && isAccountResearchV1Scope(snapshot.run.requested_scope)
                ? snapshot.run.requested_scope
                : 'all',
              true,
            )
          }
        >
          {busyAction === 'refresh' ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {!websiteLocked ? (
        <p className="text-ink/55 m-0 text-xs">
          Lock the official website first — Run Search All scrapes it for social channels and
          Shopify evidence instead of guessing. If they have no website, lock their Facebook or
          Instagram page URL instead.
        </p>
      ) : null}

      {progress ? (
        <p className="text-ink/60 m-0 text-sm" role="status" aria-live="polite">
          {progress}
        </p>
      ) : null}
      {loading ? <p className="text-ink/60 m-0 text-sm">Loading research…</p> : null}
      {error ? <p className="text-error m-0 text-sm">{error}</p> : null}

      {snapshot ? (
        <>
          <section>
            <h4 className="text-ink/70 m-0 mb-2 text-xs font-semibold tracking-wider uppercase">
              Sources
            </h4>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {snapshot.sources.map((source) => {
                const lock = snapshot.locksBySourceType?.[source.source_type] ?? null;
                const candidates = readSearchCandidates(
                  source.provider_metadata as Record<string, unknown> | null,
                );
                const candidatesDismissed = Boolean(dismissedCandidatesBySource[source.id]);
                const effectiveCandidates = candidatesDismissed ? [] : candidates;
                const selected = selectedCandidateBySource[source.id] ?? '';
                const manualLock = manualSourceLockConfig(source.source_type);
                return (
                  <li key={source.id} className="border-ink/10 rounded-md border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {SOURCE_LABELS[source.source_type] ?? source.source_type}
                      </span>
                      <span className="text-ink/55 flex items-center gap-2 text-xs">
                        {lock ? <Tag variant="accent-2">Locked</Tag> : null}
                        {sourceStatusLabel(source, Boolean(lock), candidates.length)}
                        {snapshot.sourceFreshness[source.id] ? ' · fresh' : ''}
                      </span>
                    </div>
                    {lock ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <a
                          href={lock.locked_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-800 inline-block text-xs hover:underline"
                        >
                          {lock.locked_url}
                        </a>
                        <div>
                          <Button
                            variant="secondary"
                            disabled={busyAction != null}
                            onClick={() => void handleUnlockSource(source)}
                          >
                            {busyAction === `unlock-${source.id}` ? 'Unlocking…' : 'Unlock'}
                          </Button>
                        </div>
                      </div>
                    ) : effectiveCandidates.length > 0 ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                          {effectiveCandidates.map((candidate) => (
                            <li key={candidate.url}>
                              <label className="flex cursor-pointer items-start gap-2">
                                <input
                                  type="radio"
                                  className="mt-1"
                                  name={`lock-${source.id}`}
                                  value={candidate.url}
                                  checked={selected === candidate.url}
                                  onChange={() =>
                                    setSelectedCandidateBySource((prev) => ({
                                      ...prev,
                                      [source.id]: candidate.url,
                                    }))
                                  }
                                />
                                <span>
                                  <span className="block text-xs font-medium">
                                    {candidate.title ?? candidate.url}
                                  </span>
                                  <span className="text-ink/55 block text-[11px] break-all">
                                    {candidate.url}
                                  </span>
                                  {candidate.snippet ? (
                                    <span className="text-ink/60 mt-0.5 block text-[11px] leading-relaxed">
                                      {candidate.snippet}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="primary"
                            disabled={busyAction != null || !selected}
                            onClick={() => void handleLockSource(source)}
                          >
                            {busyAction === `lock-${source.id}` ? 'Locking…' : 'Lock in'}
                          </Button>
                          {manualLock ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busyAction != null}
                              onClick={() => {
                                setDismissedCandidatesBySource((prev) => ({
                                  ...prev,
                                  [source.id]: true,
                                }));
                                setSelectedCandidateBySource((prev) => {
                                  const next = { ...prev };
                                  delete next[source.id];
                                  return next;
                                });
                              }}
                            >
                              No match
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : manualLock ? (
                      <div className="mt-2 flex flex-col gap-2">
                        {candidatesDismissed && candidates.length > 0 ? (
                          <button
                            type="button"
                            className="text-accent-800 self-start border-0 bg-transparent p-0 text-xs underline"
                            disabled={busyAction != null}
                            onClick={() =>
                              setDismissedCandidatesBySource((prev) => {
                                const next = { ...prev };
                                delete next[source.id];
                                return next;
                              })
                            }
                          >
                            Show search results
                          </button>
                        ) : null}
                        <ManualSourceLockFields
                          hint={manualLock.hint}
                          placeholder={manualLock.placeholder}
                          ariaLabel={manualLock.ariaLabel}
                          value={selected}
                          disabled={busyAction != null}
                          locking={busyAction === `lock-${source.id}`}
                          onChange={(value) =>
                            setSelectedCandidateBySource((prev) => ({
                              ...prev,
                              [source.id]: value,
                            }))
                          }
                          onLock={() => void handleLockSource(source)}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h4 className="text-ink/70 m-0 mb-2 text-xs font-semibold tracking-wider uppercase">
              Citations ({citationsFlat.length})
            </h4>
            {snapshot.sources.length === 0 ? (
              <p className="text-ink/50 m-0 text-sm">No sources yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {snapshot.sources.map((source) => {
                  const citations = (snapshot.citationsBySourceId[source.id] ?? []).filter(
                    (c) => c.acceptance_status === 'accepted',
                  );
                  const expanded = expandedSources[source.id] ?? false;
                  return (
                    <li key={source.id} className="border-ink/10 rounded-md border">
                      <button
                        type="button"
                        className="hover:bg-ink/[0.03] flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                        onClick={() =>
                          setExpandedSources((prev) => ({
                            ...prev,
                            [source.id]: !expanded,
                          }))
                        }
                      >
                        <span>
                          {SOURCE_LABELS[source.source_type] ?? source.source_type} (
                          {citations.length})
                        </span>
                        <span className="text-ink/45 text-xs">{expanded ? 'Hide' : 'Show'}</span>
                      </button>
                      {expanded ? (
                        <ul className="border-ink/10 m-0 flex list-none flex-col gap-2 border-t p-3">
                          {citations.length === 0 ? (
                            <li className="text-ink/50 text-xs">No citations.</li>
                          ) : (
                            citations.map((citation) => (
                              <li key={citation.id} className="text-sm">
                                <p className="m-0 font-medium">
                                  {citation.title ?? citation.source_url}
                                </p>
                                <p className="text-ink/55 m-0 mt-0.5 text-xs">
                                  {citation.acceptance_status} · {citation.platform}
                                  {citation.observed_at
                                    ? ` · ${citation.observed_at.slice(0, 10)}`
                                    : ''}
                                </p>
                                {citation.excerpt ? (
                                  <p className="text-ink/70 m-0 mt-1 text-xs leading-relaxed">
                                    {citation.excerpt}
                                  </p>
                                ) : null}
                                <a
                                  href={citation.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent-800 mt-1 inline-block text-xs hover:underline"
                                >
                                  Open source
                                </a>
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-ink/70 m-0 text-xs font-semibold tracking-wider uppercase">
                Profile suggestions
              </h4>
              <Button
                variant="secondary"
                disabled={identityBlocked || !fresh || busyAction != null}
                onClick={() => void handleGenerateSuggestions()}
              >
                {busyAction === 'suggestions' ? 'Generating…' : 'Generate suggestions'}
              </Button>
            </div>
            {suggestions.length === 0 ? (
              <p className="text-ink/50 m-0 text-sm">No pending suggestions.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {suggestions.map((suggestion) => (
                  <li
                    key={suggestion.id}
                    className="border-ink/10 rounded-md border px-3 py-2 text-sm"
                  >
                    <p className="m-0 font-medium">{formatFieldPath(suggestion.field_path)}</p>
                    <p className="text-ink/60 m-0 mt-1 text-xs">
                      Current: {formatJsonValue(suggestion.currentValue)}
                    </p>
                    <p className="m-0 mt-1">
                      Suggested: {formatJsonValue(suggestion.suggested_value)}
                    </p>
                    {suggestion.rationale ? (
                      <p className="text-ink/70 m-0 mt-1 text-xs">{suggestion.rationale}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        disabled={busyAction != null}
                        onClick={() => void handleApplySuggestion(suggestion.id)}
                      >
                        Apply
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busyAction != null}
                        onClick={() => void handleRejectSuggestion(suggestion.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-ink/70 m-0 text-xs font-semibold tracking-wider uppercase">
                Product match
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-ink/60 flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={ignoreDedup}
                    onChange={(e) => setIgnoreDedup(e.target.checked)}
                  />
                  Ignore 90-day dedup
                </label>
                <Button
                  variant="secondary"
                  disabled={identityBlocked || !fresh || !line.salesLineId || busyAction != null}
                  onClick={() => void handleRunMatch()}
                >
                  {busyAction === 'match' ? 'Matching…' : 'Run match'}
                </Button>
              </div>
            </div>
            {!line.salesLineId ? (
              <p className="text-ink/50 m-0 text-sm">
                Select a represented sales line to run match.
              </p>
            ) : matchResult && matchResult.items.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {matchResult.items.map((item) => (
                  <li key={item.id} className="border-ink/10 rounded-md border px-3 py-2 text-sm">
                    <p className="m-0 font-medium">
                      #{item.rank} {item.name}{' '}
                      <span className="text-ink/45 text-xs">({item.sku})</span>
                    </p>
                    <p className="text-ink/55 m-0 mt-0.5 text-xs">Fit: {item.product_fit}</p>
                    <p className="text-ink/70 m-0 mt-1 text-xs leading-relaxed">{item.rationale}</p>
                    <p className="text-ink/45 m-0 mt-1 text-xs">
                      {item.citation_ids.length} citation
                      {item.citation_ids.length === 1 ? '' : 's'}
                    </p>
                    <Button
                      variant="primary"
                      className="mt-2"
                      disabled={
                        outreachBlocked ||
                        busyAction != null ||
                        !onOpenDraftComposer ||
                        !line.salesLineId ||
                        !retailerLineAccountId
                      }
                      onClick={() => setContactPickItem(item)}
                    >
                      Use for draft
                    </Button>
                  </li>
                ))}
              </ul>
            ) : matchResult?.run.status === 'empty' && matchResult.run.empty_reason ? (
              <p className="text-ink/50 m-0 text-sm">
                {EMPTY_REASON_LABELS[matchResult.run.empty_reason] ?? matchResult.run.empty_reason}
              </p>
            ) : (
              <p className="text-ink/50 m-0 text-sm">No match run yet for this research.</p>
            )}
            {outreachBlocked ? (
              <p className="text-ink/55 m-0 mt-2 text-xs">
                Outreach draft generation is not enabled for this line.
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <p className="text-ink/50 m-0 text-sm">
          Run Website Search first, pick and lock in the official URL, then run the rest to gather
          social evidence before product match.
        </p>
      )}

      {websiteLocked ? (
        <section>
          <h4 className="text-ink/70 m-0 mb-2 text-xs font-semibold tracking-wider uppercase">
            Contact discovery
          </h4>
          <ContactDiscoverPreview
            accountId={prospect.id}
            resolvedWebsite={contactDiscoveryWebsite}
            onContactAdded={onContactAdded}
          />
        </section>
      ) : null}

      <AccountResearchContactPickModal
        open={contactPickItem != null}
        accountId={prospect.id}
        onClose={() => setContactPickItem(null)}
        onPick={(contact) => void handleContactPicked(contact)}
      />
    </div>
  );
}
