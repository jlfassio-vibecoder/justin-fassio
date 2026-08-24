import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildResearchMatchDraftTarget,
  generateDraftFromResearchMatch,
} from '@/lib/accountResearchDraftHandoff';
import { catalogItemStub } from '@/lib/catalog';
import { prospectFixture } from '@/lib/prospectFixture';

const mocks = vi.hoisted(() => ({
  fetchCatalogItems: vi.fn(),
  generateDraft: vi.fn(),
  getDraft: vi.fn(),
}));

vi.mock('@/lib/catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/catalog')>();
  return { ...original, fetchCatalogItems: mocks.fetchCatalogItems };
});

vi.mock('@/lib/agentProductOutreachDraftClient', () => ({
  generateAgentProductOutreachDraft: mocks.generateDraft,
  getAgentProductOutreachDraftClient: mocks.getDraft,
}));

describe('accountResearchDraftHandoff', () => {
  beforeEach(() => {
    mocks.fetchCatalogItems.mockReset();
    mocks.generateDraft.mockReset();
    mocks.getDraft.mockReset();
  });

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

  it('propagates the selected retailer line account into draft generation', async () => {
    const prospect = prospectFixture({ id: 42, name: 'Coastal Golf' });
    const catalog = catalogItemStub({
      publicSlug: 'american-revival',
      sku: 'OGR-101',
      name: 'American Revival',
    });
    const matchItem = {
      id: 'item-1',
      rank: 1,
      catalog_item_id: catalog.id,
      sku: catalog.sku,
      name: catalog.name,
      product_fit: 'channel_intersect' as const,
      rationale: 'Strong fit.',
      citation_ids: ['c1'],
    };
    mocks.fetchCatalogItems.mockResolvedValue({ data: [catalog], error: null });
    mocks.generateDraft.mockResolvedValue({ ok: true, systemMessageId: 'draft-1' });
    mocks.getDraft.mockResolvedValue({
      ok: true,
      draft: {
        id: 'draft-1',
        toEmail: 'buyer@example.com',
        toName: 'Buyer',
        subject: 'Subject',
        introText: 'Intro',
        closingText: 'Closing',
        prospectId: 42,
        accountContactId: 'contact-1',
        catalogItemId: catalog.id,
        payload: { sku: catalog.sku, slug: 'american-revival' },
      },
    });

    const result = await generateDraftFromResearchMatch({
      prospect,
      matchItem,
      contact: {
        accountContactId: 'contact-1',
        toEmail: 'buyer@example.com',
        toName: 'Buyer',
      },
      salesLineId: 'line-1',
      retailerLineAccountId: 'rla-1',
    });

    expect(result.ok).toBe(true);
    expect(mocks.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        salesLineId: 'line-1',
        retailerLineAccountId: 'rla-1',
      }),
    );
  });
});
