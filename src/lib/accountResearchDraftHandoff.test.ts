import { describe, expect, it } from 'vitest';
import { buildResearchMatchDraftTarget } from '@/lib/accountResearchDraftHandoff';
import { catalogItemStub } from '@/lib/catalog';
import { prospectFixture } from '@/lib/prospectFixture';

describe('accountResearchDraftHandoff', () => {
  it('builds generate-draft target with selection reasons from match item', () => {
    const prospect = prospectFixture({
      id: 42,
      name: 'Coastal Golf',
      category: 'golf_retail',
      secondaryChannels: ['resort_hospitality'],
    });

    const catalog = catalogItemStub({ sku: 'OGR-101', name: 'American Revival' });
    const target = buildResearchMatchDraftTarget({
      prospect,
      matchItem: {
        id: 'item-1',
        rank: 1,
        catalog_item_id: catalog.id,
        sku: catalog.sku,
        name: catalog.name,
        product_fit: 'channel_intersect',
        rationale: 'Strong golf overlap.',
        citation_ids: ['c1'],
      },
      contact: {
        accountContactId: 'contact-1',
        toEmail: 'buyer@example.com',
        toName: 'Buyer',
      },
      productSlug: 'american-revival',
      productIsNew: false,
      productSalesRank: 5,
      preparationDate: '2026-08-23',
    });

    expect(target.prospectId).toBe(42);
    expect(target.catalogItemId).toBe(catalog.id);
    expect(target.selectionReasons.channelMatch).toBe(true);
    expect(target.selectionReasons.productFit).toBe('channel_intersect');
    expect(target.selectionReasons.exclusionsChecked).toBe(true);
  });
});
