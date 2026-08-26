import { generateObject } from 'ai';
import { z } from 'zod';
import type { AgentSupabase } from '@/lib/agentAuth';
import { collectAcceptedCitations } from '@/lib/accountResearch/suggestions';
import { isUsableFreshRun } from '@/lib/accountResearch/freshness';
import { loadAccountResearchSnapshot } from '@/lib/accountResearch/snapshot';
import { staffGatewayModel } from '@/lib/aiGatewayEnv';
import { AGENT_OUTREACH_PRODUCT_DEDUP_DAYS } from '@/lib/outreachSelectionConstants';
import {
  classifyMatchPoolEmpty,
  loadOutreachProductPool,
  selectProductsForProspect,
  type OutreachProductCandidate,
  type ProductFitKind,
} from '@/lib/outreachProductSelection';
import { coercePrimaryRetailChannel, normalizePrimaryChannels } from '@/lib/crmRetailTaxonomy';
import { mapProspectRow, PROSPECT_SELECT, type Prospect } from '@/lib/prospects';
import { fetchRecentProductOutreachCatalogIdsByProspect } from '@/lib/systemMessages';
import type {
  AccountProductMatchEmptyReason,
  AccountProductMatchRun,
  AccountProductMatchRunStatus,
  AccountResearchCitation,
  ProspectRow,
} from '@/types/database';

export type MatchItemPayload = {
  catalog_item_id: string;
  rank: 1 | 2 | 3;
  rationale: string;
  product_fit: ProductFitKind;
  citation_ids: string[];
};

export type MatchBlockOutcome =
  | 'not_found'
  | 'stale_research'
  | 'identity_unresolved'
  | 'no_accepted_evidence'
  | 'superseded_run';

export type MatchItemResponse = {
  id: string;
  rank: number;
  catalog_item_id: string;
  sku: string;
  name: string;
  product_fit: ProductFitKind;
  rationale: string;
  citation_ids: string[];
};

export type CreateProductMatchResult =
  | {
      ok: true;
      outcome: 'matched';
      run: AccountProductMatchRun;
      items: MatchItemResponse[];
    }
  | {
      ok: true;
      outcome: 'empty';
      run: AccountProductMatchRun;
      items: [];
      empty_reason: AccountProductMatchEmptyReason;
    }
  | {
      ok: false;
      outcome: MatchBlockOutcome | 'invalid_line' | 'match_failed' | 'no_products_after_ranking';
      error: string;
      status: number;
      run?: AccountProductMatchRun;
    };

const modelMatchSchema = z.object({
  items: z
    .array(
      z.object({
        catalog_item_id: z.uuid(),
        rationale: z.string().max(500),
        citation_ids: z.array(z.uuid()).min(1),
      }),
    )
    .max(3),
});

const CONFIDENCE_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

function mapRpcError(message: string): { outcome: string; status: number } {
  if (/Run not found/i.test(message)) return { outcome: 'not_found', status: 404 };
  if (/INVALID_CATALOG_ITEM/i.test(message)) return { outcome: 'invalid_line', status: 400 };
  if (/INVALID_CITATIONS/i.test(message)) return { outcome: 'match_failed', status: 502 };
  if (/INVALID_ITEMS/i.test(message)) return { outcome: 'match_failed', status: 502 };
  return { outcome: 'match_failed', status: 500 };
}

function prospectChannels(prospect: Prospect) {
  return normalizePrimaryChannels([
    coercePrimaryRetailChannel(prospect.category),
    ...prospect.secondaryChannels.map((ch) => coercePrimaryRetailChannel(ch)),
  ]);
}

function sortCitationsForFallback(
  citations: ReadonlyArray<AccountResearchCitation>,
): AccountResearchCitation[] {
  const platformPriority = (platform: string) => {
    if (platform === 'website') return 3;
    if (platform === 'shopify') return 2;
    return 1;
  };
  return [...citations].sort(
    (a, b) =>
      platformPriority(b.platform) - platformPriority(a.platform) ||
      (CONFIDENCE_ORDER[b.confidence] ?? 0) - (CONFIDENCE_ORDER[a.confidence] ?? 0),
  );
}

function fallbackRationale(
  product: OutreachProductCandidate,
  productFit: ProductFitKind,
  citations: ReadonlyArray<AccountResearchCitation>,
): { rationale: string; citation_ids: string[] } {
  const sorted = sortCitationsForFallback(citations);
  const citation_ids = sorted.slice(0, 2).map((c) => c.id);
  const fitLabel =
    productFit === 'channel_intersect'
      ? 'channel fit with the retailer profile'
      : 'broad catalog fit';
  return {
    rationale: `Recommend ${product.name} (${product.sku}) based on ${fitLabel} and accepted research evidence.`,
    citation_ids: citation_ids.length > 0 ? citation_ids : [sorted[0]!.id],
  };
}

