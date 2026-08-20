import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const loadPublishedOgrProductForEmailMock = vi.fn();
const insertAgentProductOutreachDraftMock = vi.fn();
const listAgentProductOutreachDraftsMock = vi.fn();
const requireExplicitProductOutreachCrmAssociationMock = vi.fn();
const buildPublicProductPresentationMock = vi.fn();
const buildOgrProductUrlMock = vi.fn();
const resolvePublicSiteOriginMock = vi.fn();
const resolveOgrPricingMarketForProspectMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/loadPublishedOgrProductForEmail', () => ({
  loadPublishedOgrProductForEmail: (...args: unknown[]) =>
    loadPublishedOgrProductForEmailMock(...args),
}));

vi.mock('@/lib/systemMessages', () => ({
  insertAgentProductOutreachDraft: (...args: unknown[]) =>
    insertAgentProductOutreachDraftMock(...args),
  listAgentProductOutreachDrafts: (...args: unknown[]) =>
    listAgentProductOutreachDraftsMock(...args),
  requireExplicitProductOutreachCrmAssociation: (...args: unknown[]) =>
    requireExplicitProductOutreachCrmAssociationMock(...args),
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
    resolveOgrPricingMarketForProspectMock(...args),
}));

import { GET, POST } from '@/pages/api/staff/ogr-product-email/drafts/index';

const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

function requestWith(body: unknown, method = 'POST'): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/staff/ogr-product-email/drafts', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

describe('POST /api/staff/ogr-product-email/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    requireExplicitProductOutreachCrmAssociationMock.mockResolvedValue({
      ok: true,
      association: { prospectId: 42, accountContactId: CONTACT_ID },
    });
    loadPublishedOgrProductForEmailMock.mockResolvedValue({
      ok: true,
      product: {
        id: PRODUCT_ID,
        sku: 'OG2513',
        name: 'American Revival',
        publicSlug: 'american-revival',
      },
    });
    buildPublicProductPresentationMock.mockReturnValue({
      sku: 'OG2513',
      name: 'American Revival',
      slug: 'american-revival',
    });
    resolvePublicSiteOriginMock.mockReturnValue('https://justinfassio.com');
    resolveOgrPricingMarketForProspectMock.mockResolvedValue({ publicMarket: 'ca' });
    buildOgrProductUrlMock.mockReturnValue(
      'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
    );
    insertAgentProductOutreachDraftMock.mockResolvedValue({ ok: true, id: 'draft-1' });
  });

  it('creates an agent draft without calling Resend helpers', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        toName: 'Sam',
        prospectId: 42,
        accountContactId: CONTACT_ID,
        introText: 'Custom intro',
        closingText: 'Custom closing',
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, systemMessageId: 'draft-1' });
    expect(insertAgentProductOutreachDraftMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        catalogItemId: PRODUCT_ID,
        toEmail: 'buyer@example.com',
        toName: 'Sam',
        introText: 'Custom intro',
        closingText: 'Custom closing',
        prospectId: 42,
        accountContactId: CONTACT_ID,
        sentBy: 'user-1',
        subject: 'Old Guys Rule — American Revival',
      }),
    );
  });

  it('rejects missing CRM ids', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        toName: 'Sam',
      }),
    );
    expect(res.status).toBe(400);
    expect(insertAgentProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('rejects client-supplied html/from', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        toName: 'Sam',
        prospectId: 42,
        accountContactId: CONTACT_ID,
        html: '<p>x</p>',
      }),
    );
    expect(res.status).toBe(400);
    expect(insertAgentProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('stamps a U.S. href and payload market when the current RLA is US', async () => {
    resolveOgrPricingMarketForProspectMock.mockResolvedValue({ publicMarket: 'us' });
    buildOgrProductUrlMock.mockReturnValue(
      'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
    );
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        toName: 'Sam',
        prospectId: 42,
        accountContactId: CONTACT_ID,
      }),
    );
    expect(res.status).toBe(201);
    expect(buildOgrProductUrlMock).toHaveBeenCalledWith(
      'american-revival',
      'https://justinfassio.com',
      'us',
    );
    expect(insertAgentProductOutreachDraftMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({
          productHref: 'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
          publicMarket: 'us',
        }),
      }),
    );
  });
});

describe('GET /api/staff/ogr-product-email/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    listAgentProductOutreachDraftsMock.mockResolvedValue({
      ok: true,
      drafts: [
        {
          id: 'draft-1',
          messageType: 'product_outreach',
          origin: 'agent_product_email',
          status: 'draft',
          catalogItemId: PRODUCT_ID,
          resendEmailId: null,
          toEmail: 'buyer@example.com',
          toName: 'Sam',
          subject: 'Old Guys Rule — American Revival',
          introText: 'Intro',
          closingText: 'Closing',
          prospectId: 42,
          accountContactId: CONTACT_ID,
          sentBy: 'user-1',
          queuedAt: null,
          sentAt: null,
          payload: {
            sku: 'OG2513',
            name: 'American Revival',
            slug: 'american-revival',
            productHref: 'https://example.com/p',
          },
          createdAt: '2026-08-12T12:00:00.000Z',
          updatedAt: '2026-08-12T12:00:00.000Z',
        },
      ],
    });
  });

  it('lists drafts for a catalog item', async () => {
    const res = await GET({
      request: new Request(
        `http://localhost/api/staff/ogr-product-email/drafts?catalogItemId=${PRODUCT_ID}`,
        { headers: { Authorization: 'Bearer t' } },
      ),
    } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.drafts).toHaveLength(1);
    expect(listAgentProductOutreachDraftsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ catalogItemId: PRODUCT_ID, status: 'draft' }),
    );
  });
});
