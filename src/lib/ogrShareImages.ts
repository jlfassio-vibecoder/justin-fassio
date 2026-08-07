import { isPublicAbsoluteImageUrl, type PageSeoImage } from '@/lib/ogrPageMetadata';
import {
  OGR_PUBLIC_BRAND_NAME,
  type PublicProductPresentation,
} from '@/lib/publicProductPresentation';

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function absoluteImage(url: string | null | undefined, alt: string): PageSeoImage | null {
  if (!isPublicAbsoluteImageUrl(url)) return null;
  return { url: (url as string).trim(), alt };
}

function productShareAlt(presentation: PublicProductPresentation): string {
  const name = collapseWhitespace(presentation.name);
  const existing = collapseWhitespace(presentation.primaryImageAlt);
  if (existing.toLowerCase().startsWith(OGR_PUBLIC_BRAND_NAME.toLowerCase())) {
    return existing;
  }
  if (name) return `${OGR_PUBLIC_BRAND_NAME} ${name}`;
  return existing || `${OGR_PUBLIC_BRAND_NAME} product`;
}

/**
 * Product share image: absolute primary → absolute OGR line hero → omit.
 */
export function resolveOgrProductShareImage(input: {
  presentation: PublicProductPresentation;
  lineHeroImageUrl?: string | null;
}): PageSeoImage | null {
  const alt = productShareAlt(input.presentation);
  const primary = absoluteImage(input.presentation.primaryImageUrl, alt);
  if (primary) return primary;

  const heroAlt = `${OGR_PUBLIC_BRAND_NAME} wholesale collection`;
  return absoluteImage(input.lineHeroImageUrl, heroAlt);
}

/**
 * Collection share image: absolute line hero → omit.
 */
export function resolveOgrCollectionShareImage(input: {
  lineName?: string | null;
  lineHeroImageUrl?: string | null;
}): PageSeoImage | null {
  const lineName = collapseWhitespace(input.lineName ?? '') || OGR_PUBLIC_BRAND_NAME;
  const alt = `${lineName} wholesale collection`;
  return absoluteImage(input.lineHeroImageUrl, alt);
}
