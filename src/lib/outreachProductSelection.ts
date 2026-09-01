/**
 * Phase 1 product pool: published OGR Top-N (absolute sales rank) OR New.
 * Upgrade path later: denormalized outreach_pool flag — v1 is query-derived only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  coercePrimaryRetailChannel,
  normalizePrimaryChannels,
  type PrimaryRetailChannel,
} from '@/lib/crmRetailTaxonomy';
import {
  AGENT_OUTREACH_SALES_RANK_FALLBACK_FLOOR,
  AGENT_OUTREACH_TOP_RANK_LIMIT,
} from '@/lib/outreachSelectionConstants';
import type { ProductWeightSource } from '@/lib/outreachProductWeights';
import { salesVolumeRankByProductId } from '@/lib/wholesaleFilters';
import type { Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const OUTREACH_PRODUCT_POOL_SELECT =
  'id, sku, name, public_slug, status, is_publicly_published, is_new, public_sort_order, recommended_channels, lifestyle_themes, line_id' as const;

export type OutreachProductCandidate = {
  id: string;
  sku: string;
  name: string;
  publicSlug: string;
  isNew: boolean;
  publicSortOrder: number;
  recommendedChannels: PrimaryRetailChannel[];
  lifestyleThemes: string[];
  salesRank: number | null;
};

export type ProductFitKind = 'channel_intersect' | 'global_fallback';

export type SelectProductInput = {
  prospectChannels: PrimaryRetailChannel[];
  prospectLifestyleThemes?: string[];
  excludeCatalogItemIds?: ReadonlySet<string>;
  productWeights?: ReadonlyMap<string, number>;
  globalProductWeight?: number;
  productWeightSource?: ProductWeightSource;
  /** Active accounts: prefer invoice top-volume catalog ids when present in pool. */
  preferredCatalogItemIds?: readonly string[];
};

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function isPublishedOgrPoolRow(row: {
  status: string;
  is_publicly_published: boolean;
  public_slug: string | null;
}): boolean {
  return (
    row.status === 'active' &&
    row.is_publicly_published === true &&
    Boolean(row.public_slug?.trim())
  );
}

export function buildOutreachProductPool(
  rows: Array<{
    id: string;
    sku: string;
    name: string;
    public_slug: string | null;
    status: string;
    is_publicly_published: boolean;
    is_new: boolean;
    public_sort_order: number | null;
    recommended_channels: unknown;
    lifestyle_themes: unknown;
  }>,
  options: { topRankLimit?: number } = {},
): OutreachProductCandidate[] {
  const topRankLimit = options.topRankLimit ?? AGENT_OUTREACH_TOP_RANK_LIMIT;
  const published = rows.filter(isPublishedOgrPoolRow).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    publicSlug: (row.public_slug ?? '').trim(),
    isNew: row.is_new === true,
    publicSortOrder: row.public_sort_order ?? 0,
    recommendedChannels: normalizePrimaryChannels(asStringArray(row.recommended_channels)),
    lifestyleThemes: asStringArray(row.lifestyle_themes),
  }));

  const ranks = salesVolumeRankByProductId(
    published.map((p) => ({
      id: p.id,
      publicSortOrder: p.publicSortOrder,
      name: p.name,
      sku: p.sku,
    })),
  );

  return published
    .map((p) => ({
      ...p,
      salesRank: ranks.get(p.id) ?? null,
    }))
    .filter((p) => (p.salesRank != null && p.salesRank <= topRankLimit) || p.isNew)
    .sort(
      (a, b) =>
        (a.salesRank ?? AGENT_OUTREACH_SALES_RANK_FALLBACK_FLOOR) -
          (b.salesRank ?? AGENT_OUTREACH_SALES_RANK_FALLBACK_FLOOR) ||
        Number(b.isNew) - Number(a.isNew) ||
        a.name.localeCompare(b.name) ||
        a.sku.localeCompare(b.sku),
    );
}

function channelIntersect(
  productChannels: PrimaryRetailChannel[],
  prospectChannels: PrimaryRetailChannel[],
): boolean {
  if (productChannels.length === 0 || prospectChannels.length === 0) return false;
  const set = new Set(prospectChannels);
  return productChannels.some((ch) => set.has(ch));
}

function themeOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(b.map((t) => t.trim().toLowerCase()).filter(Boolean));
  let n = 0;
  for (const t of a) {
    if (set.has(t.trim().toLowerCase())) n += 1;
  }
  return n;
}

function comparePoolCandidates(
  a: OutreachProductCandidate,
  b: OutreachProductCandidate,
  prospectThemes: string[],
): number {
  const rankA = a.salesRank ?? AGENT_OUTREACH_SALES_RANK_FALLBACK_FLOOR;
  const rankB = b.salesRank ?? AGENT_OUTREACH_SALES_RANK_FALLBACK_FLOOR;
  return (
    rankA - rankB ||
    Number(b.isNew) - Number(a.isNew) ||
    themeOverlap(b.lifestyleThemes, prospectThemes) -
      themeOverlap(a.lifestyleThemes, prospectThemes) ||
    a.name.localeCompare(b.name) ||
    a.sku.localeCompare(b.sku)
  );
}

