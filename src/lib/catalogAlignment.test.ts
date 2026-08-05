import { describe, expect, it } from 'vitest';
import { unitEquivalentWholesaleUsd } from '@/lib/catalogUnitPrice';
import { templatesForCategory } from '@/lib/catalogPricingTemplates';
import { mergeCatalogEvidence } from '@/lib/catalogIngest';
import { factorsWithSettings, mapCatalogSettingsRow } from '@/lib/catalogSettings';
import { landedCadBeforeRecoverableGst, marginPct } from '@/lib/landedCost';
import type { CatalogSettingsRow } from '@/types/database';

describe('unitEquivalentWholesaleUsd', () => {
  it('returns wholesale when pack qty is 1 or missing', () => {
    expect(unitEquivalentWholesaleUsd({ wholesaleUsd: 13 })).toBe(13);
    expect(unitEquivalentWholesaleUsd({ wholesaleUsd: 13, packQuantity: 1 })).toBe(13);
  });

  it('divides pack price by pack qty', () => {
    expect(
      unitEquivalentWholesaleUsd({ wholesaleUsd: 40, packQuantity: 4, packPriceUsd: 40 }),
    ).toBe(10);
  });

  it('divides wholesale by pack qty when pack price is omitted', () => {
    expect(unitEquivalentWholesaleUsd({ wholesaleUsd: 25, packQuantity: 25 })).toBe(1);
  });
});

describe('templatesForCategory', () => {
  it('matches SST matrix without inventing SKU rows', () => {
    const templates = templatesForCategory('Short Sleeve Tees');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]!.bands.map((b) => b.sizeGroup)).toEqual(['M-XL', '2X', '3X']);
  });

  it('returns empty for unrelated categories', () => {
    expect(templatesForCategory('Vintage Metal Signs')).toEqual([]);
  });
});

describe('mergeCatalogEvidence blank-fill', () => {
  it('fills blanks and skips verified user fields', () => {
    const { fills, conflicts } = mergeCatalogEvidence({
      current: { name: 'Keep', material: '', color: 'Black' },
      evidence: { name: 'Other', material: 'Cotton', color: 'White' },
      verifiedFields: new Set(['name']),
    });
    expect(fills).toEqual({ material: 'Cotton' });
    expect(conflicts).toEqual([
      { field: 'name', current: 'Keep', proposed: 'Other' },
      { field: 'color', current: 'Black', proposed: 'White' },
    ]);
  });
});

describe('factorsWithSettings', () => {
  it('folds duty/surtax into otherTaxRate and preserves recoverable GST', () => {
    const settings = mapCatalogSettingsRow({
      id: 's1',
      line_id: 'l1',
      catalog_year: 2026,
      min_order_pieces: 24,
      min_pieces_per_design: 6,
      shipping_origin: 'US',
      pricing_assumption_version: 'v1',
      duty_rate: 0.02,
      surtax_rate: 0.01,
      brokerage_allocation_cad: 5,
      freight_allocation_cad: 0,
      import_gst_recoverable: true,
      terms_verified: false,
      terms_note: null,
      default_shipping_method: 'UPS Ground',
      prices_subject_to_change: true,
      backorder_policy: null,
      order_processing_policy: null,
      claims_policy: null,
      returns_policy: null,
      created_at: '',
      updated_at: '',
    } satisfies CatalogSettingsRow);

    const factors = factorsWithSettings(
      { fx: 1.45, freightRate: 0.1, gstRate: 0.05, otherTaxRate: 0.02 },
      settings,
    );
    expect(factors.otherTaxRate).toBeCloseTo(0.05);
    expect(factors.dutyRate).toBe(0.02);
    expect(factors.importGstRecoverable).toBe(true);

    const before = landedCadBeforeRecoverableGst(13, factors);
    const margin = marginPct(13, 39.99, factors);
    expect(before).toBeGreaterThan(13 * 1.45 * 1.1);
    expect(margin).not.toBeNull();
  });
});
