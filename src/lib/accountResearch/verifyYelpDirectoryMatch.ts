import type { AgentSupabase } from '@/lib/agentAuth';
import type { AccountResearchSnapshot } from '@/lib/accountResearch/snapshot';
import { loadAccountResearchSnapshot } from '@/lib/accountResearch/snapshot';
import { normalizeSourceUrl } from '@/lib/accountResearch/normalizeUrl';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import type { ProspectRow } from '@/types/database';
import { matchProspectToYelp, yelpBizSearchUrl } from '@/lib/yelp/businessMatch';
import type { YelpProspectMatchInput } from '@/lib/yelp/types';
import { hasYelpFusionApiKey, LOCAL_YELP_FUSION_KEY_HELP } from '@/lib/yelp/yelpFusionEnv';
import type {
  YelpBusiness,
  YelpMatchConfidence,
  YelpMatchMethod,
  YelpMatchResult,
} from '@/lib/yelp/types';
import type { AccountResearchCitation } from '@/types/database';

export type YelpDirectoryCitationMetadata = {
  yelp_id: string;
  match_method: YelpMatchMethod;
  match_score: number;
  yelp_business_url: string | null;
  candidate_count: number;
  match_confidence: YelpMatchConfidence;
  business: YelpBusiness;
};

export type VerifyYelpDirectoryMatchCode =
  | 'no_key'
  | 'no_match'
  | 'low_confidence'
  | 'run_not_found'
  | 'citation_persist_failed'
  | 'website_source_missing'
  | 'retailer_mismatch';

export type VerifyYelpDirectoryMatchResult =
  | {
      ok: true;
      match: YelpMatchResult;
      citationIds: string[];
      snapshot: AccountResearchSnapshot;
    }
  | {
      ok: false;
      error: string;
      code: VerifyYelpDirectoryMatchCode;
      match?: YelpMatchResult | null;
    };

function mapYelpConfidenceToCitation(confidence: YelpMatchConfidence): 'high' | 'medium' | 'low' {
  return confidence;
}

