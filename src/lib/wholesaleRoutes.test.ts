import { describe, expect, it } from 'vitest';
import { missingPublicOgrProductResponse } from '@/lib/wholesaleRoutes';
import type { PublicOgrProduct } from '@/lib/publicCatalog';

const product = {
  id: '11111111-1111-1111-1111-111111111111',
  sku: 'OG1',
  publicSlug: 'sample-og1',
  name: 'Sample',
} as PublicOgrProduct;

describe('missingPublicOgrProductResponse', () => {
  it('returns 404 when product is null', () => {
    const res = missingPublicOgrProductResponse(null);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(404);
    expect(res?.statusText).toBe('Not Found');
  });

  it('returns null when product exists so the page can render', () => {
    expect(missingPublicOgrProductResponse(product)).toBeNull();
  });
});
