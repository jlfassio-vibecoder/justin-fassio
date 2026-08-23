import type { AgentSupabase } from '@/lib/agentAuth';
import { hostnameFromUrl } from '@/lib/enrichGuidance';
import {
  ACCOUNT_RESEARCH_MANUAL_RUNS_PER_DAY,
  ACCOUNT_RESEARCH_STALE_RUNNING_MS,
  isAccountResearchPlatformScope,
  type AccountResearchV1Scope,
} from '@/lib/accountResearch/constants';
import { runSatisfiesScopeRequest } from '@/lib/accountResearch/freshness';
import { resolveAccountIdentity, type IdentityResolution } from '@/lib/accountResearch/identity';
import { executeAccountResearchSourceSearch } from '@/lib/accountResearch/provider';
import {
  loadAccountResearchSnapshot,
  type AccountResearchSnapshot,
} from '@/lib/accountResearch/snapshot';
import type {
  AccountResearchRun,
  AccountResearchRunStatus,
  AccountResearchSourceSearch,
  AccountResearchSourceSearchStatus,
  ProspectRow,
} from '@/types/database';

export type StartOrReuseResult =
  | { ok: true; outcome: 'cached' | 'started'; snapshot: AccountResearchSnapshot }
  | {
      ok: false;
      outcome: 'active_conflict' | 'rate_limited' | 'not_found' | 'error';
      error: string;
      status: number;
    };

export type ProcessSourceResult =
  | {
      ok: true;
      processed: boolean;
      sourceId: string | null;
      snapshot: AccountResearchSnapshot;
      done: boolean;
    }
  | { ok: false; error: string; status: number };

