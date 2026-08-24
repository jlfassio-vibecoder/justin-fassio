import type { AgentSupabase } from '@/lib/agentAuth';
import { hostnameFromUrl } from '@/lib/enrichGuidance';
import { mapOutcomeCitations } from '@/lib/accountResearch/citationRows';
import {
  ACCOUNT_RESEARCH_PROSPECT_SELECT,
  buildAccountResearchContext,
  isSocialPlatform,
  mapProspectRowForResearch,
  mergeWebsiteSocialCache,
  readWebsiteSocialCache,
} from '@/lib/accountResearch/context';
import type { AccountResearchPlatformScope } from '@/lib/accountResearch/constants';
import { ACCOUNT_RESEARCH_PROVIDER } from '@/lib/accountResearch/constants';
import { fetchOfficialWebsiteSocialLinks } from '@/lib/accountResearch/officialWebsiteSocialLinks';
import { normalizeSourceUrl } from '@/lib/accountResearch/normalizeUrl';
import { computeFinalRunStatus } from '@/lib/accountResearch/orchestrate';
import { executeAccountResearchSourceSearch } from '@/lib/accountResearch/provider';
import {
  loadAccountResearchSnapshot,
  type AccountResearchSnapshot,
} from '@/lib/accountResearch/snapshot';
import type { SocialSearchOutcome } from '@/lib/accountResearch/socialSourceSearch';
import type { AccountResearchRun, AccountResearchSourceSearch } from '@/types/database';

export type LockSourceResult =
  | { ok: true; snapshot: AccountResearchSnapshot | null }
  | { ok: false; error: string; status: number };

async function findLatestRun(
  supabase: AgentSupabase,
  retailerId: number,
): Promise<AccountResearchRun | null> {
  const { data, error } = await supabase
    .from('account_research_runs')
    .select('*')
    .eq('retailer_id', retailerId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error || !data || data.length === 0) return null;
  const runs = data as AccountResearchRun[];
  return (
    [...runs].sort((a, b) => {
      const aKey = a.completed_at ?? a.created_at;
      const bKey = b.completed_at ?? b.created_at;
      return aKey < bKey ? 1 : aKey > bKey ? -1 : 0;
    })[0] ?? null
  );
}

