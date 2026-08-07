import {
  OGR_PUBLIC_BRAND_NAME,
  OGR_PUBLIC_SITE_NAME,
  type PublicProductPresentation,
} from '@/lib/publicProductPresentation';

export type PageSeoImage = {
  /** Absolute http(s) URL only. */
  url: string;
  alt: string;
};

export type PageMetadata = {
  title: string;
  description: string;
  canonicalUrl: string;
  siteName: string;
  ogType: 'website';
  image: PageSeoImage | null;
};

const COLLECTION_TITLE = 'Old Guys Rule Wholesale Canada | Justin Fassio';
const COLLECTION_DESCRIPTION_FALLBACK =
  'Browse the Old Guys Rule wholesale collection for Canadian retailers. Men’s lifestyle apparel—request pricing and availability through Justin Fassio.';
const PRODUCT_IMAGE_ALT_FALLBACK = 'Old Guys Rule product';
const COLLECTION_IMAGE_ALT_FALLBACK = 'Old Guys Rule wholesale collection';

/** True only for http: / https: absolute URLs. */
export function isPublicAbsoluteImageUrl(url: string | null | undefined): boolean {
  if (url == null) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveSeoImage(
  url: string | null | undefined,
  alt: string,
  altFallback: string,
): PageSeoImage | null {
  if (!isPublicAbsoluteImageUrl(url)) return null;
  const resolvedAlt = collapseWhitespace(alt) || altFallback;
  return { url: (url as string).trim(), alt: resolvedAlt };
}

/**
 * Product page SEO/OG metadata from Phase 1 presentation + Phase 2 canonical URL.
 * Pure: no fetch, session, or hand-built paths.
 */
export function buildOgrProductMetadata(input: {
  presentation: PublicProductPresentation;
  canonicalUrl: string;
}): PageMetadata {
  const { presentation, canonicalUrl } = input;
  return {
    title: collapseWhitespace(presentation.publicShareTitle),
    description: collapseWhitespace(presentation.publicShareDescription),
    canonicalUrl,
    siteName: OGR_PUBLIC_SITE_NAME,
    ogType: 'website',
    image: resolveSeoImage(
      presentation.primaryImageUrl,
      presentation.primaryImageAlt,
      PRODUCT_IMAGE_ALT_FALLBACK,
    ),
  };
}

/**
 * Collection page SEO/OG metadata. Uses OGR line portfolio when available.
 */
export function buildOgrCollectionMetadata(input: {
  canonicalUrl: string;
  line?: {
    name: string | null;
    tagline: string | null;
    description: string | null;
    heroImageUrl: string | null;
  } | null;
}): PageMetadata {
  const line = input.line ?? null;
  const description =
    collapseWhitespace(line?.description ?? '') ||
    collapseWhitespace(line?.tagline ?? '') ||
    COLLECTION_DESCRIPTION_FALLBACK;
  const lineName = collapseWhitespace(line?.name ?? '') || OGR_PUBLIC_BRAND_NAME;
  const imageAlt = `${lineName} wholesale collection`;

  return {
    title: COLLECTION_TITLE,
    description,
    canonicalUrl: input.canonicalUrl,
    siteName: OGR_PUBLIC_SITE_NAME,
    ogType: 'website',
    image: resolveSeoImage(line?.heroImageUrl, imageAlt, COLLECTION_IMAGE_ALT_FALLBACK),
  };
}

/** Layout-compatible flat props; does not invent URLs. */
export function toLayoutSeoProps(metadata: PageMetadata): {
  title: string;
  description: string;
  canonicalUrl: string;
  ogImage: string | null;
  ogImageAlt: string | null;
  ogSiteName: string;
  ogType: 'website';
} {
  return {
    title: metadata.title,
    description: metadata.description,
    canonicalUrl: metadata.canonicalUrl,
    ogImage: metadata.image?.url ?? null,
    ogImageAlt: metadata.image?.alt ?? null,
    ogSiteName: metadata.siteName,
    ogType: metadata.ogType,
  };
}