function buildEvidencePrompt(citations: ReadonlyArray<AccountResearchCitation>): string {
  return citations
    .slice(0, 12)
    .map(
      (c) =>
        `- citation_id=${c.id} platform=${c.platform} url=${c.source_url} title=${c.title ?? ''} excerpt=${(c.excerpt ?? '').slice(0, 160)}`,
    )
    .join('\n');
}

async function attachRationales(args: {
  picks: Array<{ product: OutreachProductCandidate; productFit: ProductFitKind }>;
  citations: ReadonlyArray<AccountResearchCitation>;
  prospect: Prospect;
  useModel?: boolean;
}): Promise<MatchItemPayload[]> {
  const acceptedIds = new Set(args.citations.map((c) => c.id));
  const shortlistIds = new Set(args.picks.map((p) => p.product.id));

  if (args.useModel !== false && args.picks.length > 0) {
    try {
      const prompt = [
        'Write short product match rationales using only the evidence provided.',
        `Retailer: ${args.prospect.name}; city=${args.prospect.city}; region=${args.prospect.region}`,
        'Candidates:',
        ...args.picks.map(
          (p, i) =>
            `${i + 1}. catalog_item_id=${p.product.id} sku=${p.product.sku} name=${p.product.name} channels=${p.product.recommendedChannels.join(',')} themes=${p.product.lifestyleThemes.join(',')}`,
        ),
        'Evidence:',
        buildEvidencePrompt(args.citations),
      ].join('\n');

      const result = await generateObject({
        model: staffGatewayModel(),
        schema: modelMatchSchema,
        schemaName: 'AccountProductMatchItems',
        prompt,
      });

      const byCatalogId = new Map(
        result.object.items
          .filter((item) => shortlistIds.has(item.catalog_item_id))
          .filter((item) => item.citation_ids.every((id) => acceptedIds.has(id)))
          .map((item) => [item.catalog_item_id, item] as const),
      );

      const modeled: MatchItemPayload[] = [];
      for (let i = 0; i < args.picks.length; i += 1) {
        const pick = args.picks[i]!;
        const modelItem = byCatalogId.get(pick.product.id);
        if (!modelItem) continue;
        modeled.push({
          catalog_item_id: pick.product.id,
          rank: (i + 1) as 1 | 2 | 3,
          rationale: modelItem.rationale.slice(0, 500),
          product_fit: pick.productFit,
          citation_ids: modelItem.citation_ids,
        });
      }
      if (modeled.length === args.picks.length) return modeled;
    } catch {
      // Fall through to template rationales.
    }
  }

  return args.picks.map((pick, index) => {
    const fallback = fallbackRationale(pick.product, pick.productFit, args.citations);
    return {
      catalog_item_id: pick.product.id,
      rank: (index + 1) as 1 | 2 | 3,
      rationale: fallback.rationale,
      product_fit: pick.productFit,
      citation_ids: fallback.citation_ids,
    };
  });
}

export async function assertResearchEligibleForMatch(
  supabase: AgentSupabase,
  args: { researchRunId: string; retailerId: number },
): Promise<
  | {
      ok: true;
      snapshot: NonNullable<Awaited<ReturnType<typeof loadAccountResearchSnapshot>>>;
      citations: AccountResearchCitation[];
    }
  | { ok: false; outcome: MatchBlockOutcome; error: string; status: number }
> {
  const snapshot = await loadAccountResearchSnapshot(supabase, args.researchRunId);
  if (!snapshot || snapshot.run.retailer_id !== args.retailerId) {
    return { ok: false, outcome: 'not_found', error: 'Run not found', status: 404 };
  }

  if (!isUsableFreshRun(snapshot.run)) {
    return {
      ok: false,
      outcome: 'stale_research',
      error: 'Research run is stale; refresh before matching products',
      status: 409,
    };
  }

  if (snapshot.run.identity_confidence !== 'high') {
    return {
      ok: false,
      outcome: 'identity_unresolved',
      error: 'Identity review required before product matching',
      status: 409,
    };
  }

  const { count } = await supabase
    .from('account_research_runs')
    .select('id', { count: 'exact', head: true })
    .eq('supersedes_run_id', args.researchRunId);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      outcome: 'superseded_run',
      error: 'This research run has been superseded',
      status: 409,
    };
  }

  const citations = collectAcceptedCitations(snapshot.citationsBySourceId);
  if (citations.length === 0) {
    return {
      ok: false,
      outcome: 'no_accepted_evidence',
      error: 'No accepted citations available for product matching',
      status: 409,
    };
  }

  return { ok: true, snapshot, citations };
}

