import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const checkAgentRateLimitMock = vi.fn();
const hasAiGatewayAuthMock = vi.fn(() => true);
const createOutreachFollowUpDraftMock = vi.fn();
const gateStaffAiContextMock = vi.fn();

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

vi.mock('@/lib/aiLineContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aiLineContext')>();
  return {
    ...actual,
    gateStaffAiContext: (...args: unknown[]) => gateStaffAiContextMock(...args),
  };
});

vi.mock('@/lib/createOutreachFollowUpDraft', () => ({
  createOutreachFollowUpDraft: (...args: unknown[]) => createOutreachFollowUpDraftMock(...args),
}));

import { LOCAL_AI_GATEWAY_AUTH_HELP } from '@/lib/aiGatewayEnv';
import { POST } from '@/pages/api/staff/ogr-product-email/follow-up-draft';

const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

function requestWith(body: unknown): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/staff/ogr-product-email/follow-up-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

describe('POST /api/staff/ogr-product-email/follow-up-draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasAiGatewayAuthMock.mockReturnValue(true);
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    checkAgentRateLimitMock.mockReturnValue({ ok: true });
    gateStaffAiContextMock.mockResolvedValue({ ok: true, ctx: null });
    createOutreachFollowUpDraftMock.mockResolvedValue({
      ok: true,
      draftId: 'draft-1',
      catalogItemId: PRODUCT_ID,
      productName: 'American Revival',
      reusedPending: false,
    });
  });

  it('returns 503 when AI gateway auth is missing', async () => {
    hasAiGatewayAuthMock.mockReturnValue(false);
    const res = await POST(requestWith({ prospectId: 12 }));
    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe(LOCAL_AI_GATEWAY_AUTH_HELP);
    expect(createOutreachFollowUpDraftMock).not.toHaveBeenCalled();
  });

  it('returns 400 without prospectId', async () => {
    const res = await POST(requestWith({}));
    expect(res.status).toBe(400);
    expect(createOutreachFollowUpDraftMock).not.toHaveBeenCalled();
  });

  it('maps 409 cooldown rejection', async () => {
    createOutreachFollowUpDraftMock.mockResolvedValue({
      ok: false,
      error: 'Cooldown is still in effect until a click or reply',
      status: 409,
    });
    const res = await POST(requestWith({ prospectId: 12 }));
    expect(res.status).toBe(409);
  });

  it('returns draft ids on success', async () => {
    const res = await POST(requestWith({ prospectId: 12 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect(json.draftId).toBe('draft-1');
    expect(json.catalogItemId).toBe(PRODUCT_ID);
    expect(createOutreachFollowUpDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ prospectId: 12, userId: 'user-1' }),
    );
  });
});
