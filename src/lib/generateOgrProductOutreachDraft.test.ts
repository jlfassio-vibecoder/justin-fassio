import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

import {
  OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
} from '@/lib/ogrProductOutreachEmail';
import {
  assertSafePromptContext,
  buildOutreachDraftPrompt,
  buildSafeOutreachPromptContext,
  countWords,
  hostnameFromWebsite,
  normalizeOutreachCopy,
  ogrOutreachDraftSchema,
  OGR_OUTREACH_DRAFT_PROMPT_VERSION,
  produceOutreachCopy,
  proseContainsPricingLanguage,
  proseLooksUnsafe,
  sanitizeOutreachProse,
} from '@/lib/generateOgrProductOutreachDraft';
import type { SelectedOutreachTarget } from '@/lib/outreachSelectTargets';
import { PUBLIC_PRESENTATION_FORBIDDEN_KEYS } from '@/lib/publicProductPresentation';

const target: SelectedOutreachTarget = {
  preparationDate: '2026-08-12',
  prospectId: 10,
  prospectName: 'Golf Shop',
  accountContactId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  toEmail: 'sam@example.com',
  toName: 'Sam',
  primaryChannel: 'golf_retail',
  secondaryChannels: [],
  catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  productSku: 'OG1',
  productName: 'Golf Tee',
  productSlug: 'golf-tee',
  productIsNew: false,
  productSalesRank: 1,
  selectionReasons: {
    priority: 'Tier 1',
    fitScore: 8,
    channelMatch: true,
    productFit: 'channel_intersect',
    exclusionsChecked: true,
  },
};

describe('ogrOutreachDraftSchema', () => {
  it('accepts intro and closing only', () => {
    const parsed = ogrOutreachDraftSchema.parse({
      introText: 'Short intro for the buyer.',
      closingText: 'Happy to chat if useful.',
    });
    expect(parsed.introText).toContain('Short intro');
  });

  it('rejects empty intro', () => {
    expect(() => ogrOutreachDraftSchema.parse({ introText: '', closingText: 'Hi' })).toThrow();
  });
});

describe('sanitizeOutreachProse', () => {
  it('strips tags and collapses whitespace', () => {
    expect(sanitizeOutreachProse('  Hello <b>world</b>  ')).toBe('Hello world');
  });

  it('detects leftover unsafe markup', () => {
    expect(proseLooksUnsafe('Hello <script>')).toBe(true);
    expect(proseLooksUnsafe('Hello world')).toBe(false);
  });
});

