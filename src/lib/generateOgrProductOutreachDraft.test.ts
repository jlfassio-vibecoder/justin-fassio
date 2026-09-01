import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateObjectMock = vi.fn();
const staffGatewayModelMock = vi.fn((modelId: string) => `gateway:${modelId}`);
const ensureAiGatewayApiKeyMock = vi.fn(() => 'test-key');
const aiGatewayUserErrorMessageMock = vi.fn((err: unknown) =>
  err instanceof Error ? err.message : String(err ?? 'An error occurred.'),
);

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock('@/lib/aiGatewayEnv', () => ({
  ensureAiGatewayApiKey: () => ensureAiGatewayApiKeyMock(),
  staffGatewayModel: (modelId?: string) => staffGatewayModelMock(modelId ?? 'openai/gpt-4o'),
  aiGatewayUserErrorMessage: (err: unknown) => aiGatewayUserErrorMessageMock(err),
  hasAiGatewayAuth: () => true,
  LOCAL_AI_GATEWAY_AUTH_HELP: 'missing key',
}));

import {
  OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
} from '@/lib/ogrProductOutreachEmail';
import {
  assertSafePromptContext,
  buildActiveAccountOutreachDraftPrompt,
  buildOutreachDraftPrompt,
  buildSafeOutreachPromptContext,
  countWords,
  filterSocialResearchNotesForActiveAccount,
  hostnameFromWebsite,
  normalizeOutreachCopy,
  ogrOutreachDraftSchema,
  OGR_OUTREACH_DRAFT_MODEL,
  OGR_OUTREACH_DRAFT_PROMPT_VERSION,
  produceOutreachCopy,
  proseContainsPricingLanguage,
  proseLooksUnsafe,
  sanitizeOutreachProse,
  stripLeadingOutreachGreeting,
  stripUrlsFromResearchNote,
} from '@/lib/generateOgrProductOutreachDraft';
import type { SelectedOutreachTarget } from '@/lib/outreachSelectTargets';
import { PUBLIC_PRESENTATION_FORBIDDEN_KEYS } from '@/lib/publicProductPresentation';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