function filterExcludedProducts(
  pool: OutreachProductCandidate[],
  excludeCatalogItemIds?: ReadonlySet<string>,
): OutreachProductCandidate[] {
  if (!excludeCatalogItemIds || excludeCatalogItemIds.size === 0) return pool;
  return pool.filter((p) => !excludeCatalogItemIds.has(p.id));
}

function compareWithProductWeights(
  a: OutreachProductCandidate,
  b: OutreachProductCandidate,
  prospectThemes: string[],
  options: {
    productWeights?: ReadonlyMap<string, number>;
    globalWeight?: number;
    productWeightSource?: ProductWeightSource;
  },
): number {
  if (
    options.productWeightSource === 'measured' &&
    options.productWeights &&
    options.globalWeight != null
  ) {
    const fallback = options.globalWeight;
    const wA = options.productWeights.get(a.id) ?? fallback;
    const wB = options.productWeights.get(b.id) ?? fallback;
    if (wB !== wA) return wB - wA;
  }
  return comparePoolCandidates(a, b, prospectThemes);
}

/**
 * Prefer channel-intersect products; else weak global (empty recommended channels);
 * else first remaining by rank / New / name.
 */
export function selectProductForProspect(
  pool: OutreachProductCandidate[],
  input: SelectProductInput,
): { product: OutreachProductCandidate; productFit: ProductFitKind } | null {
  const eligiblePool = filterExcludedProducts(pool, input.excludeCatalogItemIds);
  if (eligiblePool.length === 0) return null;

  if (input.preferredCatalogItemIds?.length) {
    for (const catalogItemId of input.preferredCatalogItemIds) {
      const preferred = eligiblePool.find((p) => p.id === catalogItemId);
      if (preferred) {
        return { product: preferred, productFit: 'channel_intersect' };
      }
    }
  }

  const prospectChannels = normalizePrimaryChannels(
    input.prospectChannels.map((ch) => coercePrimaryRetailChannel(ch)),
  );
  const themes = input.prospectLifestyleThemes ?? [];
  const weightOptions = {
    productWeights: input.productWeights,
    globalWeight: input.globalProductWeight,
    productWeightSource: input.productWeightSource,
  };
  const compare = (a: OutreachProductCandidate, b: OutreachProductCandidate) =>
    compareWithProductWeights(a, b, themes, weightOptions);

  const intersecting = eligiblePool
    .filter((p) => channelIntersect(p.recommendedChannels, prospectChannels))
    .sort(compare);
  if (intersecting[0]) {
    return { product: intersecting[0], productFit: 'channel_intersect' };
  }

  const weakGlobal = eligiblePool.filter((p) => p.recommendedChannels.length === 0).sort(compare);
  if (weakGlobal[0]) {
    return { product: weakGlobal[0], productFit: 'global_fallback' };
  }

  const remaining = [...eligiblePool].sort(compare);
  return remaining[0] ? { product: remaining[0], productFit: 'global_fallback' } : null;
}

export function classifyMatchPoolEmpty(
  pool: OutreachProductCandidate[],
  excludeCatalogItemIds?: ReadonlySet<string>,
): 'no_eligible_products' | 'all_recently_emailed' | null {
  if (pool.length === 0) return 'no_eligible_products';
  const eligible = filterExcludedProducts(pool, excludeCatalogItemIds);
  if (eligible.length === 0) return 'all_recently_emailed';
  return null;
}

/** Greedy multi-pick: up to maxItems distinct SKUs using selectProductForProspect ranking. */
export function selectProductsForProspect(
  pool: OutreachProductCandidate[],
  input: SelectProductInput,
  maxItems = 3,
): Array<{ product: OutreachProductCandidate; productFit: ProductFitKind }> {
  const picks: Array<{ product: OutreachProductCandidate; productFit: ProductFitKind }> = [];
  const exclude = new Set(input.excludeCatalogItemIds ?? []);
  let remaining = [...pool];

  for (let rank = 0; rank < maxItems; rank += 1) {
    const pick = selectProductForProspect(remaining, { ...input, excludeCatalogItemIds: exclude });
    if (!pick) break;
    picks.push(pick);
    exclude.add(pick.product.id);
    remaining = remaining.filter((p) => p.id !== pick.product.id);
  }

  return picks;
}

/** Load published catalog rows for a line and build Top-N OR New pool. Defaults to OGR. */
export async function loadOutreachProductPool(
  client: DbClient,
  options: { topRankLimit?: number; lineId?: string; lineCode?: string } = {},
): Promise<{ ok: true; pool: OutreachProductCandidate[] } | { ok: false; error: string }> {
  let lineId = options.lineId?.trim() || null;

  if (!lineId) {
    const code = (options.lineCode?.trim() || 'ogr').toLowerCase();
    const { data: line, error: lineError } = await client
      .from('lines')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (lineError) {
      return { ok: false, error: lineError.message };
    }
    if (!line) {
      return {
        ok: false,
        error: code === 'ogr' ? 'Old Guys Rule line not found' : `Line not found: ${code}`,
      };
    }
    lineId = line.id;
  }

  const { data, error } = await client
    .from('catalog_items')
    .select(OUTREACH_PRODUCT_POOL_SELECT)
    .eq('line_id', lineId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    pool: buildOutreachProductPool(data ?? [], options),
  };
}