function isTerminalSource(status: AccountResearchSourceSearch['status']): boolean {
  return (
    status === 'succeeded' ||
    status === 'none_indexed' ||
    status === 'blocked' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

async function persistOutcomeOntoSource(args: {
  supabase: AgentSupabase;
  run: AccountResearchRun;
  source: AccountResearchSourceSearch;
  lockedUrl: string;
  identityConfidence: AccountResearchRun['identity_confidence'];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const prospectResult = await args.supabase
    .from('prospects')
    .select(ACCOUNT_RESEARCH_PROSPECT_SELECT)
    .eq('id', args.run.retailer_id)
    .maybeSingle();
  if (prospectResult.error || !prospectResult.data) {
    return { ok: false, error: prospectResult.error?.message ?? 'Retailer not found' };
  }

  const prospectMapped = mapProspectRowForResearch(
    prospectResult.data as Parameters<typeof mapProspectRowForResearch>[0],
  );
  const researchCtx = buildAccountResearchContext({
    prospect: prospectMapped,
    resolvedWebsite:
      args.source.source_type === 'website' ? args.lockedUrl : args.run.resolved_website,
  });
  const websiteSocialLinks = readWebsiteSocialCache(
    (args.run.provider_metadata as Record<string, unknown> | null) ?? {},
  );

  const outcome = await executeAccountResearchSourceSearch({
    sourceType: args.source.source_type as AccountResearchPlatformScope,
    ctx: researchCtx,
    websiteSocialLinks,
    lockedUrl: args.lockedUrl,
  });

  const isSocial = isSocialPlatform(args.source.source_type as AccountResearchPlatformScope);
  const socialOutcome = isSocial ? (outcome as SocialSearchOutcome) : null;
  const citationPayload = mapOutcomeCitations({
    citations: outcome.citations,
    isSocial,
    lockedUrl: args.lockedUrl,
    identityConfidence: args.identityConfidence,
    attributedHandle: socialOutcome?.confirmedProfile?.handle ?? null,
  });

  const providerMetadata = {
    ...outcome.providerMetadata,
    ...(socialOutcome?.socialMetadata ?? {}),
  };

  const runIsActive = args.run.status === 'running' || args.run.status === 'pending';
  if (args.source.status === 'running' && runIsActive) {
    const { error } = await args.supabase.rpc('complete_account_research_source_search', {
      p_source_search_id: args.source.id,
      p_status: outcome.status,
      p_query_text: outcome.queryText,
      p_resolved_public_url: args.lockedUrl,
      p_error: outcome.error,
      p_provider: ACCOUNT_RESEARCH_PROVIDER,
      p_provider_metadata: providerMetadata,
      p_citations: citationPayload,
      p_research_brief: outcome.brief,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  await args.supabase
    .from('account_research_citations')
    .delete()
    .eq('source_search_id', args.source.id);

  if (citationPayload.length > 0) {
    const { error: insertError } = await args.supabase.from('account_research_citations').insert(
      citationPayload.map((row) => ({
        ...row,
        source_search_id: args.source.id,
        research_run_id: args.run.id,
        retailer_id: args.run.retailer_id,
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  const { error: updateError } = await args.supabase
    .from('account_research_source_searches')
    .update({
      status: outcome.status,
      query_text: outcome.queryText,
      resolved_public_url: args.lockedUrl,
      error: outcome.error,
      provider: ACCOUNT_RESEARCH_PROVIDER,
      provider_metadata: providerMetadata,
      result_count: citationPayload.length,
      completed_at: new Date().toISOString(),
    })
    .eq('id', args.source.id);
  if (updateError) return { ok: false, error: updateError.message };

  if (args.source.source_type === 'website' && outcome.brief) {
    await args.supabase
      .from('account_research_runs')
      .update({ research_brief: outcome.brief.slice(0, 4000) })
      .eq('id', args.run.id);
  }

  return { ok: true };
}

async function applyWebsiteLockIdentity(args: {
  supabase: AgentSupabase;
  run: AccountResearchRun;
  lockedUrl: string;
}): Promise<void> {
  const lockedHost = hostnameFromUrl(args.lockedUrl);
  let runProviderMetadata = (args.run.provider_metadata as Record<string, unknown> | null) ?? {};

  if (lockedHost) {
    try {
      const fetched = await fetchOfficialWebsiteSocialLinks({
        officialHostname: lockedHost,
        websiteUrl: args.lockedUrl,
      });
      runProviderMetadata = mergeWebsiteSocialCache(runProviderMetadata, fetched.links);
      runProviderMetadata.website_fetch_url = fetched.fetchUrl;
    } catch (err) {
      runProviderMetadata.website_fetch_error =
        err instanceof Error ? err.message.slice(0, 200) : 'Website fetch failed';
    }
  }

  await args.supabase
    .from('account_research_runs')
    .update({
      identity_confidence: 'high',
      identity_review_status: 'staff_confirmed',
      identity_resolution: 'Staff locked official website',
      resolved_website: args.lockedUrl,
      provider_metadata: runProviderMetadata,
    })
    .eq('id', args.run.id);
}

async function recomputeTerminalRunStatus(supabase: AgentSupabase, runId: string): Promise<void> {
  const snapshot = await loadAccountResearchSnapshot(supabase, runId);
  if (!snapshot) return;
  if (snapshot.run.status === 'running' || snapshot.run.status === 'pending') return;
  const status = computeFinalRunStatus({
    identity: { identity_confidence: snapshot.run.identity_confidence },
    sources: snapshot.sources,
  });
  await supabase
    .from('account_research_runs')
    .update({
      status,
      identity_review_status:
        status === 'needs_identity_review' ? 'pending' : snapshot.run.identity_review_status,
    })
    .eq('id', runId);
}

export async function lockAccountResearchSourceAndRefresh(args: {
  supabase: AgentSupabase;
  retailerId: number;
  sourceType: AccountResearchPlatformScope;
  url: string;
}): Promise<LockSourceResult> {
  const normalized = normalizeSourceUrl(args.url);
  if (!normalized) {
    return { ok: false, error: 'URL is required and must be a public http(s) URL', status: 400 };
  }

  const { data, error } = await args.supabase.rpc('lock_account_research_source', {
    p_retailer_id: args.retailerId,
    p_source_type: args.sourceType,
    p_url: normalized,
  });
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data || (typeof data === 'object' && (data as { ok?: boolean }).ok === false)) {
    return { ok: false, error: 'Lock failed', status: 500 };
  }

  const run = await findLatestRun(args.supabase, args.retailerId);
  if (!run) return { ok: true, snapshot: null };

  if (args.sourceType === 'website') {
    await applyWebsiteLockIdentity({
      supabase: args.supabase,
      run,
      lockedUrl: normalized,
    });
  }

  const snapshotBefore = await loadAccountResearchSnapshot(args.supabase, run.id);
  const source = snapshotBefore?.sources.find((s) => s.source_type === args.sourceType) ?? null;

  if (source && isTerminalSource(source.status)) {
    const refreshedRun = (await loadAccountResearchSnapshot(args.supabase, run.id))?.run ?? run;
    const persist = await persistOutcomeOntoSource({
      supabase: args.supabase,
      run: refreshedRun,
      source,
      lockedUrl: normalized,
      identityConfidence: args.sourceType === 'website' ? 'high' : refreshedRun.identity_confidence,
    });
    if (!persist.ok) return { ok: false, error: persist.error, status: 500 };
    await recomputeTerminalRunStatus(args.supabase, run.id);
  }

  const snapshot = await loadAccountResearchSnapshot(args.supabase, run.id);
  return { ok: true, snapshot };
}

export async function unlockAccountResearchSourceAndClear(args: {
  supabase: AgentSupabase;
  retailerId: number;
  sourceType: AccountResearchPlatformScope;
}): Promise<LockSourceResult> {
  const { error } = await args.supabase.rpc('unlock_account_research_source', {
    p_retailer_id: args.retailerId,
    p_source_type: args.sourceType,
  });
  if (error) return { ok: false, error: error.message, status: 500 };

  const run = await findLatestRun(args.supabase, args.retailerId);
  if (!run) return { ok: true, snapshot: null };

  const snapshotBefore = await loadAccountResearchSnapshot(args.supabase, run.id);
  const source = snapshotBefore?.sources.find((s) => s.source_type === args.sourceType) ?? null;
  if (source) {
    await args.supabase
      .from('account_research_citations')
      .delete()
      .eq('source_search_id', source.id);
    await args.supabase
      .from('account_research_source_searches')
      .update({
        resolved_public_url: null,
        result_count: 0,
      })
      .eq('id', source.id);
  }

  if (args.sourceType === 'website') {
    await args.supabase
      .from('account_research_runs')
      .update({
        identity_confidence: 'unresolved',
        identity_review_status: 'pending',
        identity_resolution: null,
        resolved_website: null,
      })
      .eq('id', run.id);
  }

  await recomputeTerminalRunStatus(args.supabase, run.id);
  const snapshot = await loadAccountResearchSnapshot(args.supabase, run.id);
  return { ok: true, snapshot };
}
