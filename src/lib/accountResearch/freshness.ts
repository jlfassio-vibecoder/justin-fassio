import {
  ACCOUNT_RESEARCH_FRESHNESS_DAYS,
  type AccountResearchPlatformScope,
  type AccountResearchV1Scope,
} from '@/lib/accountResearch/constants';
import type {
  AccountResearchRun,
  AccountResearchSourceSearch,
  AccountResearchRunStatus,
} from '@/types/database';

const USABLE_RUN_STATUSES: ReadonlySet<AccountResearchRunStatus> = new Set([
  'succeeded',
  'partial',
]);

export function isFreshTimestamp(
  completedAt: string | null | undefined,
  nowMs: number = Date.now(),
  freshnessDays: number = ACCOUNT_RESEARCH_FRESHNESS_DAYS,
): boolean {
  if (!completedAt) return false;
  const completedMs = Date.parse(completedAt);
  if (Number.isNaN(completedMs)) return false;
  return nowMs - completedMs < freshnessDays * 24 * 60 * 60 * 1000;
}

export function isUsableFreshRun(
  run: Pick<AccountResearchRun, 'status' | 'completed_at'>,
  nowMs: number = Date.now(),
): boolean {
  return USABLE_RUN_STATUSES.has(run.status) && isFreshTimestamp(run.completed_at, nowMs);
}

/**
 * Search All may satisfy a platform read when that source succeeded/none_indexed and is fresh.
 * An individual platform run never satisfies Search All.
 */
export function runSatisfiesScopeRequest(args: {
  run: Pick<AccountResearchRun, 'requested_scope' | 'status' | 'completed_at'>;
  requestedScope: AccountResearchV1Scope;
  sources: ReadonlyArray<
    Pick<AccountResearchSourceSearch, 'source_type' | 'status' | 'completed_at'>
  >;
  nowMs?: number;
}): boolean {
  const { run, requestedScope, sources, nowMs = Date.now() } = args;
  if (!isUsableFreshRun(run, nowMs)) return false;

  if (requestedScope === 'all') {
    return run.requested_scope === 'all';
  }

  if (run.requested_scope === requestedScope) {
    return true;
  }

  if (run.requested_scope === 'all') {
    const source = sources.find((s) => s.source_type === requestedScope);
    if (!source) return false;
    if (source.status !== 'succeeded' && source.status !== 'none_indexed') return false;
    return isFreshTimestamp(source.completed_at, nowMs);
  }

  return false;
}

export function sourceFreshnessMap(
  sources: ReadonlyArray<
    Pick<AccountResearchSourceSearch, 'id' | 'source_type' | 'status' | 'completed_at'>
  >,
  nowMs: number = Date.now(),
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const source of sources) {
    const usable =
      (source.status === 'succeeded' || source.status === 'none_indexed') &&
      isFreshTimestamp(source.completed_at, nowMs);
    out[source.id] = usable;
  }
  return out;
}

export function isPlatformScopeFreshOnRun(
  sources: ReadonlyArray<
    Pick<AccountResearchSourceSearch, 'source_type' | 'status' | 'completed_at'>
  >,
  platform: AccountResearchPlatformScope,
  nowMs: number = Date.now(),
): boolean {
  const source = sources.find((s) => s.source_type === platform);
  if (!source) return false;
  if (source.status !== 'succeeded' && source.status !== 'none_indexed') return false;
  return isFreshTimestamp(source.completed_at, nowMs);
}
