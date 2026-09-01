import { generateObject } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import { staffGatewayModel } from '@/lib/aiGatewayEnv';
import { isUsableFreshRun } from '@/lib/accountResearch/freshness';
import { loadAccountResearchSnapshot } from '@/lib/accountResearch/snapshot';
import {
  canSuggestField,
  citationMatchesFieldPlatforms,
  isSuggestionFieldPath,
  mergeJsonArraySuggestion,
  normalizeScalarSuggestion,
  normalizeSuggestionWebsite,
  prospectBaselineValue,
  SUGGESTION_FIELD_DEFS,
  SUGGESTION_FIELD_PATHS,
  type SuggestionFieldPath,
  valuesEqualForSuggestion,
} from '@/lib/accountResearch/suggestionFields';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import {
  findLatestAcceptedDirectoryCitation,
  yelpMatchFromDirectoryCitation,
  type YelpDirectoryCitationMetadata,
} from '@/lib/accountResearch/verifyYelpDirectoryMatch';
import { buildBlankOnlyProspectPatch } from '@/lib/yelp/mapYelpToProspectPatch';
import type {
  AccountResearchCitation,
  AccountResearchProfileSuggestion,
  ProspectRow,
} from '@/types/database';

export type GeneratedSuggestionPayload = {
  field_path: SuggestionFieldPath;
  suggested_value: unknown;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  citation_ids: string[];
  baseline_value: unknown;
};

export type GenerationBlockOutcome =
  'not_found' | 'ineligible_run' | 'identity_review_required' | 'stale_research' | 'superseded_run';

export type GenerateSuggestionsResult =
  | { ok: true; outcome: 'generated' | 'empty'; suggestions: GeneratedSuggestionPayload[] }
  | {
      ok: false;
      outcome:
        | 'not_found'
        | 'ineligible_run'
        | 'identity_review_required'
        | 'stale_research'
        | 'superseded_run'
        | 'generation_failed';
      error: string;
      status: number;
    };

export type PersistSuggestionsResult =
  { ok: true; inserted: number } | { ok: false; error: string; status: number; outcome?: string };

export type SuggestionWithCitations = AccountResearchProfileSuggestion & {
  citations: AccountResearchCitation[];
  currentValue: unknown;
  baselineValue: unknown;
};

const modelSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      field_path: z.string(),
      suggested_value: z.union([z.string(), z.array(z.string())]),
      rationale: z.string().max(500),
      confidence: z.enum(['high', 'medium', 'low']),
      citation_ids: z.array(z.uuid()).min(1),
    }),
  ),
});

function mapRpcError(message: string): { outcome: string; status: number } {
  if (/INELIGIBLE_RUN/i.test(message)) return { outcome: 'ineligible_run', status: 409 };
  if (/IDENTITY_REVIEW_REQUIRED/i.test(message))
    return { outcome: 'identity_review_required', status: 409 };
  if (/SUPERSEDED_RUN/i.test(message)) return { outcome: 'superseded_run', status: 409 };
  if (/FORBIDDEN_FIELD/i.test(message)) return { outcome: 'forbidden_field', status: 400 };
  if (/INVALID_CITATIONS/i.test(message)) return { outcome: 'invalid_citations', status: 400 };
  return { outcome: 'error', status: 500 };
}

export function collectAcceptedCitations(
  citationsBySourceId: Record<string, AccountResearchCitation[]>,
): AccountResearchCitation[] {
  const out: AccountResearchCitation[] = [];
  for (const list of Object.values(citationsBySourceId)) {
    for (const citation of list) {
      if (citation.acceptance_status !== 'accepted') continue;
      if (!citation.source_url?.trim()) continue;
      out.push(citation);
    }
  }
  return out;
}

function pickWebsiteSuggestion(
  prospect: Prospect,
  citations: ReadonlyArray<AccountResearchCitation>,
): GeneratedSuggestionPayload | null {
  const websiteCitations = citations.filter((c) =>
    citationMatchesFieldPlatforms(c.platform, 'website'),
  );
  const best = websiteCitations.find((c) => c.platform === 'website') ?? websiteCitations[0];
  if (!best) return null;

  const normalized = normalizeSuggestionWebsite(best.source_url);
  if (!normalized) return null;
  if (!canSuggestField(prospect, 'website', normalized)) return null;

  return {
    field_path: 'website',
    suggested_value: normalized,
    rationale: `Official website cited from ${best.platform} search (${best.title ?? best.source_url}).`,
    confidence: best.confidence,
    citation_ids: [best.id],
    baseline_value: prospectBaselineValue(prospect, 'website'),
  };
}

