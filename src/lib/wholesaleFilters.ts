import type { PublicOgrProduct } from '@/lib/publicCatalog';
import { effectiveLifestyleThemes, resolveRetailChannelFilter } from '@/lib/retailChannels';

export type WholesaleSort = 'recommended' | 'name' | 'category' | 'wholesale' | 'newest';

export type WholesaleFilterState = {
  q: string;
  cat: string;
  theme: string;
  sort: WholesaleSort;
};

export const DEFAULT_WHOLESALE_FILTERS: WholesaleFilterState = {
  q: '',
  cat: '',
  theme: '',
  sort: 'recommended',
};

export function parseWholesaleFilters(params: URLSearchParams): WholesaleFilterState {
  const sortRaw = params.get('sort') ?? 'recommended';
  const sort: WholesaleSort = (
    ['recommended', 'name', 'category', 'wholesale', 'newest'] as const
  ).includes(sortRaw as WholesaleSort)
    ? (sortRaw as WholesaleSort)
    : 'recommended';
  return {
    q: (params.get('q') ?? '').trim(),
    cat: (params.get('cat') ?? '').trim(),
    theme: (params.get('theme') ?? '').trim(),
    sort,
  };
}

export function wholesaleFiltersToSearchParams(filters: WholesaleFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.cat) params.set('cat', filters.cat);
  if (filters.theme) params.set('theme', filters.theme);
  if (filters.sort && filters.sort !== 'recommended') params.set('sort', filters.sort);
  return params;
}

export function filterPublicOgrProducts(
  products: PublicOgrProduct[],
  filters: WholesaleFilterState,
): PublicOgrProduct[] {
  const q = filters.q.toLowerCase();
  const theme = resolveRetailChannelFilter(filters.theme);
  let list = products.filter((p) => {
    if (filters.cat && p.cat !== filters.cat) return false;
    if (theme) {
      const channels = effectiveLifestyleThemes({
        lifestyleThemes: p.lifestyleThemes,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
      });
      if (!channels.includes(theme)) return false;
    }
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.tagline.toLowerCase().includes(q)
    );
  });

  list = [...list].sort((a, b) => {
    switch (filters.sort) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'category':
        return a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name);
      case 'wholesale':
        return (
          (a.wholesaleUsd ?? Number.POSITIVE_INFINITY) -
          (b.wholesaleUsd ?? Number.POSITIVE_INFINITY)
        );
      case 'newest':
        return Number(b.isNew) - Number(a.isNew) || a.publicSortOrder - b.publicSortOrder;
      case 'recommended':
      default:
        return (
          a.publicSortOrder - b.publicSortOrder ||
          Number(b.featured) - Number(a.featured) ||
          (a.page ?? 999) - (b.page ?? 999) ||
          a.name.localeCompare(b.name)
        );
    }
  });

  return list;
}

/** Staff sales ranks use public_sort_order below 9000 (10, 20, …). Fallback published items sit at 9000+. */
const SALES_RANK_FALLBACK_FLOOR = 9000;

/**
 * Absolute YTD sales-volume ranks (#1 = highest) for catalog items staff ranked via public_sort_order.
 * Unranked / fallback items are omitted.
 */
export function salesVolumeRankByProductId(products: PublicOgrProduct[]): Map<string, number> {
  const ranked = products
    .filter((p) => p.publicSortOrder > 0 && p.publicSortOrder < SALES_RANK_FALLBACK_FLOOR)
    .sort(
      (a, b) =>
        a.publicSortOrder - b.publicSortOrder ||
        a.name.localeCompare(b.name) ||
        a.sku.localeCompare(b.sku),
    );
  const map = new Map<string, number>();
  ranked.forEach((p, index) => {
    map.set(p.id, index + 1);
  });
  return map;
}

export function uniqueCategories(products: PublicOgrProduct[]): string[] {
  return [...new Set(products.map((p) => p.cat).filter(Boolean))].sort();
}

export function uniqueThemes(products: PublicOgrProduct[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    for (const t of p.lifestyleThemes) {
      if (t.trim()) set.add(t);
    }
  }
  return [...set].sort();
}