function isTerminalSourceStatus(status: AccountResearchSourceSearchStatus): boolean {
  return (
    status === 'succeeded' ||
    status === 'none_indexed' ||
    status === 'blocked' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

export function computeFinalRunStatus(args: {
  identity: Pick<IdentityResolution, 'identity_confidence'> | null;
  sources: ReadonlyArray<Pick<AccountResearchSourceSearch, 'status'>>;
}): AccountResearchRunStatus {
  const confidence = args.identity?.identity_confidence ?? 'unresolved';
  if (confidence === 'medium' || confidence === 'low' || confidence === 'unresolved') {
    return 'needs_identity_review';
  }

  const statuses = args.sources.map((s) => s.status);
  const usable = statuses.filter((s) => s === 'succeeded' || s === 'none_indexed');
  const hardFail = statuses.filter((s) => s === 'failed' || s === 'blocked');

  if (usable.length === statuses.length && usable.length > 0) return 'succeeded';
  if (usable.length > 0 && hardFail.length > 0) return 'partial';
  return 'failed';
}

export async function countManualRunsToday(
  supabase: AgentSupabase,
  retailerId: number,
): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('account_research_runs')
    .select('id', { count: 'exact', head: true })
    .eq('retailer_id', retailerId)
    .eq('trigger', 'manual')
    .gte('created_at', start.toISOString());
  if (error) return ACCOUNT_RESEARCH_MANUAL_RUNS_PER_DAY;
  return count ?? 0;
}

async function findLatestUsableRun(
  supabase: AgentSupabase,
  retailerId: number,
  scope: AccountResearchV1Scope,
): Promise<AccountResearchSnapshot | null> {
  const { data: runs } = await supabase
    .from('account_research_runs')
    .select('*')
    .eq('retailer_id', retailerId)
    .in('status', ['succeeded', 'partial'])
    .order('completed_at', { ascending: false })
    .limit(20);

  for (const run of (runs ?? []) as AccountResearchRun[]) {
    const snapshot = await loadAccountResearchSnapshot(supabase, run.id);
    if (!snapshot) continue;
    if (
      runSatisfiesScopeRequest({
        run: snapshot.run,
        requestedScope: scope,
        sources: snapshot.sources,
      })
    ) {
      return snapshot;
    }
  }
  return null;
}

export async function startOrReuseAccountResearch(args: {
  supabase: AgentSupabase;
  userId: string;
  retailerId: number;
  scope: AccountResearchV1Scope;
  forceRefresh: boolean;
  trigger?: 'manual' | 'api';
}): Promise<StartOrReuseResult> {
  const trigger = args.trigger ?? 'manual';

  const { data: prospect, error: prospectError } = await args.supabase
    .from('prospects')
    .select('id, name, city, region, phone, website')
    .eq('id', args.retailerId)
    .maybeSingle();
  if (prospectError) {
    return { ok: false, outcome: 'error', error: prospectError.message, status: 500 };
  }
  if (!prospect) {
    return { ok: false, outcome: 'not_found', error: 'Retailer not found', status: 404 };
  }

  if (!args.forceRefresh) {
    const cached = await findLatestUsableRun(args.supabase, args.retailerId, args.scope);
    if (cached) {
      return { ok: true, outcome: 'cached', snapshot: cached };
    }
  }

  if (trigger === 'manual') {
    const used = await countManualRunsToday(args.supabase, args.retailerId);
    if (used >= ACCOUNT_RESEARCH_MANUAL_RUNS_PER_DAY) {
      return {
        ok: false,
        outcome: 'rate_limited',
        error: 'Daily manual research limit reached for this retailer',
        status: 429,
      };
    }
  }

  let supersedesRunId: string | null = null;
  if (args.forceRefresh) {
    const prior = await findLatestUsableRun(args.supabase, args.retailerId, args.scope);
    supersedesRunId = prior?.run.id ?? null;
  }

  const { data: rpcData, error: rpcError } = await args.supabase.rpc('start_account_research_run', {
    p_retailer_id: args.retailerId,
    p_scope: args.scope,
    p_trigger: trigger,
    p_requested_by: args.userId,
    p_supersedes_run_id: supersedesRunId,
  });

  if (rpcError) {
    if (/ACTIVE_RUN_CONFLICT/i.test(rpcError.message)) {
      return {
        ok: false,
        outcome: 'active_conflict',
        error: 'An active research run already exists for this retailer',
        status: 409,
      };
    }
    return { ok: false, outcome: 'error', error: rpcError.message, status: 500 };
  }

  const runId =
    rpcData && typeof rpcData === 'object' && 'run_id' in rpcData
      ? String((rpcData as { run_id: string }).run_id)
      : null;
  if (!runId) {
    return { ok: false, outcome: 'error', error: 'Start RPC returned no run_id', status: 500 };
  }

  // Seed identity from CRM fields before provider work.
  const identity = resolveAccountIdentity({
    businessName: prospect.name,
    city: prospect.city,
    region: prospect.region,
    phone: prospect.phone,
    website: prospect.website,
  });
  await args.supabase
    .from('account_research_runs')
    .update({
      identity_confidence: identity.identity_confidence,
      identity_review_status: identity.identity_review_status,
      identity_resolution: identity.identity_resolution,
      resolved_website: identity.resolved_website,
    })
    .eq('id', runId);

  const snapshot = await loadAccountResearchSnapshot(args.supabase, runId);
  if (!snapshot) {
    return { ok: false, outcome: 'error', error: 'Failed to load started run', status: 500 };
  }
  return { ok: true, outcome: 'started', snapshot };
}

async function reapStaleRunningSources(supabase: AgentSupabase, runId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ACCOUNT_RESEARCH_STALE_RUNNING_MS).toISOString();
  const { data: stale } = await supabase
    .from('account_research_source_searches')
    .select('id')
    .eq('research_run_id', runId)
    .eq('status', 'running')
    .lt('started_at', cutoff);

  for (const row of stale ?? []) {
    await supabase
      .from('account_research_source_searches')
      .update({
        status: 'failed',
        error: 'Timed out while running',
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'running');
  }
}

export async function finalizeAccountResearchRun(
  supabase: AgentSupabase,
  runId: string,
): Promise<AccountResearchSnapshot | null> {
  const snapshot = await loadAccountResearchSnapshot(supabase, runId);
  if (!snapshot) return null;

  const pending = snapshot.sources.some((s) => !isTerminalSourceStatus(s.status));
  if (pending) return snapshot;

  const identity: IdentityResolution = {
    identity_confidence: snapshot.run.identity_confidence,
    identity_review_status:
      snapshot.run.identity_review_status === 'not_required' ? 'not_required' : 'pending',
    resolved_website: snapshot.run.resolved_website,
    identity_resolution: snapshot.run.identity_resolution,
    official_hostname: snapshot.run.resolved_website
      ? hostnameFromUrl(snapshot.run.resolved_website)
      : null,
    corroborators: [],
  };

  const status = computeFinalRunStatus({ identity, sources: snapshot.sources });
  await supabase
    .from('account_research_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      identity_review_status:
        status === 'needs_identity_review' ? 'pending' : snapshot.run.identity_review_status,
    })
    .eq('id', runId)
    .eq('status', 'running');

  return loadAccountResearchSnapshot(supabase, runId);
}

