import { describe, expect, it } from 'vitest';
import {
  canAiFillField,
  hasManualOverride,
  resolveEffectiveNumber,
  resetFieldToCatalog,
  markUserEdit,
} from '@/lib/catalogProvenance';
import { normalizeSku, skusMatch, skuSuffixCandidates } from '@/lib/skuNormalize';
import { baseWholesaleUsd, pickDisplayVariant, type CatalogVariant } from '@/lib/catalogVariants';

describe('skuNormalize', () => {
  it('normalizes OCR confusions', () => {
    expect(normalizeSku(' 0g2147 ')).toBe('OG2147');
    expect(normalizeSku('OG2I47')).toBe('OG2147');
  });

  it('suggests suffix candidates', () => {
    expect(skuSuffixCandidates('OG2147')).toContain('OG2147-GM');
  });

  it('matches equivalent SKUs', () => {
    expect(skusMatch('og2147', 'OG2147')).toBe(true);
  });
});

describe('catalogProvenance', () => {
  it('prefers override then catalog', () => {
    expect(resolveEffectiveNumber({ override: 14, catalog: 13 })).toBe(14);
    expect(resolveEffectiveNumber({ override: null, catalog: 13 })).toBe(13);
  });

  it('blocks AI fill on verified user/catalog', () => {
    expect(canAiFillField({ source: 'user', verified: true })).toBe(false);
    expect(canAiFillField({ source: 'import' })).toBe(true);
    expect(hasManualOverride(21.5)).toBe(true);
  });

  it('marks user edits and catalog resets', () => {
    const edited = markUserEdit({}, 'priceUsd');
    expect(edited.priceUsd?.source).toBe('user');
    const reset = resetFieldToCatalog(edited, 'priceUsd');
    expect(reset.priceUsd?.source).toBe('catalog');
  });
});

describe('catalogVariants helpers', () => {
  const variants: CatalogVariant[] = [
    {
      id: '1',
      catalogItemId: 'a',
      size: 'BASE',
      color: '',
      style: '',
      wholesaleUsd: 13,
      catalogWholesaleUsd: 13,
      wholesaleUsdOverride: null,
      unitOfMeasure: 'each',
      packQuantity: null,
      packPriceUsd: null,
      availability: 'available',
      sortOrder: 0,
      notes: '',
    },
    {
      id: '2',
      catalogItemId: 'a',
      size: '2X',
      color: '',
      style: '',
      wholesaleUsd: 14,
      catalogWholesaleUsd: 14,
      wholesaleUsdOverride: null,
      unitOfMeasure: 'each',
      packQuantity: null,
      packPriceUsd: null,
      availability: 'available',
      sortOrder: 1,
      notes: '',
    },
  ];

  it('picks non-BASE for display when present', () => {
    expect(pickDisplayVariant(variants)?.size).toBe('2X');
  });

  it('uses BASE wholesale for table base price', () => {
    expect(baseWholesaleUsd(variants, 99)).toBe(13);
  });
});
