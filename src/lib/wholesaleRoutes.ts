import type { PublicOgrProduct } from '@/lib/publicCatalog';

/**
 * Resolve the HTTP response for a public product-by-slug fetch.
 * - RPC / transport failure → 503 (retryable)
 * - Missing product → 404
 * - Found → null (page continues rendering)
 */
export function resolvePublicOgrProductPageResponse(args: {
  product: PublicOgrProduct | null;
  error: string | null;
}): Response | null {
  if (args.error) {
    return new Response('Wholesale catalog temporarily unavailable. Please try again shortly.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (!args.product) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }
  return null;
}
