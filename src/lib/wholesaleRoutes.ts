import type { PublicOgrProduct } from '@/lib/publicCatalog';

/**
 * Returns a 404 Response when the public product is missing; otherwise null
 * so the Astro page can continue rendering.
 */
export function missingPublicOgrProductResponse(product: PublicOgrProduct | null): Response | null {
  if (product) return null;
  return new Response(null, { status: 404, statusText: 'Not Found' });
}
