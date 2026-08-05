import { describe, expect, it } from 'vitest';
import { resolvePublicOgrProductPageResponse } from '@/lib/wholesaleRoutes';
import type { PublicOgrProduct } from '@/lib/publicCatalog';

const product = {
  id: '11111111-1111-1111-1111-111111111111',
  sku: 'OG1',
  publicSlug: 'sample-og1',
  name: 'Sample',
} as PublicOgrProduct;

describe('resolvePublicOgrProductPageResponse', () => {
  it('returns 503 when the public RPC fails', () => {
    const res = resolvePublicOgrProductPageResponse({
      product: null,
      error: 'connection refused',
    });
    expect(res?.status).toBe(503);
  });

  it('returns 404 when product is missing without an RPC error', () => {
    const res = resolvePublicOgrProductPageResponse({ product: null, error: null });
    expect(res?.status).toBe(404);
  });

  it('returns null when product exists so the page can render', () => {
    expect(resolvePublicOgrProductPageResponse({ product, error: null })).toBeNull();
  });
});