function buildDirectoryCitationExcerpt(business: YelpBusiness): string {
  return [
    business.phone ? `Phone: ${business.phone}` : '',
    business.address1 || business.city
      ? `Address: ${[business.address1, business.city, business.state, business.postalCode].filter(Boolean).join(', ')}`
      : '',
    business.isClaimed != null ? `Claimed: ${business.isClaimed ? 'yes' : 'no'}` : '',
    business.categories.length > 0 ? `Categories: ${business.categories.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildYelpDirectoryCitationMetadata(
  match: YelpMatchResult,
): YelpDirectoryCitationMetadata {
  return {
    yelp_id: match.business.id,
    match_method: match.matchMethod,
    match_score: match.score,
    yelp_business_url: match.business.businessUrl,
    candidate_count: match.candidateCount,
    match_confidence: match.confidence,
    business: match.business,
  };
}

export function yelpMatchFromDirectoryCitation(
  citation: AccountResearchCitation,
): YelpMatchResult | null {
  if (citation.platform !== 'directory' || citation.acceptance_status !== 'accepted') {
    return null;
  }
  const meta = citation.provider_metadata as Partial<YelpDirectoryCitationMetadata> | null;
  const business = meta?.business;
  if (!business?.id || !business.name || !meta) return null;
  return {
    business,
    confidence: meta.match_confidence ?? citation.confidence,
    matchMethod: meta.match_method ?? 'business_match',
    score: meta.match_score ?? 0,
    reasons: ['Persisted Yelp directory citation'],
    candidateCount: meta.candidate_count ?? 1,
    viableCandidateCount: 1,
  };
}

export function findLatestAcceptedDirectoryCitation(
  citations: ReadonlyArray<AccountResearchCitation>,
): AccountResearchCitation | null {
  const accepted = citations
    .filter((c) => c.platform === 'directory' && c.acceptance_status === 'accepted')
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  return accepted[0] ?? null;
}

export function findDirectoryCitationForRun(
  snapshot: AccountResearchSnapshot,
): AccountResearchCitation | null {
  return findLatestAcceptedDirectoryCitation(Object.values(snapshot.citationsBySourceId).flat());
}

export function findYelpBusinessUrlHint(snapshot: AccountResearchSnapshot): string | null {
  const citation = findDirectoryCitationForRun(snapshot);
  if (!citation) return null;
  const meta = citation.provider_metadata as Partial<YelpDirectoryCitationMetadata> | null;
  const url = meta?.yelp_business_url ?? meta?.business?.businessUrl ?? null;
  return url?.trim() || null;
}

export async function loadPersistedYelpMatchForRetailer(
  supabase: AgentSupabase,
  retailerId: number,
): Promise<YelpMatchResult | null> {
  const { data, error } = await supabase
    .from('account_research_citations')
    .select('*')
    .eq('retailer_id', retailerId)
    .eq('platform', 'directory')
    .eq('acceptance_status', 'accepted')
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return yelpMatchFromDirectoryCitation(data as AccountResearchCitation);
}

function websiteSourceForRun(snapshot: AccountResearchSnapshot) {
  return snapshot.sources.find((s) => s.source_type === 'website') ?? null;
}

async function fetchProspectForRun(
  supabase: AgentSupabase,
  retailerId: number,
): Promise<Prospect | null> {
  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', retailerId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProspectRow(data as ProspectRow);
}

function prospectToYelpInput(prospect: Prospect): YelpProspectMatchInput {
  return {
    name: prospect.name,
    address: prospect.address,
    city: prospect.city,
    postalCode: prospect.postalCode,
    phone: prospect.phone,
  };
}

export async function loadYelpBusinessUrlHintForRun(
  supabase: AgentSupabase,
  runId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('account_research_citations')
    .select('provider_metadata')
    .eq('research_run_id', runId)
    .eq('platform', 'directory')
    .eq('acceptance_status', 'accepted')
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const meta = data.provider_metadata as Partial<YelpDirectoryCitationMetadata> | null;
  const url = meta?.yelp_business_url ?? meta?.business?.businessUrl ?? null;
  return url?.trim() || null;
}

/** Staff-triggered Yelp Fusion verify — persists accepted directory citation on the run. */
export async function verifyYelpDirectoryMatchOnRun(
  supabase: AgentSupabase,
  runId: string,
): Promise<VerifyYelpDirectoryMatchResult> {
  const snapshot = await loadAccountResearchSnapshot(supabase, runId);
  if (!snapshot) {
    return { ok: false, error: 'Research run not found', code: 'run_not_found' };
  }

  const websiteSource = websiteSourceForRun(snapshot);
  if (!websiteSource) {
    return {
      ok: false,
      error: 'Website source row missing for this research run',
      code: 'website_source_missing',
    };
  }

  if (!hasYelpFusionApiKey()) {
    return { ok: false, error: LOCAL_YELP_FUSION_KEY_HELP, code: 'no_key' };
  }

  const prospect = await fetchProspectForRun(supabase, snapshot.run.retailer_id);
  if (!prospect) {
    return { ok: false, error: 'Retailer not found', code: 'retailer_mismatch' };
  }

  let match: YelpMatchResult | null;
  try {
    match = await matchProspectToYelp(prospectToYelpInput(prospect));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Yelp match failed',
      code: 'no_match',
      match: null,
    };
  }

  if (!match) {
    return { ok: false, error: 'No Yelp directory match found', code: 'no_match', match: null };
  }

  if (match.confidence === 'low') {
    return {
      ok: false,
      error: `Yelp match confidence too low (${match.confidence}) — verify manually before using`,
      code: 'low_confidence',
      match,
    };
  }

  const listingUrl = yelpBizSearchUrl(match.business);
  const normalizedUrl = normalizeSourceUrl(listingUrl) ?? listingUrl;
  const metadata = buildYelpDirectoryCitationMetadata(match);
  const observedAt = new Date().toISOString();

  const { error: deleteError } = await supabase
    .from('account_research_citations')
    .delete()
    .eq('source_search_id', websiteSource.id)
    .eq('platform', 'directory');

  if (deleteError) {
    return { ok: false, error: deleteError.message, code: 'citation_persist_failed' };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('account_research_citations')
    .insert({
      source_search_id: websiteSource.id,
      research_run_id: snapshot.run.id,
      retailer_id: snapshot.run.retailer_id,
      source_url: listingUrl,
      source_url_normalized: normalizedUrl,
      title: match.business.categories.length
        ? `${match.business.name} · ${match.business.categories.join(', ')}`
        : match.business.name,
      platform: 'directory',
      published_at: null,
      observed_at: observedAt,
      excerpt: buildDirectoryCitationExcerpt(match.business),
      confidence: mapYelpConfidenceToCitation(match.confidence),
      identity_confidence: snapshot.run.identity_confidence,
      acceptance_status: 'accepted',
      acceptance_basis: 'staff',
      provider_metadata: metadata,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return {
      ok: false,
      error: insertError?.message ?? 'Failed to save directory citation',
      code: 'citation_persist_failed',
    };
  }

  const refreshed = await loadAccountResearchSnapshot(supabase, runId);
  if (!refreshed) {
    return {
      ok: false,
      error: 'Citation saved but failed to reload research snapshot',
      code: 'citation_persist_failed',
    };
  }

  return {
    ok: true,
    match,
    citationIds: [inserted.id as string],
    snapshot: refreshed,
  };
}
