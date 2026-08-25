import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getAgentProductOutreachDraftByIdMock = vi.fn();
const updateAgentProductOutreachDraftMock = vi.fn();
const loadPublishedOgrProductForEmailMock = vi.fn();
const buildPublicProductPresentationMock = vi.fn();
const buildOgrProductUrlMock = vi.fn();
const resolvePublicSiteOriginMock = vi.fn();
const resolveOgrPricingMarketMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/systemMessages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/systemMessages')>();
  return {
    ...actual,
    getAgentProductOutreachDraftById: (...args: unknown[]) =>
      getAgentProductOutreachDraftByIdMock(...args),
    updateAgentProductOutreachDraft: (...args: unknown[]) =>
      updateAgentProductOutreachDraftMock(...args),
  };
});

vi.mock('@/lib/loadPublishedOgrProductForEmail', () => ({
  loadPublishedOgrProductForEmail: (...args: unknown[]) =>
    loadPublishedOgrProductForEmailMock(...args),
}));

vi.mock('@/lib/publicProductPresentation', () => ({
  buildPublicProductPresentation: (...args: unknown[]) =>
    buildPublicProductPresentationMock(...args),
}));

vi.mock('@/lib/productUrls', () => ({
  buildOgrProductUrl: (...args: unknown[]) => buildOgrProductUrlMock(...args),
  resolvePublicSiteOrigin: (...args: unknown[]) => resolvePublicSiteOriginMock(...args),
}));

vi.mock('@/lib/resolveAccountPricingMarket', () => ({
  resolveOgrPricingMarketForProductEmailDraft: (...args: unknown[]) =>
    resolveOgrPricingMarketMock(...args),
}));

import { PATCH } from '@/pages/api/staff/ogr-product-email/drafts/[id]';

const DRAFT_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const OLD_PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const NEW_PRODUCT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const CONTACT_ID = 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

const existingDraft = {
  id: DRAFT_ID,
  messageType: 'product_outreach',
  origin: 'agent_product_email',
  status: 'draft',
  catalogItemId: OLD_PRODUCT_ID,
  resendEmailId: null,
  toEmail: 'buyer@example.com',
  toName: 'Tony',
  subject: 'Old Guys Rule — OLD SKU',
  introText: 'Keep this intro.',
  closingText: 'Keep this closing.',
  prospectId: 42,
  retailerLineAccountId: null,
  accountContactId: CONTACT_ID,
  sentBy: 'user-1',
  queuedAt: null,
  sentAt: null,
  payload: {
    sku: 'OLD',
    name: 'OLD SKU',
    slug: 'old-sku',
    productHref: 'https://example.com/old',
  },
  automationRunId: null,
  createdAt: '2026-08-25T00:00:00Z',
  updatedAt: '2026-08-25T00:00:00Z',
};

function patchRequest(body: unknown): Parameters<typeof PATCH>[0] {
  return {
    params: { id: DRAFT_ID },
    request: new Request(`http://localhost/api/staff/ogr-product-email/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify(body),
    }),
  } as unknown as Parameters<typeof PATCH>[0];
}

describe('PATCH /api/staff/ogr-product-email/drafts/[id] product swap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    getAgentProductOutreachDraftByIdMock.mockResolvedValue({ ok: true, draft: existingDraft });
    loadPublishedOgrProductForEmailMock.mockResolvedValue({
      ok: true,
      product: {
        id: NEW_PRODUCT_ID,
        sku: 'OG2162',
        name: 'AMERICAN EAGLE',
        publicSlug: 'american-eagle',
      },
    });
    buildPublicProductPresentationMock.mockReturnValue({
      sku: 'OG2162',
      name: 'AMERICAN EAGLE',
      slug: 'american-eagle',
    });
    resolvePublicSiteOriginMock.mockReturnValue('https://justinfassio.com');
    resolveOgrPricingMarketMock.mockResolvedValue({ publicMarket: 'ca' });
    buildOgrProductUrlMock.mockReturnValue(
      'https://justinfassio.com/old-guys-rule-wholesale/american-eagle',
    );
    updateAgentProductOutreachDraftMock.mockResolvedValue({
      ok: true,
      draft: {
        ...existingDraft,
        catalogItemId: NEW_PRODUCT_ID,
        subject: 'Old Guys Rule — AMERICAN EAGLE',
        payload: {
          sku: 'OG2162',
          name: 'AMERICAN EAGLE',
          slug: 'american-eagle',
          productHref: 'https://justinfassio.com/old-guys-rule-wholesale/american-eagle',
        },
      },
    });
  });

  it('swaps catalog item and subject without overwriting intro/closing', async () => {
    const res = await PATCH(patchRequest({ productId: NEW_PRODUCT_ID }));
    expect(res.status).toBe(200);
    expect(loadPublishedOgrProductForEmailMock).toHaveBeenCalledWith(
      {},
      NEW_PRODUCT_ID,
      expect.any(Object),
    );
    expect(updateAgentProductOutreachDraftMock).toHaveBeenCalledWith(
      {},
      DRAFT_ID,
      expect.objectContaining({
        catalogItemId: NEW_PRODUCT_ID,
        subject: 'Old Guys Rule — AMERICAN EAGLE',
        payload: expect.objectContaining({
          sku: 'OG2162',
          name: 'AMERICAN EAGLE',
          slug: 'american-eagle',
        }),
      }),
    );
    const updateArg = updateAgentProductOutreachDraftMock.mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;
    expect(updateArg.introText).toBeUndefined();
    expect(updateArg.closingText).toBeUndefined();
  });
});
