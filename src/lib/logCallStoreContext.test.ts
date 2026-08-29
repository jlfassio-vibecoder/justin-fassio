import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fetchLogCallSocialLinks,
  formatTelHref,
  normalizeExternalUrl,
} from '@/lib/logCallStoreContext';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe('formatTelHref', () => {
  it('builds tel href from formatted numbers', () => {
    expect(formatTelHref('(541) 555-1212')).toBe('tel:5415551212');
    expect(formatTelHref('+1 541-555-1212')).toBe('tel:+15415551212');
  });

  it('keeps only a single leading plus', () => {
    expect(formatTelHref('+1+541-555-1212')).toBe('tel:+15415551212');
    expect(formatTelHref('1+541+555')).toBe('tel:1541555');
  });

  it('returns null for blank', () => {
    expect(formatTelHref('')).toBeNull();
    expect(formatTelHref('   ')).toBeNull();
    expect(formatTelHref(null)).toBeNull();
    expect(formatTelHref('+')).toBeNull();
  });
});

describe('normalizeExternalUrl', () => {
  it('adds https when missing', () => {
    expect(normalizeExternalUrl('instagram.com/shop')).toBe('https://instagram.com/shop');
  });

  it('keeps existing scheme', () => {
    expect(normalizeExternalUrl('https://facebook.com/shop')).toBe('https://facebook.com/shop');
  });
});

describe('fetchLogCallSocialLinks', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('maps locked social platforms and skips website/shopify', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { source_type: 'instagram', locked_url: 'instagram.com/coast' },
        { source_type: 'website', locked_url: 'https://coast.example' },
        { source_type: 'facebook', locked_url: 'https://facebook.com/coast' },
        { source_type: 'shopify', locked_url: 'https://coast.myshopify.com' },
      ],
      error: null,
    });
    fromMock.mockReturnValue({
      select: () => ({ eq }),
    });

    const result = await fetchLogCallSocialLinks(10);
    expect(fromMock).toHaveBeenCalledWith('account_research_source_locks');
    expect(result.error).toBeNull();
    expect(result.data.map((l) => l.sourceType)).toEqual(['facebook', 'instagram']);
    expect(result.data[0]?.url).toBe('https://facebook.com/coast');
    expect(result.data[1]?.url).toBe('https://instagram.com/coast');
  });
});
