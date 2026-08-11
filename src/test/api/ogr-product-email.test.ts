import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicOgrProduct } from '@/lib/publicCatalog';

const requireApprovedStaffClientMock = vi.fn();
const loadPublishedOgrProductForEmailMock = vi.fn();
const sendOgrProductOutreachEmailMock = vi.fn();
const renderOgrProductOutreachEmailMock = vi.fn();
const buildPublicProductPresentationMock = vi.fn();
const buildOgrProductUrlMock = vi.fn();
const resolvePublicSiteOriginMock = vi.fn();
const resolveProductOutreachCrmAssociationMock = vi.fn();
const insertProductOutreachSystemMessageMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/loadPublishedOgrProductForEmail', () => ({
  loadPublishedOgrProductForEmail: (...args: unknown[]) =>
    loadPublishedOgrProductForEmailMock(...args),
}));

vi.mock('@/lib/sendOgrProductOutreachEmail', () => ({
  sendOgrProductOutreachEmail: (...args: unknown[]) => sendOgrProductOutreachEmailMock(...args),
}));

vi.mock('@/lib/ogrProductOutreachEmail', () => ({
  renderOgrProductOutreachEmail: (...args: unknown[]) => renderOgrProductOutreachEmailMock(...args),
}));

vi.mock('@/lib/publicProductPresentation', () => ({
  buildPublicProductPresentation: (...args: unknown[]) =>
    buildPublicProductPresentationMock(...args),
}));

vi.mock('@/lib/productUrls', () => ({
  buildOgrProductUrl: (...args: unknown[]) => buildOgrProductUrlMock(...args),
  resolvePublicSiteOrigin: (...args: unknown[]) => resolvePublicSiteOriginMock(...args),
}));

vi.mock('@/lib/systemMessages', () => ({
  resolveProductOutreachCrmAssociation: (...args: unknown[]) =>
    resolveProductOutreachCrmAssociationMock(...args),
  insertProductOutreachSystemMessage: (...args: unknown[]) =>
    insertProductOutreachSystemMessageMock(...args),
}));

import { POST } from '@/pages/api/staff/ogr-product-email';

const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const publishedProduct: PublicOgrProduct = {
  id: PRODUCT_ID,
  sku: 'OG2513',
  publicSlug: 'american-revival',
  name: 'American Revival',
  cat: 'Tees',
  color: 'Navy',
  tagline: 'Classic fit',
  description: 'A strong opener.',
  page: 12,
  catalogYear: 2025,
  collection: 'Core',
  wholesaleUsd: null,
  msrpCad: 48,
  isNew: true,
  featured: false,
  publicSortOrder: 10,
  primaryImageUrl: 'https://cdn.example.com/og2513.jpg',
  alternateImageUrls: [],
  unitOfMeasure: 'each',
  minimumQuantity: 6,
  orderMultiple: 6,
  packQuantity: null,
  lifestyleThemes: ['classic'],
  liveSku: null,
  availableSizes: ['L'],
};