async function persistMatchRun(args: {
  supabase: AgentSupabase;
  retailerId: number;
  salesLineId: string;
  researchRunId: string;
  status: AccountProductMatchRunStatus;
  emptyReason?: AccountProductMatchEmptyReason | null;
  items?: MatchItemPayload[];
}): Promise<
  { ok: true; matchRunId: string } | { ok: false; error: string; status: number; outcome?: string }
> {
  const { data, error } = await args.supabase.rpc('persist_account_product_match_run', {
    p_retailer_id: args.retailerId,
    p_sales_line_id: args.salesLineId,
    p_research_run_id: args.researchRunId,
    p_status: args.status,
    p_empty_reason: args.emptyReason ?? undefined,
    p_items: (args.items ?? []).map((item) => ({
      catalog_item_id: item.catalog_item_id,
      rank: item.rank,
      rationale: item.rationale,
      product_fit: item.product_fit,
      citation_ids: item.citation_ids,
    })),
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    return { ok: false, error: error.message, status: mapped.status, outcome: mapped.outcome };
  }

  const matchRunId =
    data && typeof data === 'object' && 'match_run_id' in data
      ? String((data as { match_run_id: string }).match_run_id)
      : '';
  if (!matchRunId) {
    return { ok: false, error: 'Persist RPC returned no match_run_id', status: 500 };
  }
  return { ok: true, matchRunId };
}

async function loadMatchRunResponse(
  supabase: AgentSupabase,
  matchRunId: string,
): Promise<{ run: AccountProductMatchRun; items: MatchItemResponse[] } | null> {
  const { data: run, error: runError } = await supabase
    .from('account_product_match_runs')
    .select('*')
    .eq('id', matchRunId)
    .maybeSingle();
  if (runError || !run) return null;

  const { data: itemRows } = await supabase
    .from('account_product_match_items')
    .select('*')
    .eq('match_run_id', matchRunId)
    .order('rank', { ascending: true });
  const items = itemRows ?? [];
  if (items.length === 0) {
    return { run: run as AccountProductMatchRun, items: [] };
  }

  const itemIds = items.map((i) => i.id);
  const { data: junctions } = await supabase
    .from('account_product_match_item_citations')
    .select('match_item_id, citation_id')
    .in('match_item_id', itemIds);

  const citationsByItem = new Map<string, string[]>();
  for (const junction of junctions ?? []) {
    const list = citationsByItem.get(junction.match_item_id) ?? [];
    list.push(junction.citation_id);
    citationsByItem.set(junction.match_item_id, list);
  }

  const catalogIds = items.map((i) => i.catalog_item_id);
  const { data: catalogRows } = await supabase
    .from('catalog_items')
    .select('id, sku, name')
    .in('id', catalogIds);
  const catalogById = new Map((catalogRows ?? []).map((row) => [row.id, row] as const));

  return {
    run: run as AccountProductMatchRun,
    items: items.map((item) => {
      const catalog = catalogById.get(item.catalog_item_id);
      return {
        id: item.id,
        rank: item.rank,
        catalog_item_id: item.catalog_item_id,
        sku: catalog?.sku ?? '',
        name: catalog?.name ?? '',
        product_fit: item.product_fit as ProductFitKind,
        rationale: item.rationale,
        citation_ids: citationsByItem.get(item.id) ?? [],
      };
    }),
  };
}

async function persistEmptyMatchRun(args: {
  supabase: AgentSupabase;
  retailerId: number;
  salesLineId: string;
  researchRunId: string;
  emptyReason: AccountProductMatchEmptyReason;
}): Promise<CreateProductMatchResult> {
  const persist = await persistMatchRun({
    supabase: args.supabase,
    retailerId: args.retailerId,
    salesLineId: args.salesLineId,
    researchRunId: args.researchRunId,
    status: 'empty',
    emptyReason: args.emptyReason,
    items: [],
  });
  if (!persist.ok) {
    return {
      ok: false,
      outcome: 'match_failed',
      error: persist.error,
      status: persist.status,
    };
  }

  const loaded = await loadMatchRunResponse(args.supabase, persist.matchRunId);
  if (!loaded) {
    return {
      ok: false,
      outcome: 'match_failed',
      error: 'Match run not found after persist',
      status: 500,
    };
  }

  return {
    ok: true,
    outcome: 'empty',
    run: loaded.run,
    items: [],
    empty_reason: args.emptyReason,
  };
}

export async function createAccountProductMatch(args: {
  supabase: AgentSupabase;
  retailerId: number;
  salesLineId: string;
  researchRunId: string;
  ignoreRecentSendDedup?: boolean;
  useModel?: boolean;
}): Promise<CreateProductMatchResult> {
  const eligible = await assertResearchEligibleForMatch(args.supabase, {
    researchRunId: args.researchRunId,
    retailerId: args.retailerId,
  });
  if (!eligible.ok) {
    if (eligible.outcome === 'identity_unresolved' || eligible.outcome === 'no_accepted_evidence') {
      const emptyReason: AccountProductMatchEmptyReason =
        eligible.outcome === 'identity_unresolved' ? 'identity_unresolved' : 'no_accepted_evidence';
      return persistEmptyMatchRun({
        supabase: args.supabase,
        retailerId: args.retailerId,
        salesLineId: args.salesLineId,
        researchRunId: args.researchRunId,
        emptyReason,
      });
    }

    if (eligible.outcome === 'stale_research') {
      const persist = await persistMatchRun({
        supabase: args.supabase,
        retailerId: args.retailerId,
        salesLineId: args.salesLineId,
        researchRunId: args.researchRunId,
        status: 'stale_research',
        items: [],
      });
      if (persist.ok) {
        const loaded = await loadMatchRunResponse(args.supabase, persist.matchRunId);
        return {
          ok: false,
          outcome: 'stale_research',
          error: eligible.error,
          status: eligible.status,
          run: loaded?.run,
        };
      }
    }

    return {
      ok: false,
      outcome: eligible.outcome,
      error: eligible.error,
      status: eligible.status,
    };
  }

  const { data: line, error: lineError } = await args.supabase
    .from('lines')
    .select('id')
    .eq('id', args.salesLineId)
    .maybeSingle();
  if (lineError || !line) {
    return { ok: false, outcome: 'invalid_line', error: 'Sales line not found', status: 400 };
  }

  const poolResult = await loadOutreachProductPool(args.supabase, { lineId: args.salesLineId });
  if (!poolResult.ok) {
    return { ok: false, outcome: 'match_failed', error: poolResult.error, status: 500 };
  }

  let excludeCatalogItemIds: ReadonlySet<string> | undefined;
  if (args.ignoreRecentSendDedup !== true) {
    const dedup = await fetchRecentProductOutreachCatalogIdsByProspect(
      args.supabase,
      [args.retailerId],
      AGENT_OUTREACH_PRODUCT_DEDUP_DAYS,
    );
    if (!dedup.ok) {
      return { ok: false, outcome: 'match_failed', error: dedup.error, status: 500 };
    }
    excludeCatalogItemIds = dedup.byProspectId.get(args.retailerId);
  }

  const emptyReason = classifyMatchPoolEmpty(poolResult.pool, excludeCatalogItemIds);
  if (emptyReason) {
    return persistEmptyMatchRun({
      supabase: args.supabase,
      retailerId: args.retailerId,
      salesLineId: args.salesLineId,
      researchRunId: args.researchRunId,
      emptyReason,
    });
  }

  const { data: prospectRow, error: prospectError } = await args.supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', args.retailerId)
    .maybeSingle();
  if (prospectError || !prospectRow) {
    return { ok: false, outcome: 'match_failed', error: 'Retailer not found', status: 500 };
  }

  const prospect = mapProspectRow(prospectRow as ProspectRow);
  const picks = selectProductsForProspect(
    poolResult.pool,
    {
      prospectChannels: prospectChannels(prospect),
      prospectLifestyleThemes: prospect.lifestyleThemes,
      excludeCatalogItemIds,
    },
    3,
  );

  if (picks.length === 0) {
    return persistEmptyMatchRun({
      supabase: args.supabase,
      retailerId: args.retailerId,
      salesLineId: args.salesLineId,
      researchRunId: args.researchRunId,
      emptyReason: 'no_eligible_products',
    });
  }

  const items = await attachRationales({
    picks,
    citations: eligible.citations,
    prospect,
    useModel: args.useModel,
  });

  const persist = await persistMatchRun({
    supabase: args.supabase,
    retailerId: args.retailerId,
    salesLineId: args.salesLineId,
    researchRunId: args.researchRunId,
    status: 'succeeded',
    items,
  });
  if (!persist.ok) {
    return {
      ok: false,
      outcome: 'match_failed',
      error: persist.error,
      status: persist.status,
    };
  }

  const loaded = await loadMatchRunResponse(args.supabase, persist.matchRunId);
  if (!loaded) {
    return {
      ok: false,
      outcome: 'match_failed',
      error: 'Match run not found after persist',
      status: 500,
    };
  }

  return {
    ok: true,
    outcome: 'matched',
    run: loaded.run,
    items: loaded.items,
  };
}
