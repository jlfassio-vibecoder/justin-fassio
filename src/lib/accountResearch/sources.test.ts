import { describe, expect, it } from 'vitest';
import { computeFinalRunStatus } from '@/lib/accountResearch/orchestrate';
import { sanitizeCitationCandidates, SOURCE_STRATEGIES } from '@/lib/accountResearch/sources';

describe('accountResearch sources', () => {
  it('builds six distinct Search All strategies without a combined social query', () => {
    const ctx = {
      businessName: 'Trail Outfitters',
      city: 'Bend',
      officialHostname: 'trailoutfitters.com',
    };
    const queries = Object.values(SOURCE_STRATEGIES).map((s) => s.buildQuery(ctx));
    expect(queries).toHaveLength(6);
    expect(queries.filter((q) => q.includes('site:instagram.com'))).toHaveLength(1);
    expect(queries.filter((q) => q.includes('site:facebook.com'))).toHaveLength(1);
    expect(queries.some((q) => /instagram.*facebook|social media/i.test(q))).toBe(false);
  });

  it('rejects Shopify guess without myshopify/CDN evidence', () => {
    const candidates = sanitizeCitationCandidates(
      [{ url: 'https://trailoutfitters.com/shop', title: 'Shop', snippet: 'store' }],
      SOURCE_STRATEGIES.shopify,
    );
    const validated = SOURCE_STRATEGIES.shopify.postValidate(candidates, {
      businessName: 'Trail Outfitters',
    });
    expect(validated.status).toBe('none_indexed');
    expect(validated.citations).toHaveLength(0);
  });

  it('accepts Shopify myshopify evidence', () => {
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://trail-outfitters.myshopify.com/collections/all',
          title: 'Collections',
          snippet: 'Shopify storefront',
        },
      ],
      SOURCE_STRATEGIES.shopify,
    );
    const validated = SOURCE_STRATEGIES.shopify.postValidate(candidates, {
      businessName: 'Trail Outfitters',
    });
    expect(validated.status).toBe('succeeded');
    expect(validated.citations[0]?.platform).toBe('shopify');
  });

  it('drops unparseable publishedAt values', () => {
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://instagram.com/trailoutfitters',
          title: 'IG',
          snippet: 'post',
          date: '2 days ago',
        },
      ],
      SOURCE_STRATEGIES.instagram,
    );
    expect(candidates[0]?.publishedAt).toBeNull();
  });

  it('normalizes parseable publishedAt values to ISO', () => {
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://instagram.com/trailoutfitters',
          title: 'IG',
          snippet: 'post',
          date: '2026-01-15T10:00:00Z',
        },
      ],
      SOURCE_STRATEGIES.instagram,
    );
    expect(candidates[0]?.publishedAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('rejects a website candidate whose name does not match the business', () => {
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://acmegoods.example.com/',
          title: 'Acme Goods — Home',
          snippet: 'Welcome to Acme Goods',
        },
      ],
      SOURCE_STRATEGIES.website,
    );
    const validated = SOURCE_STRATEGIES.website.postValidate(candidates, {
      businessName: 'Trail Outfitters',
    });
    expect(validated.status).toBe('none_indexed');
    expect(validated.citations).toHaveLength(0);
  });

  it('rejects a directory/aggregator host even when the name matches', () => {
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://www.yelp.com/biz/trail-outfitters-bend',
          title: 'Trail Outfitters - Bend, OR',
          snippet: 'Reviews for Trail Outfitters',
        },
      ],
      SOURCE_STRATEGIES.website,
    );
    const validated = SOURCE_STRATEGIES.website.postValidate(candidates, {
      businessName: 'Trail Outfitters',
    });
    expect(validated.status).toBe('none_indexed');
    expect(validated.citations).toHaveLength(0);
  });

  it('accepts a website candidate whose host and title match the business name', () => {
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://trailoutfitters.com/',
          title: 'Trail Outfitters | Official Site',
          snippet: 'Shop Trail Outfitters gear',
        },
      ],
      SOURCE_STRATEGIES.website,
    );
    const validated = SOURCE_STRATEGIES.website.postValidate(candidates, {
      businessName: 'Trail Outfitters',
    });
    expect(validated.status).toBe('succeeded');
    expect(validated.citations[0]?.url).toBe('https://trailoutfitters.com/');
  });

  it('isolates Instagram hosts', () => {
    const candidates = sanitizeCitationCandidates(
      [
        { url: 'https://instagram.com/trailoutfitters', title: 'IG', snippet: 'post' },
        { url: 'https://example.com/about', title: 'About', snippet: 'store' },
      ],
      SOURCE_STRATEGIES.instagram,
    );
    const validated = SOURCE_STRATEGIES.instagram.postValidate(candidates, {
      businessName: 'Trail Outfitters',
    });
    expect(validated.citations).toHaveLength(1);
    expect(validated.citations[0]?.url).toContain('instagram.com');
  });
});

describe('computeFinalRunStatus', () => {
  it('needs identity review when confidence is not high', () => {
    expect(
      computeFinalRunStatus({
        identity: { identity_confidence: 'low' },
        sources: [{ status: 'succeeded' }, { status: 'none_indexed' }],
      }),
    ).toBe('needs_identity_review');
  });

  it('returns partial when some sources fail after high identity', () => {
    expect(
      computeFinalRunStatus({
        identity: { identity_confidence: 'high' },
        sources: [{ status: 'succeeded' }, { status: 'failed' }],
      }),
    ).toBe('partial');
  });

  it('returns succeeded when all usable', () => {
    expect(
      computeFinalRunStatus({
        identity: { identity_confidence: 'high' },
        sources: [{ status: 'succeeded' }, { status: 'none_indexed' }],
      }),
    ).toBe('succeeded');
  });
});