describe('stripLeadingOutreachGreeting', () => {
  it('removes Hi Name, so the template greeting is not duplicated', () => {
    expect(
      stripLeadingOutreachGreeting(
        "Hi Pam, I hope you're doing well. We have an exciting new addition.",
      ),
    ).toBe("I hope you're doing well. We have an exciting new addition.");
    expect(stripLeadingOutreachGreeting('Hello Sam! Great fit for your shop.')).toBe(
      'Great fit for your shop.',
    );
    expect(stripLeadingOutreachGreeting('This tee fits golf shops.')).toBe(
      'This tee fits golf shops.',
    );
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

  it('strips a leading greeting from otherwise clean copy', () => {
    const result = normalizeOutreachCopy({
      introText: 'Hi Pam, This style should resonate with your golf customers.',
      closingText: 'Happy to hop on a quick call.',
    });
    expect(result.needsRetry).toBe(false);
    expect(result.fallback).toBe('none');
    expect(result.introText).toBe('This style should resonate with your golf customers.');
    expect(result.introText).not.toMatch(/^Hi Pam/i);
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

describe('stripUrlsFromResearchNote', () => {
  it('removes http(s) and www URLs from citation text', () => {
    expect(
      stripUrlsFromResearchNote('Family shop since 1998 https://example.com/about more notes'),
    ).toBe('Family shop since 1998 more notes');
    expect(stripUrlsFromResearchNote('See www.example.com for hours')).toBe('See for hours');
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
    expect(prompt).toContain('Do not greet or address the buyer by name');
    expect(prompt).not.toContain('sam@example.com');
    expect(prompt).not.toContain(target.accountContactId);
    expect(prompt).not.toContain(target.catalogItemId);
    expect(OGR_OUTREACH_DRAFT_PROMPT_VERSION).toBe('v3');
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

  it('includes Slice B pack fields and never emits https in the built prompt', () => {
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
        website: null,
      },
      storeWebsiteHost: 'nmscharters.com',
      contactRole: 'Buyer',
      contactTitle: 'Purchasing Manager',
      lockedProfiles: [
        { platform: 'website', hostname: 'nmscharters.com' },
        { platform: 'instagram', hostname: 'instagram.com' },
        { platform: 'facebook', hostname: 'facebook.com' },
      ],
      recentPublicNotes: ['website: Coastal charter and retail shop'],
      researchBriefBullets: ['Family-run store focused on golf apparel'],
      directorySignals: 'NMS Charters · Boat Charters, Sporting Goods',
    });
    const prompt = buildOutreachDraftPrompt(ctx);
    expect(prompt).toContain('Contact role: Buyer');
    expect(prompt).toContain('Contact title: Purchasing Manager');
    expect(prompt).toContain('Locked public profiles (hostname only; do not invent activity):');
    expect(prompt).toContain('- instagram: instagram.com');
    expect(prompt).toContain('- facebook: facebook.com');
    expect(prompt).toContain('Research brief bullets:');
    expect(prompt).toContain('Family-run store focused on golf apparel');
    expect(prompt).toContain('Directory signals: NMS Charters · Boat Charters, Sporting Goods');
    expect(prompt).not.toMatch(/https?:\/\//i);
    assertSafePromptContext(ctx);
  });

  it('still builds when research pack fields are empty', () => {
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
    const prompt = buildOutreachDraftPrompt(ctx);
    expect(prompt).toContain('Store name: Golf Shop');
    expect(prompt).not.toContain('Locked public profiles');
    expect(prompt).not.toContain('Contact role:');
    expect(prompt).not.toMatch(/https?:\/\//i);
  });

  it('rejects prompt context that still contains a URL scheme', () => {
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
    const tainted = {
      ...ctx,
      directorySignals: 'See https://yelp.com/biz/bad',
    };
    expect(() => assertSafePromptContext(tainted)).toThrow(/URL scheme/);
  });
});

describe('active account outreach prompt', () => {
  it('filters social research notes to instagram and facebook only', () => {
    const filtered = filterSocialResearchNotesForActiveAccount([
      'instagram: Fall display photos',
      'facebook: New arrivals post',
      'website: Store hours updated',
      'directory: Verified listing',
    ]);
    expect(filtered).toEqual(['instagram: Fall display photos', 'facebook: New arrivals post']);
  });

  it('builds reorder prompt with purchase history and without city or region', () => {
    const ctx = buildSafeOutreachPromptContext({
      target,
      product: {
        name: 'Red Hot Rod',
        tagline: 'Hot rod tee',
        description: 'Classic hot rod graphic tee.',
        category: 'Apparel',
        lifestyleThemeLabels: ['Automotive'],
        isNew: false,
      },
      prospect: null,
      accountKind: 'active_account',
      purchaseHistory: {
        invoiceNumber: '71878',
        invoiceDate: '2025-10-03',
        topLines: [
          { skuBase: 'OG2017', styleName: 'THE DREAM', quantity: 19 },
          { skuBase: 'OG2023', styleName: 'STILL SWINGING', quantity: 19 },
        ],
      },
      recentPublicNotes: ['instagram: Fall window refresh'],
    });
    const prompt = buildActiveAccountOutreachDraftPrompt(ctx);
    expect(prompt).toContain('already buys from us');
    expect(prompt).toContain('THE DREAM');
    expect(prompt).toContain('Red Hot Rod');
    expect(prompt).toContain('instagram: Fall window refresh');
    expect(prompt).not.toContain('City:');
    expect(prompt).not.toContain('Region:');
    expect(prompt).not.toContain('match their vibe');
  });
});

describe('golden outreach prompt fixtures', () => {
  const product = {
    name: 'Golf Tee',
    tagline: 'Fun tee',
    description: 'A fun tee for golf shops.',
    category: 'Apparel',
    lifestyleThemeLabels: ['Golf'],
    isNew: false,
  };

  it('snapshots rich research pack prompt', () => {
    const ctx = buildSafeOutreachPromptContext({
      target,
      product,
      prospect: {
        city: 'Kelowna',
        region: 'Okanagan',
        fit: 'Strong golf fit',
        lifestyleThemes: ['golf'],
        website: null,
      },
      storeWebsiteHost: 'nmscharters.com',
      contactRole: 'Buyer',
      contactTitle: 'Purchasing Manager',
      lockedProfiles: [
        { platform: 'website', hostname: 'nmscharters.com' },
        { platform: 'instagram', hostname: 'instagram.com' },
      ],
      recentPublicNotes: ['website: Coastal charter and retail shop'],
      researchBriefBullets: ['Family-run store focused on golf apparel'],
      directorySignals: 'NMS Charters · Boat Charters, Sporting Goods',
    });
    expect(buildOutreachDraftPrompt(ctx)).toMatchInlineSnapshot(`
      "You write short wholesale outreach intro and closing copy for Old Guys Rule apparel.
      This is an opening email featuring one product — warm and specific, not a catalog browse pitch.
      Return ONLY introText and closingText as plain text.
      Rules:
      - Intro: Name the product and frame it as worth checking out from the Old Guys Rule catalog (e.g. "Check out this … tee/style from our … catalog"). Tie its vibe to the store’s lifestyle or region when context supports it. Reflect Old Guys Rule’s humor + lifestyle voice — short, conversational, not salesy.
      - Closing: Soft retail angle — how styles like this tend to sell (gifts, the customer type that fits the store) and that more catalog styles can match their vibe. Keep it natural; a light invite to reply is fine.
      - Avoid awkward marketing verbs and CTAs: do not use Explore, Discover, Dive into, Unlock, Don’t miss, Shop now, or similar.
      - Do not close the sale or hard-pitch.
      - No HTML, markdown links, URLs, email addresses, or CRM/product IDs.
      - No pricing, wholesale, landed, MSRP, USD/CAD, or cost language.
      - Do not invent facts (city, buyer title, inventory, availability).
      - Do not write a subject line, From header, or signature.
      - Do not greet or address the buyer by name (no "Hi Pam," / "Hello …"); the email template already adds the greeting.
      - Prefer intro under 50 words and closing under 40 words.

      Context (use only what is present; skip empty fields):
      Store name: Golf Shop
      Buyer first name: Sam
      Contact role: Buyer
      Contact title: Purchasing Manager
      City: Kelowna
      Region: Okanagan
      Retail channels: Golf Courses, Resorts & Pro Shops
      Store lifestyle themes: Golf
      Fit notes: Strong golf fit
      Store website host: nmscharters.com
      Locked public profiles (hostname only; do not invent activity):
      - website: nmscharters.com
      - instagram: instagram.com
      Recent public notes (paraphrase lightly; do not invent; never paste URLs):
      - website: Coastal charter and retail shop
      Research brief bullets:
      - Family-run store focused on golf apparel
      Directory signals: NMS Charters · Boat Charters, Sporting Goods
      Product name: Golf Tee
      Product category: Apparel
      Product tagline: Fun tee
      Product description: A fun tee for golf shops.
      Sales rank hint: #1
      Product lifestyle themes: Golf
      Channel match to allocation: yes
      Product fit: channel_intersect"
    `);
  });

  it('snapshots thin CRM-only prompt', () => {
    const ctx = buildSafeOutreachPromptContext({
      target: {
        ...target,
        primaryChannel: null,
        secondaryChannels: [],
        productSalesRank: null,
        selectionReasons: {
          ...target.selectionReasons,
          channelMatch: false,
          productFit: 'global_fallback',
        },
      },
      product: {
        name: 'Golf Tee',
        tagline: '',
        description: '',
        category: 'Apparel',
        lifestyleThemeLabels: [],
        isNew: false,
      },
      prospect: {
        city: 'Kelowna',
        region: 'Okanagan',
        fit: '',
        lifestyleThemes: [],
      },
    });
    expect(buildOutreachDraftPrompt(ctx)).toMatchInlineSnapshot(`
      "You write short wholesale outreach intro and closing copy for Old Guys Rule apparel.
      This is an opening email featuring one product — warm and specific, not a catalog browse pitch.
      Return ONLY introText and closingText as plain text.
      Rules:
      - Intro: Name the product and frame it as worth checking out from the Old Guys Rule catalog (e.g. "Check out this … tee/style from our … catalog"). Tie its vibe to the store’s lifestyle or region when context supports it. Reflect Old Guys Rule’s humor + lifestyle voice — short, conversational, not salesy.
      - Closing: Soft retail angle — how styles like this tend to sell (gifts, the customer type that fits the store) and that more catalog styles can match their vibe. Keep it natural; a light invite to reply is fine.
      - Avoid awkward marketing verbs and CTAs: do not use Explore, Discover, Dive into, Unlock, Don’t miss, Shop now, or similar.
      - Do not close the sale or hard-pitch.
      - No HTML, markdown links, URLs, email addresses, or CRM/product IDs.
      - No pricing, wholesale, landed, MSRP, USD/CAD, or cost language.
      - Do not invent facts (city, buyer title, inventory, availability).
      - Do not write a subject line, From header, or signature.
      - Do not greet or address the buyer by name (no "Hi Pam," / "Hello …"); the email template already adds the greeting.
      - Prefer intro under 50 words and closing under 40 words.

      Context (use only what is present; skip empty fields):
      Store name: Golf Shop
      Buyer first name: Sam
      City: Kelowna
      Region: Okanagan
      Product name: Golf Tee
      Product category: Apparel
      Channel match to allocation: no
      Product fit: global_fallback"
    `);
  });

  it('snapshots host and notes middle case', () => {
    const ctx = buildSafeOutreachPromptContext({
      target,
      product,
      prospect: {
        city: 'Kelowna',
        region: 'Okanagan',
        fit: 'Strong golf fit',
        lifestyleThemes: ['golf'],
        website: 'https://golfshop.example/path',
      },
      recentPublicNotes: ['instagram: Local tournament photos', 'website: Family-owned since 1998'],
    });
    expect(buildOutreachDraftPrompt(ctx)).toMatchInlineSnapshot(`
      "You write short wholesale outreach intro and closing copy for Old Guys Rule apparel.
      This is an opening email featuring one product — warm and specific, not a catalog browse pitch.
      Return ONLY introText and closingText as plain text.
      Rules:
      - Intro: Name the product and frame it as worth checking out from the Old Guys Rule catalog (e.g. "Check out this … tee/style from our … catalog"). Tie its vibe to the store’s lifestyle or region when context supports it. Reflect Old Guys Rule’s humor + lifestyle voice — short, conversational, not salesy.
      - Closing: Soft retail angle — how styles like this tend to sell (gifts, the customer type that fits the store) and that more catalog styles can match their vibe. Keep it natural; a light invite to reply is fine.
      - Avoid awkward marketing verbs and CTAs: do not use Explore, Discover, Dive into, Unlock, Don’t miss, Shop now, or similar.
      - Do not close the sale or hard-pitch.
      - No HTML, markdown links, URLs, email addresses, or CRM/product IDs.
      - No pricing, wholesale, landed, MSRP, USD/CAD, or cost language.
      - Do not invent facts (city, buyer title, inventory, availability).
      - Do not write a subject line, From header, or signature.
      - Do not greet or address the buyer by name (no "Hi Pam," / "Hello …"); the email template already adds the greeting.
      - Prefer intro under 50 words and closing under 40 words.

      Context (use only what is present; skip empty fields):
      Store name: Golf Shop
      Buyer first name: Sam
      City: Kelowna
      Region: Okanagan
      Retail channels: Golf Courses, Resorts & Pro Shops
      Store lifestyle themes: Golf
      Fit notes: Strong golf fit
      Store website host: golfshop.example
      Recent public notes (paraphrase lightly; do not invent; never paste URLs):
      - instagram: Local tournament photos
      - website: Family-owned since 1998
      Product name: Golf Tee
      Product category: Apparel
      Product tagline: Fun tee
      Product description: A fun tee for golf shops.
      Sales rank hint: #1
      Product lifestyle themes: Golf
      Channel match to allocation: yes
      Product fit: channel_intersect"
    `);
  });
});

describe('produceOutreachCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffGatewayModelMock.mockImplementation((modelId: string) => `gateway:${modelId}`);
    ensureAiGatewayApiKeyMock.mockReturnValue('test-key');
    aiGatewayUserErrorMessageMock.mockImplementation((err: unknown) =>
      err instanceof Error ? err.message : String(err ?? 'An error occurred.'),
    );
  });

  function baseCtx() {
    return buildSafeOutreachPromptContext({
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
  }

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

    const result = await produceOutreachCopy(baseCtx());
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(ensureAiGatewayApiKeyMock).toHaveBeenCalled();
    expect(staffGatewayModelMock).toHaveBeenCalledWith(OGR_OUTREACH_DRAFT_MODEL);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: `gateway:${OGR_OUTREACH_DRAFT_MODEL}` }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBe('retry_shorten');
    expect(result.introText).toContain('strong fit');
  });

  it('returns an error when generateObject throws on the first call', async () => {
    generateObjectMock.mockRejectedValue(new Error('gateway down'));
    const result = await produceOutreachCopy(baseCtx());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/gateway down/i);
  });

  it('keeps the first usable draft when shorten retry throws', async () => {
    const longIntro = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    generateObjectMock
      .mockResolvedValueOnce({
        object: { introText: longIntro, closingText: 'Close please.' },
      })
      .mockRejectedValueOnce(new Error('retry failed'));

    const result = await produceOutreachCopy(baseCtx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallback).toBe('none');
    expect(result.introText.startsWith('word0')).toBe(true);
    expect(result.introText).not.toBe(OGR_PRODUCT_EMAIL_DEFAULT_INTRO);
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
