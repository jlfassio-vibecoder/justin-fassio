import { describe, expect, it } from 'vitest';
import {
  applyFrozenOutreachSelection,
  buildSelectedTargetFromDraft,
} from '@/lib/outreachDraftSelection';
import type { SelectedOutreachTarget } from '@/lib/outreachSelectTargets';
import type { ProductOutreachGenerationMeta } from '@/lib/systemMessages';
import { buildSafeOutreachPromptContext } from '@/lib/generateOgrProductOutreachDraft';

const weakTarget: SelectedOutreachTarget = {
  preparationDate: '2026-08-27',
  prospectId: 648,
  prospectName: 'Newport Marina Store',
  accountContactId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  toEmail: 'lc@newportmarinastore.com',
  toName: 'Lauren Craven',
  primaryChannel: null,
  secondaryChannels: [],
  catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  productSku: 'OG2147',
  productName: 'MADE IN THE USA',
  productSlug: 'made-in-the-usa',
  productIsNew: false,
  productSalesRank: null,
  selectionReasons: {
    priority: null,
    fitScore: null,
    channelMatch: false,
    productFit: 'global_fallback',
    exclusionsChecked: true,
  },
};

const prepGeneration: ProductOutreachGenerationMeta = {
  promptVersion: 'v1',
  model: 'none',
  preparationDate: '2026-08-25',
  selectionReasons: {
    priority: 'Tier 1',
    fitScore: 7,
    channelMatch: true,
    productFit: 'channel_intersect',
    exclusionsChecked: true,
  },
  primaryChannel: 'marine_retail',
  secondaryChannels: ['gift_novelty_souvenir'],
  productSalesRank: 4,
  fallback: 'defaults',
  introWordCount: 12,
  closingWordCount: 8,
  generatedAt: '2026-08-25T12:00:00Z',
  copyStatus: 'stub',
};

describe('applyFrozenOutreachSelection', () => {
  it('restores channels, productFit, and sales rank from prep generation', () => {
    const merged = applyFrozenOutreachSelection(weakTarget, prepGeneration);
    expect(merged.preparationDate).toBe('2026-08-25');
    expect(merged.primaryChannel).toBe('marine_retail');
    expect(merged.secondaryChannels).toEqual(['gift_novelty_souvenir']);
    expect(merged.productSalesRank).toBe(4);
    expect(merged.selectionReasons.productFit).toBe('channel_intersect');
    expect(merged.selectionReasons.channelMatch).toBe(true);
    expect(merged.toEmail).toBe(weakTarget.toEmail);
    expect(merged.catalogItemId).toBe(weakTarget.catalogItemId);
  });

  it('leaves target unchanged when generation is missing', () => {
    expect(applyFrozenOutreachSelection(weakTarget, null)).toEqual(weakTarget);
  });

  it('feeds restored channels into the outreach prompt context', () => {
    const merged = applyFrozenOutreachSelection(weakTarget, prepGeneration);
    const ctx = buildSafeOutreachPromptContext({
      target: merged,
      product: {
        name: 'MADE IN THE USA',
        tagline: '',
        description: '',
        category: '',
        lifestyleThemeLabels: [],
        isNew: false,
      },
      prospect: null,
    });
    expect(ctx.channelLabels.join(' ')).toMatch(/marine/i);
    expect(ctx.productFit).toBe('channel_intersect');
    expect(ctx.productSalesRank).toBe(4);
    expect(ctx.channelMatch).toBe(true);
  });
});

describe('buildSelectedTargetFromDraft', () => {
  it('applies draft generation freeze for Add copy', () => {
    const target = buildSelectedTargetFromDraft({
      draft: {
        id: 'draft-1',
        prospectId: 648,
        accountContactId: weakTarget.accountContactId,
        catalogItemId: weakTarget.catalogItemId,
        payload: { generation: prepGeneration },
      },
      preparationDate: '2026-08-27',
      prospectName: 'Newport Marina Store',
      toEmail: 'lc@newportmarinastore.com',
      toName: 'Lauren Craven',
      catalogItemId: weakTarget.catalogItemId,
      productSku: 'OG2147',
      productName: 'MADE IN THE USA',
      productSlug: 'made-in-the-usa',
      productIsNew: false,
    });
    expect(target.primaryChannel).toBe('marine_retail');
    expect(target.productSalesRank).toBe(4);
    expect(target.selectionReasons.productFit).toBe('channel_intersect');
    expect(target.selectionReasons).not.toEqual(
      expect.objectContaining({ productFit: 'global_fallback', channelMatch: false }),
    );
  });
});
