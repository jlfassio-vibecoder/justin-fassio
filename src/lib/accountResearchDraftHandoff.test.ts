import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAccountEmailPickDraftTarget,
  buildResearchMatchDraftTarget,
  generateDraftFromAccountEmailPick,
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

vi.mock('@/lib/agentProductOutreachDraftClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agentProductOutreachDraftClient')>();
  return {
    ...actual,
    generateAgentProductOutreachDraft: mocks.generateDraft,
    getAgentProductOutreachDraftClient: mocks.getDraft,
  };
});

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

  it('builds staff-picked Active Account email target without research match fit', () => {
    const prospect = prospectFixture({
      id: 7,
      name: 'Kelowna Golf',
      category: 'golf_retail',
      secondaryChannels: ['resort_hospitality'],
    });
    const catalog = catalogItemStub({
      id: 'prod-1',
      publicSlug: 'american-revival',
      sku: 'OGR-101',
      name: 'American Revival',
      isNew: true,
    });

    const target = buildAccountEmailPickDraftTarget({
      prospect,
      catalogItem: catalog,
      contact: {
        accountContactId: 'c1',
        toEmail: 'buyer@example.com',
        toName: 'Sam',
      },
      preparationDate: '2026-08-30',
    });

    expect(target).toMatchObject({
      preparationDate: '2026-08-30',
      prospectId: 7,
      accountContactId: 'c1',
      toEmail: 'buyer@example.com',
      toName: 'Sam',
      catalogItemId: 'prod-1',
      productSku: 'OGR-101',
      productName: 'American Revival',
      productSlug: 'american-revival',
      productIsNew: true,
      productSalesRank: null,
      selectionReasons: {
        priority: null,
        fitScore: null,
        channelMatch: false,
        productFit: 'global_fallback',
        exclusionsChecked: true,
      },
    });
  });

  it('requires a saved contact before generating from account email pick', async () => {
    const prospect = prospectFixture({ id: 7, name: 'Kelowna Golf' });
    const catalog = catalogItemStub({
      publicSlug: 'american-revival',
      sku: 'OGR-101',
      name: 'American Revival',
    });

    const result = await generateDraftFromAccountEmailPick({
      prospect,
      catalogItem: catalog,
      contact: {
        accountContactId: '',
        toEmail: 'buyer@example.com',
        toName: 'Sam',
      },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Select a saved contact with an email to send product email.',
    });
    expect(mocks.generateDraft).not.toHaveBeenCalled();
  });

  it('generates draft from account email pick without catalog lookup', async () => {
    const prospect = prospectFixture({ id: 7, name: 'Kelowna Golf' });
    const catalog = catalogItemStub({
      id: 'prod-1',
      publicSlug: 'american-revival',
      sku: 'OGR-101',
      name: 'American Revival',
    });
    mocks.generateDraft.mockResolvedValue({ ok: true, systemMessageId: 'draft-aa-1' });
    mocks.getDraft.mockResolvedValue({
      ok: true,
      draft: {
        id: 'draft-aa-1',
        toEmail: 'buyer@example.com',
        toName: 'Sam',
        subject: 'Subject',
        introText: 'Intro',
        closingText: 'Closing',
        prospectId: 7,
        accountContactId: 'c1',
        catalogItemId: catalog.id,
        payload: { sku: catalog.sku, slug: 'american-revival' },
      },
    });

    const result = await generateDraftFromAccountEmailPick({
      prospect,
      catalogItem: catalog,
      contact: {
        accountContactId: 'c1',
        toEmail: 'buyer@example.com',
        toName: 'Sam',
      },
      salesLineId: 'line-1',
      retailerLineAccountId: 'rla-1',
    });

    expect(result.ok).toBe(true);
    expect(mocks.fetchCatalogItems).not.toHaveBeenCalled();
    expect(mocks.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        salesLineId: 'line-1',
        retailerLineAccountId: 'rla-1',
        target: expect.objectContaining({
          selectionReasons: expect.objectContaining({
            productFit: 'global_fallback',
            channelMatch: false,
            exclusionsChecked: true,
          }),
        }),
      }),
    );
    if (result.ok) {
      expect(result.draft.id).toBe('draft-aa-1');
      expect(result.catalogItem.id).toBe('prod-1');
    }
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
