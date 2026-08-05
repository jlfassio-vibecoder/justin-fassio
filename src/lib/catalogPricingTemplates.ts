/** Category wholesale matrices from ogr-2026-catalog-description.md (templates only — not SKU backfill). */

export type SizeBandTemplate = {
  sizeGroup: string;
  wholesaleUsd: number;
};

export type CategoryPricingTemplate = {
  id: string;
  label: string;
  categoryMatch: string | RegExp;
  bands: SizeBandTemplate[];
};

export const CATEGORY_PRICING_TEMPLATES: CategoryPricingTemplate[] = [
  {
    id: 'sst',
    label: 'Short Sleeve Tees (M–XL / 2X / 3X)',
    categoryMatch: /short sleeve tee/i,
    bands: [
      { sizeGroup: 'M-XL', wholesaleUsd: 13 },
      { sizeGroup: '2X', wholesaleUsd: 14 },
      { sizeGroup: '3X', wholesaleUsd: 15 },
    ],
  },
  {
    id: 'upf50',
    label: 'UPF50 Long Sleeve',
    categoryMatch: /upf50|sun tee/i,
    bands: [
      { sizeGroup: 'M-XL', wholesaleUsd: 18.5 },
      { sizeGroup: '2X', wholesaleUsd: 19.5 },
    ],
  },
];

export function templatesForCategory(category: string): CategoryPricingTemplate[] {
  return CATEGORY_PRICING_TEMPLATES.filter((t) =>
    typeof t.categoryMatch === 'string'
      ? category.toLowerCase().includes(t.categoryMatch.toLowerCase())
      : t.categoryMatch.test(category),
  );
}