const DIRECTORY_IDENTITY_FIELDS = ['phone', 'address', 'city', 'postal_code'] as const;

type DirectoryIdentityField = (typeof DIRECTORY_IDENTITY_FIELDS)[number];

function directoryFieldPath(key: string): DirectoryIdentityField | null {
  if ((DIRECTORY_IDENTITY_FIELDS as readonly string[]).includes(key)) {
    return key as DirectoryIdentityField;
  }
  return null;
}

/** Deterministic blank-only identity suggestions from accepted Yelp directory citations. */
export function pickDirectoryIdentitySuggestions(
  prospect: Prospect,
  citations: ReadonlyArray<AccountResearchCitation>,
): GeneratedSuggestionPayload[] {
  const directoryCitation = findLatestAcceptedDirectoryCitation(citations);
  if (!directoryCitation) return [];

  const match = yelpMatchFromDirectoryCitation(directoryCitation);
  if (!match) return [];

  const meta = directoryCitation.provider_metadata as Partial<YelpDirectoryCitationMetadata> | null;
  const confidence = meta?.match_confidence ?? directoryCitation.confidence;

  const { patch } = buildBlankOnlyProspectPatch(
    {
      phone: prospect.phone,
      address: prospect.address,
      city: prospect.city,
      postal_code: prospect.postalCode,
      website: prospect.website,
    },
    match.business,
  );

  const out: GeneratedSuggestionPayload[] = [];
  for (const [key, value] of Object.entries(patch) as [keyof typeof patch, string][]) {
    const fieldPath = directoryFieldPath(key);
    if (!fieldPath || !value) continue;
    if (!citationMatchesFieldPlatforms(directoryCitation.platform, fieldPath)) continue;
    if (!canSuggestField(prospect, fieldPath, value)) continue;

    out.push({
      field_path: fieldPath,
      suggested_value: value,
      rationale: `Yelp directory match (${confidence}) — blank CRM field only.`,
      confidence,
      citation_ids: [directoryCitation.id],
      baseline_value: prospectBaselineValue(prospect, fieldPath),
    });
  }

  return out;
}

function buildEvidencePrompt(citations: ReadonlyArray<AccountResearchCitation>): string {
  const byPlatform = new Map<string, AccountResearchCitation[]>();
  for (const citation of citations) {
    const list = byPlatform.get(citation.platform) ?? [];
    list.push(citation);
    byPlatform.set(citation.platform, list);
  }

  const lines: string[] = [];
  for (const [platform, list] of byPlatform.entries()) {
    lines.push(`Platform: ${platform}`);
    for (const c of list.slice(0, 5)) {
      lines.push(
        `- citation_id=${c.id} url=${c.source_url} title=${c.title ?? ''} excerpt=${(c.excerpt ?? '').slice(0, 200)}`,
      );
    }
  }
  return lines.join('\n');
}

async function inferModelSuggestions(args: {
  prospect: Prospect;
  citations: ReadonlyArray<AccountResearchCitation>;
  acceptedIds: Set<string>;
}): Promise<GeneratedSuggestionPayload[]> {
  const modelPaths = SUGGESTION_FIELD_PATHS.filter((path) => path !== 'website');
  const prompt = [
    'Extract retailer profile field suggestions from the citation evidence only.',
    'Do not invent values not supported by excerpts.',
    'Never claim the business is inactive or closed because social platforms returned no results.',
    'Use only citation_ids from the evidence list.',
    `Allowed field_path values: ${modelPaths.join(', ')}`,
    `Retailer: ${args.prospect.name}; city=${args.prospect.city}; region=${args.prospect.region}`,
    'Evidence:',
    buildEvidencePrompt(args.citations),
  ].join('\n');

  const result = await generateObject({
    model: staffGatewayModel(),
    schema: modelSuggestionSchema,
    schemaName: 'AccountResearchProfileSuggestions',
    prompt,
  });

  const citationsById = new Map(args.citations.map((citation) => [citation.id, citation]));
  const out: GeneratedSuggestionPayload[] = [];
  for (const item of result.object.suggestions) {
    if (!isSuggestionFieldPath(item.field_path) || item.field_path === 'website') continue;
    const fieldPath = item.field_path;
    if (
      !item.citation_ids.every((id) => {
        const citation = citationsById.get(id);
        return (
          citation != null &&
          args.acceptedIds.has(id) &&
          citationMatchesFieldPlatforms(citation.platform, fieldPath)
        );
      })
    ) {
      continue;
    }

    const def = SUGGESTION_FIELD_DEFS[fieldPath];
    let suggested: unknown;
    if (def.kind === 'scalar') {
      suggested = normalizeScalarSuggestion(fieldPath, item.suggested_value);
      if (!suggested) continue;
    } else {
      const additions = Array.isArray(item.suggested_value)
        ? item.suggested_value
        : [String(item.suggested_value)];
      suggested = mergeJsonArraySuggestion(fieldPath, args.prospect, additions);
      if (!suggested) continue;
    }

    if (!canSuggestField(args.prospect, fieldPath, suggested)) continue;

    out.push({
      field_path: fieldPath,
      suggested_value: suggested,
      rationale: item.rationale.slice(0, 500),
      confidence: item.confidence,
      citation_ids: item.citation_ids,
      baseline_value: prospectBaselineValue(args.prospect, fieldPath),
    });
  }
  return out;
}

