import { describe, expect, it } from 'vitest';
import { computeFinalRunStatus } from '@/lib/accountResearch/orchestrate';
import { ACCOUNT_RESEARCH_PLATFORM_SCOPES } from '@/lib/accountResearch/constants';
import { buildAccountResearchContext } from '@/lib/accountResearch/context';
import { prospectFixture } from '@/lib/prospectFixture';
import { sanitizeCitationCandidates, SOURCE_STRATEGIES } from '@/lib/accountResearch/sources';
import { attributeInstagramPost } from '@/lib/accountResearch/socialProfile';
import {
  SPALLUMCHEEN_CONFIRMED_HANDLE,
  SPALLUMCHEEN_INSTAGRAM_NOISE,
} from '@/lib/accountResearch/fixtures/spallumcheenSocialNoise';

function researchCtx() {
  return buildAccountResearchContext({
    prospect: prospectFixture({
      id: 27,
      name: 'Trail Outfitters',
      city: 'Bend',
      website: 'https://trailoutfitters.com',
    }),
  });
}

describe('accountResearch sources', () => {
  it('processes website before instagram in deterministic claim order', () => {
    const websiteIdx = ACCOUNT_RESEARCH_PLATFORM_SCOPES.indexOf('website');
    const instagramIdx = ACCOUNT_RESEARCH_PLATFORM_SCOPES.indexOf('instagram');
    expect(websiteIdx).toBeGreaterThanOrEqual(0);
    expect(instagramIdx).toBeGreaterThan(websiteIdx);
    expect(ACCOUNT_RESEARCH_PLATFORM_SCOPES.indexOf('shopify')).toBe(websiteIdx + 1);
  });

  it('builds six distinct Search All strategies without a combined social query', () => {
    const researchContext = {
      ...researchCtx(),
      officialHostname: 'trailoutfitters.com',
    };
    const queries = Object.values(SOURCE_STRATEGIES).map((s) => s.buildQuery(researchContext));
    expect(queries).toHaveLength(6);
    expect(queries).toContain('"Trail Outfitters" official Instagram profile site:instagram.com');
    expect(queries).toContain('"Trail Outfitters" official Facebook page site:facebook.com');
    expect(queries).toContain('"Trail Outfitters" official TikTok profile site:tiktok.com');
    expect(queries).toContain('"Trail Outfitters" official Pinterest profile site:pinterest.com');
    const socialQueries = queries.filter((q) => /Instagram|Facebook|TikTok|Pinterest/.test(q));
    expect(socialQueries.every((q) => !q.includes('Bend') && q.includes('site:'))).toBe(true);
    expect(queries.some((q) => /instagram.*facebook|social media/i.test(q))).toBe(false);
    expect(SOURCE_STRATEGIES.website.buildQuery(researchContext)).toBe(
      'Official website of Trail Outfitters in Bend, British Columbia',
    );
    expect(SOURCE_STRATEGIES.website.buildQuery(researchContext)).not.toMatch(/About Shop/i);
  });

  it('builds a natural-language website query without quotes, address, or phone', () => {
    // Exa's `query` field is documented as a natural-language search, not a
    // keyword/boolean engine — quoting the name and an exact CRM address
    // (which rarely matches a real page's text verbatim) previously caused
    // zero-hit failures for real, easily-Googleable businesses.
    const ctx = buildAccountResearchContext({
      prospect: prospectFixture({
        id: 18,
        name: "Buckerfield's Kelowna",
        city: 'Kelowna',
        address: '1889 Springfield Road',
        phone: '250-762-8282',
        website: 'https://www.yellowpages.ca/buckerfields',
      }),
    });
    const query = SOURCE_STRATEGIES.website.buildQuery(ctx);
    expect(query).toBe(`Official website of Buckerfield's Kelowna in Kelowna, British Columbia`);
    expect(query).not.toContain('"');
    expect(query).not.toContain('1889 Springfield Road');
    expect(query).not.toContain('250-762-8282');
    expect(SOURCE_STRATEGIES.website.domainFilter(ctx)).toBeUndefined();
  });

  it('keeps Yellow Pages in sanitized website candidates for staff to choose', () => {
    const ctx = researchCtx();
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://www.yellowpages.ca/bus/BC/Kelowna/Buckerfields/123.html',
          title: "Buckerfield's",
          snippet: 'Yellow Pages listing',
        },
        {
          url: 'https://www.buckerfields.ca/Locations',
          title: "Buckerfield's Kelowna",
          snippet: '1889 Springfield Road Kelowna, BC',
        },
      ],
      SOURCE_STRATEGIES.website,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.url).toContain('yellowpages.ca');
    const validated = SOURCE_STRATEGIES.website.postValidate(candidates, ctx);
    expect(validated.citations[0]?.url).toContain('buckerfields.ca');
  });

  it('returns none_indexed when website hits are only directories', () => {
    const candidates = sanitizeCitationCandidates(
      [
        {
          url: 'https://www.yellowpages.ca/bus/BC/Kelowna/Buckerfields/123.html',
          title: 'YP',
          snippet: 'listing',
        },
        {
          url: 'https://www.yelp.com/biz/buckerfields-kelowna',
          title: 'Yelp',
          snippet: 'listing',
        },
      ],
      SOURCE_STRATEGIES.website,
    );
    const validated = SOURCE_STRATEGIES.website.postValidate(candidates, researchCtx());
    expect(validated.status).toBe('none_indexed');
    expect(validated.citations).toHaveLength(0);
  });

  it('does not pin Shopify search to a directory CRM host', () => {
    const ctx = buildAccountResearchContext({
      prospect: prospectFixture({
        id: 18,
        name: "Buckerfield's Kelowna",
        website: 'https://www.yellowpages.ca/buckerfields',
      }),
    });
    expect(
      SOURCE_STRATEGIES.shopify.domainFilter({ ...ctx, officialHostname: 'yellowpages.ca' }),
    ).toBeUndefined();
  });

  it('rejects Shopify guess without myshopify/CDN evidence', () => {
    const candidates = sanitizeCitationCandidates(
      [{ url: 'https://trailoutfitters.com/shop', title: 'Shop', snippet: 'store' }],
      SOURCE_STRATEGIES.shopify,
    );
    const validated = SOURCE_STRATEGIES.shopify.postValidate(candidates, researchCtx());
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
    const validated = SOURCE_STRATEGIES.shopify.postValidate(candidates, researchCtx());
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

  it('rejects bare Instagram reel URLs without profile path prefix', () => {
    for (const row of SPALLUMCHEEN_INSTAGRAM_NOISE) {
      expect(attributeInstagramPost(row.url, SPALLUMCHEEN_CONFIRMED_HANDLE).verified).toBe(false);
    }
    expect(
      attributeInstagramPost(
        'https://instagram.com/spallumcheengolf/p/ABC123/',
        SPALLUMCHEEN_CONFIRMED_HANDLE,
      ).verified,
    ).toBe(true);
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
