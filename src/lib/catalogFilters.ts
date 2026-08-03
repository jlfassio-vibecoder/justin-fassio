import type { CatalogItem } from '@/lib/catalog';

export type CatalogFlagFilter = 'ALL' | 'NEW' | 'NAMEDROP';

export interface CatalogFilterOptions {
  search: string;
  category: string;
  flag: CatalogFlagFilter;
}

export function filterCatalogItems(
  items: CatalogItem[],
  { search, category, flag }: CatalogFilterOptions,
): CatalogItem[] {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    if (category !== 'ALL' && item.cat !== category) return false;
    if (flag === 'NEW' && !item.isNew) return false;
    if (flag === 'NAMEDROP' && !item.isNameDrop) return false;
    if (q) {
      const hay = `${item.sku} ${item.name} ${item.tagline} ${item.color}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