export async function processNextAccountResearchSource(args: {
  supabase: AgentSupabase;
  runId: string;
}): Promise<ProcessSourceResult> {
  await reapStaleRunningSources(args.supabase, args.runId);

  const { data: run, error: runError } = await args.supabase
    .from('account_research_runs')
    .select('*')
    .eq('id', args.runId)
    .maybeSingle();
  if (runError) return { ok: false, error: runError.message, status: 500 };
  if (!run) return { ok: false, error: 'Run not found', status: 404 };

  const researchRun = run as AccountResearchRun;
  if (researchRun.status !== 'running' && researchRun.status !== 'pending') {
    const snapshot = await loadAccountResearchSnapshot(args.supabase, args.runId);
    if (!snapshot) return { ok: false, error: 'Run not found', status: 404 };
    return {
      ok: true,
      processed: false,
      sourceId: null,
      snapshot,
      done: true,
    };
  }

  const { data: nextPending, error: pendingError } = await args.supabase
    .from('account_research_source_searches')
    .select('*')
    .eq('research_run_id', args.runId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pendingError) return { ok: false, error: pendingError.message, status: 500 };

  if (!nextPending) {
    const finalized = await finalizeAccountResearchRun(args.supabase, args.runId);
    if (!finalized) return { ok: false, error: 'Failed to finalize run', status: 500 };
    return {
      ok: true,
      processed: false,
      sourceId: null,
      snapshot: finalized,
      done: true,
    };
  }

  const { data: claimed, error: claimError } = await args.supabase
    .from('account_research_source_searches')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', nextPending.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (claimError) return { ok: false, error: claimError.message, status: 500 };

  if (!claimed) {
    // Lost the race; reload and continue.
    const snapshot = await loadAccountResearchSnapshot(args.supabase, args.runId);
    if (!snapshot) return { ok: false, error: 'Failed to load snapshot', status: 500 };
    return {
      ok: true,
      processed: false,
      sourceId: null,
      snapshot,
      done: snapshot.sources.every((s) => isTerminalSourceStatus(s.status)),
    };
  }

  const source = claimed as AccountResearchSourceSearch;
  if (!isAccountResearchPlatformScope(source.source_type)) {
    await args.supabase.rpc('complete_account_research_source_search', {
      p_source_search_id: source.id,
      p_status: 'failed',
      p_error: 'Unsupported source type',
      p_citations: [],
    });
    const snap = await finalizeAccountResearchRun(args.supabase, args.runId);
    if (!snap) return { ok: false, error: 'Failed after unsupported source', status: 500 };
    return { ok: true, processed: true, sourceId: source.id, snapshot: snap, done: true };
  }

  const { data: prospect } = await args.supabase
    .from('prospects')
    .select('id, name, city, region, phone, website')
    .eq('id', researchRun.retailer_id)
    .maybeSingle();

  const prospectRow = prospect as Pick<
    ProspectRow,
    'name' | 'city' | 'region' | 'phone' | 'website'
  > | null;

  const officialHostname = researchRun.resolved_website
    ? hostnameFromUrl(researchRun.resolved_website)
    : prospectRow?.website
      ? hostnameFromUrl(prospectRow.website)
      : null;

  const outcome = await executeAccountResearchSourceSearch({
    sourceType: source.source_type,
    ctx: {
      businessName: prospectRow?.name ?? 'Unknown',
      city: prospectRow?.city,
      region: prospectRow?.region,
      website: prospectRow?.website,
      officialHostname,
    },
  });

  // Refine identity after website evidence.
  let identityConfidence = researchRun.identity_confidence;
  if (source.source_type === 'website' && prospectRow) {
    const evidenceText = [
      outcome.brief ?? '',
      ...outcome.citations.map((c) => `${c.title ?? ''} ${c.excerpt ?? ''}`),
    ].join('\n');
    const refined = resolveAccountIdentity({
      businessName: prospectRow.name,
      city: prospectRow.city,
      region: prospectRow.region,
      phone: prospectRow.phone,
      website: prospectRow.website,
      evidenceOfficialHostname: outcome.citations[0]?.url
        ? hostnameFromUrl(outcome.citations[0].url)
        : officialHostname,
      officialHostEvidenceText: evidenceText,
    });
    identityConfidence = refined.identity_confidence;
    await args.supabase
      .from('account_research_runs')
      .update({
        identity_confidence: refined.identity_confidence,
        identity_review_status: refined.identity_review_status,
        identity_resolution: refined.identity_resolution,
        resolved_website: refined.resolved_website,
      })
      .eq('id', args.runId);
  }

  const accept = identityConfidence === 'high';
  const citationPayload = outcome.citations.map((c) => ({
    source_url: c.url,
    source_url_normalized: c.url,
    title: c.title,
    platform: c.platform,
    published_at: c.publishedAt,
    observed_at: new Date().toISOString(),
    excerpt: c.excerpt,
    confidence: c.confidence,
    identity_confidence: identityConfidence,
    acceptance_status: accept ? 'accepted' : 'pending',
    acceptance_basis: accept ? 'identity_gate' : null,
    provider_metadata: {},
  }));

  const { error: completeError } = await args.supabase.rpc(
    'complete_account_research_source_search',
    {
      p_source_search_id: source.id,
      p_status: outcome.status,
      p_query_text: outcome.queryText,
      p_resolved_public_url: outcome.resolvedPublicUrl,
      p_error: outcome.error,
      p_provider: 'perplexity_via_gateway',
      p_provider_metadata: outcome.providerMetadata,
      p_citations: citationPayload,
      p_research_brief: outcome.brief,
    },
  );

  if (completeError) {
    if (/STALE_WORKER|SOURCE_NOT_RUNNING/i.test(completeError.message)) {
      const snap = await loadAccountResearchSnapshot(args.supabase, args.runId);
      if (!snap) return { ok: false, error: 'Stale worker', status: 409 };
      return {
        ok: true,
        processed: false,
        sourceId: source.id,
        snapshot: snap,
        done: snap.run.status !== 'running',
      };
    }
    // Mark failed without citations if complete RPC rejects payload.
    await args.supabase
      .from('account_research_source_searches')
      .update({
        status: 'failed',
        error: completeError.message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', source.id)
      .eq('status', 'running');
  }

  const { data: remaining } = await args.supabase
    .from('account_research_source_searches')
    .select('id')
    .eq('research_run_id', args.runId)
    .in('status', ['pending', 'running']);

  const done = (remaining ?? []).length === 0;
  const snapshot = done
    ? await finalizeAccountResearchRun(args.supabase, args.runId)
    : await loadAccountResearchSnapshot(args.supabase, args.runId);

  if (!snapshot) return { ok: false, error: 'Failed to load snapshot', status: 500 };
  return {
    ok: true,
    processed: true,
    sourceId: source.id,
    snapshot,
    done,
  };
}

export async function findLatestAccountResearch(
  supabase: AgentSupabase,
  retailerId: number,
  scope: AccountResearchV1Scope,
): Promise<AccountResearchSnapshot | null> {
  return findLatestUsableRun(supabase, retailerId, scope);
}
