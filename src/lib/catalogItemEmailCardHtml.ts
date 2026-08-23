import { catalogItemToPublicOgrProduct, type CatalogItem } from '@/lib/catalog';
import { renderOgrProductEmailCard } from '@/lib/ogrProductEmailCard';
import { buildPublicProductPresentation } from '@/lib/publicProductPresentation';
import type { PublicMarket } from '@/lib/pricingMarket';
import { buildOgrCollectionUrl, tryBuildOgrProductUrl } from '@/lib/productUrls';

/** Render product email card HTML for composer preview (client-only). */
export function buildCatalogItemEmailCardHtml(
  item: CatalogItem,
  publicMarket: PublicMarket = 'ca',
): string {
  if (typeof window === 'undefined') return '';
  const href = tryBuildOgrProductUrl(
    (item.publicSlug ?? '').trim(),
    window.location.origin,
    publicMarket,
  );
  if (!href) return '';
  const catalogHref = buildOgrCollectionUrl(window.location.origin, publicMarket);
  const presentation = buildPublicProductPresentation(catalogItemToPublicOgrProduct(item), {
    publicMarket,
  });
  return renderOgrProductEmailCard(presentation, { href, catalogHref });
}
