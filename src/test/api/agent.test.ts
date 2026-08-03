import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamTextMock = vi.fn();
const requireApprovedStaffClientMock = vi.fn();
const checkAgentRateLimitMock = vi.fn();
const rateLimitResponseMock = vi.fn();
const createAgentCrmToolsMock = vi.fn();
const convertToModelMessagesMock = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
  stepCountIs: (n: number) => n,
  convertToModelMessages: (...args: unknown[]) => convertToModelMessagesMock(...args),
}));

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/agentRateLimit', () => ({
  checkAgentRateLimit: (...args: unknown[]) => checkAgentRateLimitMock(...args),
  rateLimitResponse: (...args: unknown[]) => rateLimitResponseMock(...args),
}));

vi.mock('@/lib/agentCrmTools', () => ({
  createAgentCrmTools: (...args: unknown[]) => createAgentCrmToolsMock(...args),
}));

vi.mock('@/lib/objectionCatalog', () => ({
  objectionCatalogBlurb: () => '"price"',
}));

import { POST } from '@/pages/api/agent';

describe('POST /api/agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convertToModelMessagesMock.mockReturnValue([]);
    createAgentCrmToolsMock.mockReturnValue({});
  });

  it('returns auth failure without calling streamText', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Missing bearer token' }), {
        status: 401,
      }),
    });

    const res = await POST({
      request: new Request('http://localhost/api/agent', { method: 'POST' }),
    } as Parameters<typeof POST>[0]);

    expect(res.status).toBe(401);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(checkAgentRateLimitMock).not.toHaveBeenCalled();
  });

  it('returns 429 without calling streamText when rate limited', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      supabase: {},
    });
    checkAgentRateLimitMock.mockReturnValue({ ok: false, retryAfterSec: 90 });
    rateLimitResponseMock.mockReturnValue(
      new Response(JSON.stringify({ ok: false, error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Retry-After': '90' },
      }),
    );

    const res = await POST({
      request: new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      }),
    } as Parameters<typeof POST>[0]);

    expect(checkAgentRateLimitMock).toHaveBeenCalledWith('user-1');
    expect(res.status).toBe(429);
    expect(streamTextMock).not.toHaveBeenCalled();
  });
});