describe('pricing and word helpers', () => {
  it('flags pricing language', () => {
    expect(proseContainsPricingLanguage('Our wholesale is great')).toBe(true);
    expect(proseContainsPricingLanguage('This tee fits golf shops')).toBe(false);
  });

  it('counts words', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});

describe('normalizeOutreachCopy', () => {
  it('falls back to defaults when pricing present', () => {
    const result = normalizeOutreachCopy({
      introText: 'Our wholesale USD price is great',
      closingText: 'Call me',
    });
    expect(result.fallback).toBe('defaults');
    expect(result.introText).toBe(OGR_PRODUCT_EMAIL_DEFAULT_INTRO);
    expect(result.closingText).toBe(OGR_PRODUCT_EMAIL_DEFAULT_CLOSING);
    expect(result.needsRetry).toBe(true);
  });

  it('flags over-preferred word count for retry', () => {
    const longIntro = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const result = normalizeOutreachCopy({
      introText: longIntro,
      closingText: 'Short close.',
    });
    expect(result.needsRetry).toBe(true);
    expect(result.fallback).toBe('none');
    expect(result.introText.startsWith('word0')).toBe(true);
  });

  it('accepts concise clean copy', () => {
    const result = normalizeOutreachCopy({
      introText: 'This style should resonate with your golf customers.',
      closingText: 'Happy to hop on a quick call.',
    });
    expect(result.needsRetry).toBe(false);
    expect(result.fallback).toBe('none');
  });
});

describe('hostnameFromWebsite', () => {
  it('extracts hostname without scheme or path', () => {
    expect(hostnameFromWebsite('https://www.example.com/shop')).toBe('example.com');
    expect(hostnameFromWebsite('example.com')).toBe('example.com');
    expect(hostnameFromWebsite('')).toBeNull();
    expect(hostnameFromWebsite(null)).toBeNull();
  });
});

describe('buildSafeOutreachPromptContext', () => {
  it('omits emails and forbidden keys from prompt JSON', () => {
    const ctx = buildSafeOutreachPromptContext({
      target,
      product: {
        name: 'Golf Tee',
        tagline: 'Fun tee',
        description: 'A fun tee for golf shops.',
        category: 'Apparel',
        lifestyleThemeLabels: ['Golf'],
        isNew: false,
      },
      prospect: {
        city: 'Kelowna',
        region: 'Okanagan',
        fit: 'Strong golf fit',
        lifestyleThemes: ['golf'],
      },
    });
    const prompt = buildOutreachDraftPrompt(ctx);
    expect(prompt).toContain('Golf Shop');
    expect(prompt).not.toContain('sam@example.com');
    expect(prompt).not.toContain(target.accountContactId);
    expect(prompt).not.toContain(target.catalogItemId);
    expect(OGR_OUTREACH_DRAFT_PROMPT_VERSION).toBe('v1');
    assertSafePromptContext(ctx);
    const json = JSON.stringify(ctx);
    for (const key of PUBLIC_PRESENTATION_FORBIDDEN_KEYS) {
      expect(json.includes(`"${key}"`)).toBe(false);
    }
  });

  it('includes store website host and research notes without raw URLs in rules', () => {
    const ctx = buildSafeOutreachPromptContext({
      target,
      product: {
        name: 'Golf Tee',
        tagline: 'Fun tee',
        description: 'A fun tee for golf shops.',
        category: 'Apparel',
        lifestyleThemeLabels: ['Golf'],
        isNew: false,
      },
      prospect: {
        city: 'Kelowna',
        region: 'Okanagan',
        fit: 'Strong golf fit',
        lifestyleThemes: ['golf'],
        website: 'https://golfshop.example/path',
      },
      recentPublicNotes: ['instagram: Local tournament photos', 'website: Family-owned since 1998'],
    });
    expect(ctx.storeWebsiteHost).toBe('golfshop.example');
    expect(ctx.recentPublicNotes).toHaveLength(2);
    const prompt = buildOutreachDraftPrompt(ctx);
    expect(prompt).toContain('golfshop.example');
    expect(prompt).toContain('Local tournament photos');
    expect(prompt).toContain('No HTML, markdown links, URLs');
  });
});

describe('produceOutreachCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries once when first draft is too long then saves shortened copy', async () => {
    const longIntro = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    generateObjectMock
      .mockResolvedValueOnce({
        object: { introText: longIntro, closingText: 'Close please.' },
      })
      .mockResolvedValueOnce({
        object: {
          introText: 'This tee is a strong fit for your golf customers.',
          closingText: 'Happy to chat.',
        },
      });

    const ctx = buildSafeOutreachPromptContext({
      target,
      product: {
        name: 'Golf Tee',
        tagline: '',
        description: '',
        category: 'Apparel',
        lifestyleThemeLabels: [],
        isNew: false,
      },
      prospect: null,
    });
    const result = await produceOutreachCopy(ctx);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(result.fallback).toBe('retry_shorten');
    expect(result.introText).toContain('strong fit');
  });

  it('falls back to defaults when generateObject throws', async () => {
    generateObjectMock.mockRejectedValue(new Error('gateway down'));
    const ctx = buildSafeOutreachPromptContext({
      target,
      product: {
        name: 'Golf Tee',
        tagline: '',
        description: '',
        category: 'Apparel',
        lifestyleThemeLabels: [],
        isNew: false,
      },
      prospect: null,
    });
    const result = await produceOutreachCopy(ctx);
    expect(result.fallback).toBe('defaults');
    expect(result.introText).toBe(OGR_PRODUCT_EMAIL_DEFAULT_INTRO);
  });
});

describe('product URL argument order', () => {
  it('builds hrefs as slug, origin, optional market', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/lib/generateOgrProductOutreachDraft.ts'),
      'utf8',
    );
    expect(src).toMatch(/buildOgrProductUrl\(presentation\.slug, origin/);
    expect(src).not.toMatch(/buildOgrProductUrl\(resolvePublicSiteOrigin\(\)/);
  });
});