function requestWith(body: unknown) {
  return {
    request: new Request('http://localhost/api/staff/ogr-product-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

function mockStaffGate() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { display_name: 'Justin Fassio' },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  requireApprovedStaffClientMock.mockResolvedValue({
    ok: true,
    userId: 'user-1',
    supabase: { from },
  });
}

describe('POST /api/staff/ogr-product-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaffGate();
    loadPublishedOgrProductForEmailMock.mockResolvedValue({
      ok: true,
      product: publishedProduct,
    });
    buildPublicProductPresentationMock.mockReturnValue({
      id: PRODUCT_ID,
      sku: 'OG2513',
      slug: 'american-revival',
      name: 'American Revival',
      tagline: 'Classic fit',
      description: 'A strong opener.',
      category: 'Tees',
      color: 'Navy',
      primaryImageUrl: 'https://cdn.example.com/og2513.jpg',
      primaryImageAlt: 'American Revival',
      galleryImageUrls: ['https://cdn.example.com/og2513.jpg'],
      lifestyleThemes: ['classic'],
      lifestyleThemeLabels: ['Classic'],
      salesVolumeRank: null,
      isBestSeller: false,
      isNew: true,
      isFeatured: false,
      suggestedRetail: null,
      publicShareTitle: 'American Revival',
      publicShareDescription: 'Classic fit',
    });
    resolvePublicSiteOriginMock.mockReturnValue('https://justinfassio.com');
    buildOgrProductUrlMock.mockReturnValue(
      'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
    );
    renderOgrProductOutreachEmailMock.mockReturnValue({
      subject: 'Old Guys Rule — American Revival',
      html: '<p>Hi</p><div>card</div>',
      text: 'Hi\n\ncard',
    });
    sendOgrProductOutreachEmailMock.mockResolvedValue({
      ok: true,
      resendEmailId: 're_123',
    });
    resolveProductOutreachCrmAssociationMock.mockResolvedValue({
      ok: true,
      association: { prospectId: null, accountContactId: null },
    });
    insertProductOutreachSystemMessageMock.mockResolvedValue({
      ok: true,
      id: 'sm-1',
    });
  });

  it('returns 401 without calling send when unauthenticated', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });

    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'a@b.com' }));
    expect(res.status).toBe(401);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
    expect(loadPublishedOgrProductForEmailMock).not.toHaveBeenCalled();
  });

  it('returns 403 without calling send when non-staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403,
      }),
    });

    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'a@b.com' }));
    expect(res.status).toBe(403);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects invalid recipient', async () => {
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'not-an-email' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/recipient email/i);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects recipient addresses with whitespace or control characters', async () => {
    const res = await POST(
      requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com\r\nBcc: evil@example.com' }),
    );
    expect(res.status).toBe(400);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects client-supplied html', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        html: '<script>alert(1)</script>',
      }),
    );
    expect(res.status).toBe(400);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects client-supplied from', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        from: 'attacker@evil.com',
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Unsupported fields in request' });
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects client-supplied signatureName', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        signatureName: 'Not Justin',
      }),
    );
    expect(res.status).toBe(400);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects non-UUID productId', async () => {
    const res = await POST(requestWith({ productId: 'not-a-uuid', to: 'buyer@example.com' }));
    expect(res.status).toBe(400);
    expect(loadPublishedOgrProductForEmailMock).not.toHaveBeenCalled();
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects overlong introText', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        introText: 'x'.repeat(2001),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/introText is too long/i);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('falls back signature to Justin Fassio when profile display_name is blank', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { display_name: '   ' },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      supabase: { from },
    });

    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(200);
    expect(renderOgrProductOutreachEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ signatureName: 'Justin Fassio' }),
    );
  });

  it('returns 404 for missing product', async () => {
    loadPublishedOgrProductForEmailMock.mockResolvedValue({
      ok: false,
      reason: 'not_found',
      message: 'Product not found',
    });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(404);
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('returns 404 for unpublished product', async () => {
    loadPublishedOgrProductForEmailMock.mockResolvedValue({
      ok: false,
      reason: 'not_available',
      message: 'Product is not publicly available',
    });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Product is not publicly available');
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('sends composed html+text once on success and persists a system message', async () => {
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        recipientName: 'Sam',
        subject: 'Custom subject',
        introText: 'Custom intro',
        closingText: 'Custom close',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      systemMessageId: 'sm-1',
      resendEmailId: 're_123',
    });

    expect(loadPublishedOgrProductForEmailMock).toHaveBeenCalledWith(expect.anything(), PRODUCT_ID);
    expect(resolveProductOutreachCrmAssociationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toEmail: 'buyer@example.com' }),
    );
    expect(buildPublicProductPresentationMock).toHaveBeenCalledWith(publishedProduct);
    expect(resolvePublicSiteOriginMock).toHaveBeenCalled();
    expect(buildOgrProductUrlMock).toHaveBeenCalledWith(
      'american-revival',
      'https://justinfassio.com',
    );
    expect(renderOgrProductOutreachEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productHref: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
        signatureName: 'Justin Fassio',
        recipientName: 'Sam',
        subject: 'Custom subject',
        introText: 'Custom intro',
        closingText: 'Custom close',
      }),
    );
    expect(sendOgrProductOutreachEmailMock).toHaveBeenCalledOnce();
    expect(sendOgrProductOutreachEmailMock).toHaveBeenCalledWith({
      to: 'buyer@example.com',
      subject: 'Old Guys Rule — American Revival',
      html: '<p>Hi</p><div>card</div>',
      text: 'Hi\n\ncard',
    });
    expect(insertProductOutreachSystemMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        catalogItemId: PRODUCT_ID,
        resendEmailId: 're_123',
        toEmail: 'buyer@example.com',
        toName: 'Sam',
        subject: 'Old Guys Rule — American Revival',
        sentBy: 'user-1',
        prospectId: null,
        accountContactId: null,
        payload: expect.objectContaining({
          sku: 'OG2513',
          name: 'American Revival',
          slug: 'american-revival',
          productHref: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
        }),
      }),
    );
    // Pathnames may contain "wholesale"; assert against pricing leakage instead.
    expect(buildPublicProductPresentationMock).toHaveBeenCalledWith(
      expect.objectContaining({ wholesaleUsd: null }),
    );
    const sentHtml = String(sendOgrProductOutreachEmailMock.mock.calls[0]?.[0]?.html ?? '');
    expect(sentHtml).not.toMatch(/wholesaleUsd|US\$\s*\d|\$\d+\.\d{2}/i);
  });

  it('persists CRM FKs from unique email match', async () => {
    resolveProductOutreachCrmAssociationMock.mockResolvedValue({
      ok: true,
      association: { prospectId: 42, accountContactId: CONTACT_ID },
    });

    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(200);
    expect(insertProductOutreachSystemMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prospectId: 42,
        accountContactId: CONTACT_ID,
      }),
    );
  });

  it('returns 400 and does not send when CRM ids are invalid', async () => {
    resolveProductOutreachCrmAssociationMock.mockResolvedValue({
      ok: false,
      error: 'Account contact does not belong to the given prospect',
    });

    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        prospectId: 42,
        accountContactId: CONTACT_ID,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'Account contact does not belong to the given prospect',
    });
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
    expect(insertProductOutreachSystemMessageMock).not.toHaveBeenCalled();
  });

  it('returns 400 when only prospectId is provided', async () => {
    resolveProductOutreachCrmAssociationMock.mockResolvedValue({
      ok: false,
      error: 'prospectId and accountContactId must be provided together',
    });
    const res = await POST(
      requestWith({
        productId: PRODUCT_ID,
        to: 'buyer@example.com',
        prospectId: 42,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'prospectId and accountContactId must be provided together',
    });
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
    expect(insertProductOutreachSystemMessageMock).not.toHaveBeenCalled();
  });

  it('does not insert when Resend fails', async () => {
    sendOgrProductOutreachEmailMock.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(503);
    expect(insertProductOutreachSystemMessageMock).not.toHaveBeenCalled();
  });

  it('returns 200 ok when persist fails after send', async () => {
    insertProductOutreachSystemMessageMock.mockResolvedValue({
      ok: false,
      error: 'insert failed',
    });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      resendEmailId: 're_123',
      logged: false,
    });
  });

  it('returns 503 Email is not configured when Resend key missing', async () => {
    sendOgrProductOutreachEmailMock.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'Email is not configured' });
  });

  it('returns 502 on Resend rejection without exposing provider detail', async () => {
    sendOgrProductOutreachEmailMock.mockResolvedValue({
      ok: false,
      reason: 'send_failed',
      error: 'secret provider detail',
    });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Failed to send email');
    expect(JSON.stringify(body)).not.toContain('secret provider detail');
  });

  it('returns actionable 502 when Resend domain is not verified', async () => {
    sendOgrProductOutreachEmailMock.mockResolvedValue({
      ok: false,
      reason: 'send_failed',
      error: 'The justinfassio.com domain is not verified. Please, add and verify your domain',
    });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/domain is not verified/i);
    expect(body.error).toMatch(/resend\.com\/domains/i);
  });

  it('returns 400 when public URL cannot be built', async () => {
    buildOgrProductUrlMock.mockImplementation(() => {
      throw new Error('Invalid OGR product slug');
    });
    const res = await POST(requestWith({ productId: PRODUCT_ID, to: 'buyer@example.com' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Invalid public product URL' });
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });
});
