import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const checkAgentRateLimitMock = vi.fn();
const generateOgrProductOutreachDraftMock = vi.fn();
const sendOgrProductOutreachEmailMock = vi.fn();
const hasAiGatewayAuthMock = vi.fn(() => true);

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/agentRateLimit', () => ({
  checkAgentRateLimit: (...args: unknown[]) => checkAgentRateLimitMock(...args),
  rateLimitResponse: (retryAfterSec: number) =>
    new Response(JSON.stringify({ ok: false, error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec) },
    }),
}));

vi.mock('@/lib/aiGatewayEnv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aiGatewayEnv')>();
  return {
    ...actual,
    hasAiGatewayAuth: () => hasAiGatewayAuthMock(),
  };
});

vi.mock('@/lib/generateOgrProductOutreachDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/generateOgrProductOutreachDraft')>();
  return {
    ...actual,
    generateOgrProductOutreachDraft: (...args: unknown[]) =>
      generateOgrProductOutreachDraftMock(...args),
  };
});

vi.mock('@/lib/sendOgrProductOutreachEmail', () => ({
  sendOgrProductOutreachEmail: (...args: unknown[]) => sendOgrProductOutreachEmailMock(...args),
}));

import { LOCAL_AI_GATEWAY_AUTH_HELP } from '@/lib/aiGatewayEnv';
import { POST } from '@/pages/api/staff/ogr-product-email/generate-draft';

const CONTACT_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

const target = {
  preparationDate: '2026-08-12',
  prospectId: 10,
  prospectName: 'Golf Shop',
  accountContactId: CONTACT_ID,
  toEmail: 'sam@example.com',
  toName: 'Sam',
  primaryChannel: 'golf_retail',
  secondaryChannels: [],
  catalogItemId: PRODUCT_ID,
  productSku: 'OG1',
  productName: 'Golf Tee',
  productSlug: 'golf-tee',
  productIsNew: false,
  productSalesRank: 1,
  selectionReasons: {
    priority: 'Tier 1',
    fitScore: 8,
    channelMatch: true,
    productFit: 'channel_intersect',
    exclusionsChecked: true,
  },
};

function requestWith(body: unknown): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/staff/ogr-product-email/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

describe('POST /api/staff/ogr-product-email/generate-draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasAiGatewayAuthMock.mockReturnValue(true);
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    checkAgentRateLimitMock.mockReturnValue({ ok: true });
    generateOgrProductOutreachDraftMock.mockResolvedValue({
      ok: true,
      draftId: 'draft-1',
      subject: 'Old Guys Rule — Golf Tee',
      introText: 'Intro',
      closingText: 'Closing',
      fallback: 'none',
    });
  });

  it('returns 503 when AI gateway auth is missing', async () => {
    hasAiGatewayAuthMock.mockReturnValue(false);
    const res = await POST(requestWith({ target }));
    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe(LOCAL_AI_GATEWAY_AUTH_HELP);
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('maps generator failures to 502', async () => {
    generateOgrProductOutreachDraftMock.mockResolvedValue({
      ok: false,
      error: 'gateway down',
    });
    const res = await POST(requestWith({ target }));
    expect(res.status).toBe(502);
    expect(generateOgrProductOutreachDraftMock).toHaveBeenCalled();
  });

  it('generates a single draft without calling Resend', async () => {
    const res = await POST(requestWith({ target }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.systemMessageId).toBe('draft-1');
    expect(json.subject).toBe('Old Guys Rule — Golf Tee');
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
    expect(generateOgrProductOutreachDraftMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: 'user-1',
        copyMode: 'ai',
        target: expect.objectContaining({ prospectId: 10 }),
      }),
    );
  });

  it('rejects unsupported html/from fields', async () => {
    const res = await POST(requestWith({ target, html: '<b>x</b>' }));
    expect(res.status).toBe(400);
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    checkAgentRateLimitMock.mockReturnValue({ ok: false, retryAfterSec: 30 });
    const res = await POST(requestWith({ target }));
    expect(res.status).toBe(429);
  });

  it('rejects multi-target bulk generate', async () => {
    const targets = [
      { ...target, prospectId: 1 },
      { ...target, prospectId: 2 },
    ];
    const res = await POST(requestWith({ targets }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toMatch(/bulk generate/i);
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('accepts a single-element targets array as Add copy', async () => {
    const res = await POST(requestWith({ targets: [target], existingDraftId: 'draft-1' }));
    expect(res.status).toBe(200);
    expect(generateOgrProductOutreachDraftMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: 'user-1',
        copyMode: 'ai',
        existingDraftId: 'draft-1',
        target: expect.objectContaining({ prospectId: 10 }),
      }),
    );
    expect(sendOgrProductOutreachEmailMock).not.toHaveBeenCalled();
  });

  it('rejects invalid recipient email on target', async () => {
    const res = await POST(
      requestWith({
        target: { ...target, toEmail: 'not-an-email' },
      }),
    );
    expect(res.status).toBe(400);
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('rejects non-UUID accountContactId', async () => {
    const res = await POST(
      requestWith({
        target: { ...target, accountContactId: 'not-a-uuid' },
      }),
    );
    expect(res.status).toBe(400);
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });
});
