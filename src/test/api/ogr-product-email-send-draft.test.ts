import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const getAgentProductOutreachDraftByIdMock = vi.fn();
const markAgentProductOutreachDraftSentMock = vi.fn();
const stampAgentProductOutreachDraftResendIdMock = vi.fn();
const stampResendEmailIdWithRetryMock = vi.fn();
const requireExplicitProductOutreachCrmAssociationMock = vi.fn();
const loadPublishedOgrProductForEmailMock = vi.fn();
const buildPublicProductPresentationMock = vi.fn();
const buildOgrProductUrlMock = vi.fn();
const buildOgrCollectionUrlMock = vi.fn();
const resolvePublicSiteOriginMock = vi.fn();
const resolveOgrPricingMarketForProspectMock = vi.fn();
const resolveStaffOutreachSenderNamesMock = vi.fn();
const renderOgrProductOutreachEmailMock = vi.fn();
const sendOgrProductOutreachEmailMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const replayUnmatchedResendEventsMock = vi.fn();
const fetchAccountContactByIdMock = vi.fn();
const sendSiblingProductOutreachEmailsMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/systemMessages', () => ({
  getAgentProductOutreachDraftById: (...args: unknown[]) =>
    getAgentProductOutreachDraftByIdMock(...args),
  markAgentProductOutreachDraftSent: (...args: unknown[]) =>
    markAgentProductOutreachDraftSentMock(...args),
  stampAgentProductOutreachDraftResendId: (...args: unknown[]) =>
    stampAgentProductOutreachDraftResendIdMock(...args),
  stampResendEmailIdWithRetry: (...args: unknown[]) => stampResendEmailIdWithRetryMock(...args),
  requireExplicitProductOutreachCrmAssociation: (...args: unknown[]) =>
    requireExplicitProductOutreachCrmAssociationMock(...args),
  publicMarketFromOutreachPayload: (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const value = (payload as { publicMarket?: unknown }).publicMarket;
    return value === 'ca' || value === 'us' ? value : null;
  },
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

vi.mock('@/lib/resendWebhook', () => ({
  replayUnmatchedResendEvents: (...args: unknown[]) => replayUnmatchedResendEventsMock(...args),
}));

vi.mock('@/lib/accountContacts', () => ({
  fetchAccountContactById: (...args: unknown[]) => fetchAccountContactByIdMock(...args),
}));

vi.mock('@/lib/sendSiblingProductOutreachEmails', () => ({
  sendSiblingProductOutreachEmails: (...args: unknown[]) =>
    sendSiblingProductOutreachEmailsMock(...args),
}));

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
  buildOgrCollectionUrl: (...args: unknown[]) => buildOgrCollectionUrlMock(...args),
  resolvePublicSiteOrigin: (...args: unknown[]) => resolvePublicSiteOriginMock(...args),
}));

vi.mock('@/lib/resolveAccountPricingMarket', () => ({
  resolveOgrPricingMarketForProductEmailDraft: (...args: unknown[]) =>
    resolveOgrPricingMarketForProspectMock(...args),
}));

vi.mock('@/lib/ogrProductEmailSender', () => ({
  resolveStaffOutreachSenderNames: (...args: unknown[]) =>
    resolveStaffOutreachSenderNamesMock(...args),
}));

vi.mock('@/lib/ogrProductOutreachEmail', () => ({
  renderOgrProductOutreachEmail: (...args: unknown[]) => renderOgrProductOutreachEmailMock(...args),
}));

vi.mock('@/lib/sendOgrProductOutreachEmail', () => ({
  sendOgrProductOutreachEmail: (...args: unknown[]) => sendOgrProductOutreachEmailMock(...args),
}));

import { POST } from '@/pages/api/staff/ogr-product-email/drafts/[id]/send';

const DRAFT_ID = 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const draft = {
  id: DRAFT_ID,
  messageType: 'product_outreach',
  origin: 'agent_product_email',
  status: 'draft',
  catalogItemId: PRODUCT_ID,
  resendEmailId: null,
  toEmail: 'buyer@example.com',
  toName: 'Sam',
  subject: 'Old Guys Rule — American Revival',
  introText: 'Custom intro',
  closingText: 'Custom closing',
  prospectId: 42,
  accountContactId: CONTACT_ID,
  sentBy: 'creator-1',
  queuedAt: null,
  sentAt: null,
  payload: {
    sku: 'OG2513',
    name: 'American Revival',
    slug: 'american-revival',
    productHref: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
  },
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
};