export async function buildGeneratedSuggestions(args: {
  prospect: Prospect;
  citations: ReadonlyArray<AccountResearchCitation>;
  useModel?: boolean;
}): Promise<GeneratedSuggestionPayload[]> {
  const acceptedIds = new Set(args.citations.map((c) => c.id));
  const out: GeneratedSuggestionPayload[] = [];

  const website = pickWebsiteSuggestion(args.prospect, args.citations);
  if (website) out.push(website);

  for (const row of pickDirectoryIdentitySuggestions(args.prospect, args.citations)) {
    if (!out.some((s) => s.field_path === row.field_path)) out.push(row);
  }

  if (args.useModel !== false && args.citations.length > 0) {
    try {
      const modelRows = await inferModelSuggestions({
        prospect: args.prospect,
        citations: args.citations,
        acceptedIds,
      });
      for (const row of modelRows) {
        if (out.some((s) => s.field_path === row.field_path)) continue;
        out.push(row);
      }
    } catch {
      // Model failure is non-fatal when deterministic website suggestion exists.
    }
  }

  return out.filter((row, index, list) => {
    const dup = list.findIndex((other) => other.field_path === row.field_path);
    return dup === index;
  });
}

export async function assertRunEligibleForGeneration(
  supabase: AgentSupabase,
  runId: string,
): Promise<
  | { ok: true; snapshot: NonNullable<Awaited<ReturnType<typeof loadAccountResearchSnapshot>>> }
  | { ok: false; outcome: GenerationBlockOutcome; error: string; status: number }
> {
  const snapshot = await loadAccountResearchSnapshot(supabase, runId);
  if (!snapshot) {
    return { ok: false, outcome: 'not_found', error: 'Run not found', status: 404 };
  }

  if (!['succeeded', 'partial'].includes(snapshot.run.status)) {
    return { ok: false, outcome: 'ineligible_run', error: 'Run is not completed', status: 409 };
  }

  if (snapshot.run.identity_confidence !== 'high') {
    return {
      ok: false,
      outcome: 'identity_review_required',
      error: 'Identity review required before generating suggestions',
      status: 409,
    };
  }

  if (!isUsableFreshRun(snapshot.run)) {
    return {
      ok: false,
      outcome: 'stale_research',
      error: 'Research run is stale; refresh before generating new suggestions',
      status: 409,
    };
  }

  const { count } = await supabase
    .from('account_research_runs')
    .select('id', { count: 'exact', head: true })
    .eq('supersedes_run_id', runId);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      outcome: 'superseded_run',
      error: 'This research run has been superseded',
      status: 409,
    };
  }

  return { ok: true, snapshot };
}

