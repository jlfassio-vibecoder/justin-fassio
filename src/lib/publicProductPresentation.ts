import { OGR_WHOLESALE_PATH } from '@/data/landing';
import {
  BEST_SELLER_BADGE_MAX_RANK,
  effectiveLifestyleThemes,
  lifestyleThemeLabel,
} from '@/lib/crmRetailTaxonomy';
import { PUBLIC_CATALOG_FORBIDDEN_KEYS, type PublicOgrProduct } from '@/lib/publicCatalog';
import {
  formatSuggestedRetailCad,
  RETAIL_PRICE_DISCLAIMER,
  typicalRetailCadRange,
} from '@/lib/wholesalePricing';

/** Public site attribution for future metadata / email presenters. */
export const OGR_PUBLIC_SITE_NAME = 'Justin Fassio';

/** Brand name for Old Guys Rule public surfaces. */
export const OGR_PUBLIC_BRAND_NAME = 'Old Guys Rule';

/** Public collection path (re-export for presenters). */
export const OGR_PUBLIC_COLLECTION_PATH = OGR_WHOLESALE_PATH;

const IMAGE_ALT_FALLBACK = 'Old Guys Rule product';

/**
 * Keys that must never appear on a PublicProductPresentation object.
 * Includes wholesale + staff catalog fields.
 */
export const PUBLIC_PRESENTATION_FORBIDDEN_KEYS = [
  'wholesaleUsd',
  'wholesale_usd',
  ...PUBLIC_CATALOG_FORBIDDEN_KEYS,
] as const;

export type PublicProductPresentation = {
  id: string;
  sku: string;
  slug: string;

  name: string;
  /** Empty string when absent. */
  tagline: string;
  /** Public sales copy; empty string when absent. */
  description: string;

  category: string;
  /** Empty string when absent. */
  color: string;

  primaryImageUrl: string | null;
  primaryImageAlt: string;
  /** Primary first, then alts; unique; non-empty only. */
  galleryImageUrls: string[];

  /** Canonical merchandise lifestyle theme codes. */
  lifestyleThemes: string[];
  /** Parallel labels for `lifestyleThemes`. */
  lifestyleThemeLabels: string[];

  salesVolumeRank: number | null;
  /** True when rank is in 1..BEST_SELLER_BADGE_MAX_RANK. */
  isBestSeller: boolean;

  isNew: boolean;
  isFeatured: boolean;

  /** Null when MSRP is not a positive finite public retail anchor. */
  suggestedRetail: {
    lowCad: number;
    highCad: number;
    display: string;
    disclaimer: string;
  } | null;

  /** Product-derived share copy (no origin). Matches [slug].astro semantics. */
  publicShareTitle: string;
  publicShareDescription: string;
};

export type PublicProductPresentationContext = {
  /** Absolute sales-volume rank (#1 = highest). Omit/null → not a best seller. */
  salesVolumeRank?: number | null;
};

function trimText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function normalizePrimaryImageUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildGalleryImageUrls(
  primaryImageUrl: string | null,
  alternateImageUrls: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [primaryImageUrl, ...alternateImageUrls]) {
    if (raw == null) continue;
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function coerceSalesVolumeRank(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  const n = Math.trunc(raw);
  if (n < 1) return null;
  return n;
}

function buildSuggestedRetail(msrpCad: number): PublicProductPresentation['suggestedRetail'] {
  const range = typicalRetailCadRange(msrpCad);
  if (!range) return null;
  const display = formatSuggestedRetailCad(msrpCad);
  if (!display) return null;
  return {
    lowCad: range.low,
    highCad: range.high,
    display,
    disclaimer: RETAIL_PRICE_DISCLAIMER,
  };
}

function buildPublicShareTitle(name: string): string {
  return `${name} | ${OGR_PUBLIC_BRAND_NAME} Wholesale | ${OGR_PUBLIC_SITE_NAME}`;
}

function buildPublicShareDescription(
  tagline: string,
  description: string,
  name: string,
  sku: string,
): string {
  if (tagline) return tagline;
  if (description) return description;
  return `${name} (${sku}) — wholesale for Canadian retailers via ${OGR_PUBLIC_SITE_NAME}.`;
}

/**
 * Pure, server-safe normalizer: PublicOgrProduct → PublicProductPresentation.
 * Never spreads the DTO. Never includes wholesale or buyer/session state.
 */
export function buildPublicProductPresentation(
  product: PublicOgrProduct,
  context: PublicProductPresentationContext = {},
): PublicProductPresentation {
  const name = trimText(product.name);
  const sku = trimText(product.sku);
  const slug = trimText(product.publicSlug);
  const tagline = trimText(product.tagline);
  const description = trimText(product.description);
  const category = trimText(product.cat);
  const color = trimText(product.color);

  const primaryImageUrl = normalizePrimaryImageUrl(product.primaryImageUrl);
  const galleryImageUrls = buildGalleryImageUrls(primaryImageUrl, product.alternateImageUrls);
  const primaryImageAlt = name || IMAGE_ALT_FALLBACK;

  const lifestyleThemes = effectiveLifestyleThemes({
    lifestyleThemes: product.lifestyleThemes,
    name,
    tagline,
    description,
  });
  const lifestyleThemeLabels = lifestyleThemes.map((theme) => lifestyleThemeLabel(theme));

  const salesVolumeRank = coerceSalesVolumeRank(context.salesVolumeRank);
  const isBestSeller = salesVolumeRank != null && salesVolumeRank <= BEST_SELLER_BADGE_MAX_RANK;

  return {
    id: product.id,
    sku,
    slug,
    name,
    tagline,
    description,
    category,
    color,
    primaryImageUrl,
    primaryImageAlt,
    galleryImageUrls,
    lifestyleThemes,
    lifestyleThemeLabels,
    salesVolumeRank,
    isBestSeller,
    isNew: product.isNew,
    isFeatured: product.featured,
    suggestedRetail: buildSuggestedRetail(product.msrpCad),
    publicShareTitle: buildPublicShareTitle(name),
    publicShareDescription: buildPublicShareDescription(tagline, description, name, sku),
  };
}