function ctx(body?: unknown): Parameters<typeof POST>[0] {
  return {
    params: { id: DRAFT_ID },
    request: new Request(`http://localhost/api/staff/ogr-product-email/drafts/${DRAFT_ID}/send`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer t',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/staff/ogr-product-email/drafts/[id]/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'approver-1',
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { display_name: 'Alex Rivera', email: 'a@x.com' } }),
            }),
          }),
        }),
        auth: {
          getUser: () => Promise.resolve({ data: { user: { user_metadata: {} } } }),
        },
      },
    });
    getAgentProductOutreachDraftByIdMock.mockResolvedValue({ ok: true, draft });
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
    buildOgrCollectionUrlMock.mockReturnValue('https://justinfassio.com/old-guys-rule-wholesale');
    resolveStaffOutreachSenderNamesMock.mockReturnValue({
      signatureName: 'Alex',
      fromDisplayName: 'Alex Rivera',
    });
    renderOgrProductOutreachEmailMock.mockReturnValue({
      subject: 'Old Guys Rule — American Revival',
      html: '<p>hi</p>',
      text: 'hi',
    });
    sendOgrProductOutreachEmailMock.mockResolvedValue({
      ok: true,
      resendEmailId: 're_draft_1',
    });
    markAgentProductOutreachDraftSentMock.mockResolvedValue({ ok: true, id: DRAFT_ID });
    stampResendEmailIdWithRetryMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    getServiceRoleClientMock.mockReturnValue(null);
    replayUnmatchedResendEventsMock.mockResolvedValue({
      attempted: 0,
      applied: 0,
      duplicates: 0,
      failed: 0,
    });
    fetchAccountContactByIdMock.mockResolvedValue({ data: null, error: null });
    sendSiblingProductOutreachEmailsMock.mockResolvedValue(undefined);
  });

  it('renders, sends via Resend, and marks the same draft row sent', async () => {
    const res = await POST(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      systemMessageId: DRAFT_ID,
      resendEmailId: 're_draft_1',
    });
    expect(renderOgrProductOutreachEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Old Guys Rule — American Revival',
        introText: 'Custom intro',
        closingText: 'Custom closing',
        recipientName: 'Sam',
        signatureName: 'Alex',
      }),
    );
    expect(sendOgrProductOutreachEmailMock).toHaveBeenCalledOnce();
    expect(stampResendEmailIdWithRetryMock).toHaveBeenCalledOnce();
    expect(markAgentProductOutreachDraftSentMock).toHaveBeenCalledWith(
      expect.anything(),
      DRAFT_ID,
      expect.objectContaining({
        resendEmailId: 're_draft_1',
        sentBy: 'approver-1',
      }),
    );
    expect(sendSiblingProductOutreachEmailsMock).not.toHaveBeenCalled();
  });

  it('fans out a sibling send when the draft contact is Primary with alternate email', async () => {
    fetchAccountContactByIdMock.mockResolvedValue({
      data: {
        id: CONTACT_ID,
        accountId: 42,
        role: 'buyer',
        fullName: 'Sam',
        title: null,
        phone: null,
        email: 'buyer@example.com',
        alternateEmail: 'alt@example.com',
        isPrimary: true,
        notes: null,
        createdAt: '',
        updatedAt: '',
      },
      error: null,
    });

    const res = await POST(ctx());
    expect(res.status).toBe(200);
    expect(sendOgrProductOutreachEmailMock).toHaveBeenCalledOnce();
    expect(sendSiblingProductOutreachEmailsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emails: ['alt@example.com'],
        accountContactId: CONTACT_ID,
        prospectId: 42,
      }),
    );
  });

  it('leaves draft unsent when Resend fails', async () => {
    sendOgrProductOutreachEmailMock.mockResolvedValue({
      ok: false,
      reason: 'provider_error',
      error: 'boom',
    });
    const res = await POST(ctx());
    expect(res.status).toBe(502);
    expect(stampResendEmailIdWithRetryMock).not.toHaveBeenCalled();
  });

  it('returns logged false when stamp fails after send', async () => {
    stampResendEmailIdWithRetryMock.mockResolvedValue({ ok: false, error: 'stamp failed' });
    const res = await POST(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      systemMessageId: DRAFT_ID,
      resendEmailId: 're_draft_1',
      logged: false,
    });
  });

  it('rejects client-supplied html on send-draft', async () => {
    const res = await POST(ctx({ html: '<p>x</p>' }));
    expect(res.status).toBe(400);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects non-draft status', async () => {
    getAgentProductOutreachDraftByIdMock.mockResolvedValue({
      ok: true,
      draft: { ...draft, status: 'sent' },
    });
    const res = await POST(ctx());
    expect(res.status).toBe(409);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('recomputes U.S. hrefs from the current RLA and does not keep the stored Canadian URL', async () => {
    resolveOgrPricingMarketForProspectMock.mockResolvedValue({ publicMarket: 'us' });
    buildOgrProductUrlMock.mockReturnValue(
      'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
    );
    buildOgrCollectionUrlMock.mockReturnValue(
      'https://justinfassio.com/old-guys-rule-wholesale/us',
    );
    const res = await POST(ctx());
    expect(res.status).toBe(200);
    expect(resolveOgrPricingMarketForProspectMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prospectId: 42, payloadMarket: null }),
    );
    expect(buildOgrProductUrlMock).toHaveBeenCalledWith(
      'american-revival',
      'https://justinfassio.com',
      'us',
    );
    expect(renderOgrProductOutreachEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productHref: 'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
      }),
    );
    expect(markAgentProductOutreachDraftSentMock).toHaveBeenCalledWith(
      expect.anything(),
      DRAFT_ID,
      expect.objectContaining({
        payload: expect.objectContaining({
          publicMarket: 'us',
          productHref: 'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
        }),
      }),
    );
  });

  it('uses unknown-market U.S. paths when the assignment is invalid instead of Canada', async () => {
    resolveOgrPricingMarketForProspectMock.mockResolvedValue({
      publicMarket: 'us',
      source: 'unknown',
    });
    buildOgrProductUrlMock.mockReturnValue(
      'https://justinfassio.com/old-guys-rule-wholesale/us/american-revival',
    );
    const res = await POST(ctx());
    expect(res.status).toBe(200);
    expect(buildOgrProductUrlMock).toHaveBeenCalledWith(
      'american-revival',
      'https://justinfassio.com',
      'us',
    );
    expect(buildOgrProductUrlMock).not.toHaveBeenCalledWith(
      'american-revival',
      'https://justinfassio.com',
    );
  });
});