export async function generateAccountResearchSuggestions(args: {
  supabase: AgentSupabase;
  runId: string;
  forceRegenerate?: boolean;
  useModel?: boolean;
}): Promise<GenerateSuggestionsResult> {
  const eligible = await assertRunEligibleForGeneration(args.supabase, args.runId);
  if (!eligible.ok) {
    return {
      ok: false,
      outcome: eligible.outcome,
      error: eligible.error,
      status: eligible.status,
    };
  }

  const snapshot = eligible.snapshot!;
  const citations = collectAcceptedCitations(snapshot.citationsBySourceId);
  if (citations.length === 0) {
    return { ok: true, outcome: 'empty', suggestions: [] };
  }

  const { data: prospectRow, error: prospectError } = await args.supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', snapshot.run.retailer_id)
    .maybeSingle();
  if (prospectError || !prospectRow) {
    return { ok: false, outcome: 'generation_failed', error: 'Retailer not found', status: 500 };
  }

  const prospect = mapProspectRow(prospectRow as ProspectRow);
  let suggestions: GeneratedSuggestionPayload[];
  try {
    suggestions = await buildGeneratedSuggestions({ prospect, citations, useModel: args.useModel });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Suggestion generation failed';
    return { ok: false, outcome: 'generation_failed', error: message, status: 502 };
  }

  if (suggestions.length === 0) {
    return { ok: true, outcome: 'empty', suggestions: [] };
  }

  const persist = await persistAccountResearchSuggestions({
    supabase: args.supabase,
    runId: args.runId,
    forceRegenerate: args.forceRegenerate === true,
    suggestions,
  });
  if (!persist.ok) {
    return {
      ok: false,
      outcome: 'generation_failed',
      error: persist.error,
      status: persist.status,
    };
  }

  return { ok: true, outcome: 'generated', suggestions };
}

export async function persistAccountResearchSuggestions(args: {
  supabase: AgentSupabase;
  runId: string;
  forceRegenerate: boolean;
  suggestions: GeneratedSuggestionPayload[];
}): Promise<PersistSuggestionsResult> {
  const payload = args.suggestions.map((s) => ({
    field_path: s.field_path,
    suggested_value: s.suggested_value,
    baseline_value: s.baseline_value,
    rationale: s.rationale,
    confidence: s.confidence,
    citation_ids: s.citation_ids,
  }));

  const { data, error } = await args.supabase.rpc('persist_account_research_profile_suggestions', {
    p_run_id: args.runId,
    p_force_regenerate: args.forceRegenerate,
    p_suggestions: payload,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    return { ok: false, error: error.message, status: mapped.status, outcome: mapped.outcome };
  }

  const inserted =
    data && typeof data === 'object' && 'inserted' in data
      ? Number((data as { inserted: number }).inserted)
      : 0;
  return { ok: true, inserted };
}

export async function loadRunSuggestions(
  supabase: AgentSupabase,
  runId: string,
): Promise<{ ok: true; suggestions: SuggestionWithCitations[] } | { ok: false; error: string }> {
  const { data: rows, error } = await supabase
    .from('account_research_profile_suggestions')
    .select('*')
    .eq('research_run_id', runId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const suggestions = (rows ?? []) as AccountResearchProfileSuggestion[];
  if (suggestions.length === 0) return { ok: true, suggestions: [] };

  const suggestionIds = suggestions.map((s) => s.id);
  const { data: junctions } = await supabase
    .from('account_research_suggestion_citations')
    .select('suggestion_id, citation_id')
    .in('suggestion_id', suggestionIds);

  const citationIds = [...new Set((junctions ?? []).map((j) => j.citation_id))];
  let citations: AccountResearchCitation[] = [];
  if (citationIds.length > 0) {
    const { data: citationRows } = await supabase
      .from('account_research_citations')
      .select('*')
      .in('id', citationIds);
    citations = (citationRows ?? []) as AccountResearchCitation[];
  }
  const citationById = new Map(citations.map((c) => [c.id, c]));

  const retailerId = suggestions[0]?.retailer_id;
  const { data: prospectRow } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', retailerId)
    .maybeSingle();
  const prospect = prospectRow ? mapProspectRow(prospectRow as ProspectRow) : null;

  const bySuggestion = new Map<string, AccountResearchCitation[]>();
  for (const junction of junctions ?? []) {
    const citation = citationById.get(junction.citation_id);
    if (!citation) continue;
    const list = bySuggestion.get(junction.suggestion_id) ?? [];
    list.push(citation);
    bySuggestion.set(junction.suggestion_id, list);
  }

  return {
    ok: true,
    suggestions: suggestions.map((s) => ({
      ...s,
      citations: bySuggestion.get(s.id) ?? [],
      currentValue: prospect
        ? prospectBaselineValue(prospect, s.field_path as SuggestionFieldPath)
        : null,
      baselineValue: s.baseline_value,
    })),
  };
}

export function filterNoOpSuggestions(
  prospect: Prospect,
  suggestions: GeneratedSuggestionPayload[],
): GeneratedSuggestionPayload[] {
  return suggestions.filter((s) => {
    if (!canSuggestField(prospect, s.field_path, s.suggested_value)) return false;
    return !valuesEqualForSuggestion(
      prospectBaselineValue(prospect, s.field_path),
      s.suggested_value,
    );
  });
}
