import type { CatalogItem } from '@/lib/catalog';

export type CatalogFlagFilter = 'ALL' | 'NEW' | 'NAMEDROP';

/** Shared Line Sheet / account product-email picker category dropdown. */
export const CATALOG_CATEGORY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'Short Sleeve Tees', label: 'Short Sleeve Tees' },
  { value: 'Long Sleeve UPF50 Sun Tees', label: 'UPF50 Sun Protection Shirts' },
  { value: 'Special Additions', label: 'Long Sleeve Tees, Tanks & Hoodies' },
  { value: 'Headwear', label: 'Headwear' },
  { value: 'Giftware', label: 'Giftware & Drinkware' },
  { value: 'Vintage Metal Signs', label: 'Vintage Metal Signs' },
  { value: 'Displays & POP', label: 'Displays & POP' },
  { value: 'Magnets & Stickers', label: 'Magnets & Stickers' },
];

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
