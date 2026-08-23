import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const createMatchMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/accountProductMatch', () => ({
  createAccountProductMatch: (...args: unknown[]) => createMatchMock(...args),
}));

import { POST } from '@/pages/api/staff/account-product-match/run';

const LINE_ID = '00000000-0000-4000-8000-000000000301';
const RUN_ID = '00000000-0000-4000-8000-000000000101';

describe('staff account product match API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires approved staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/account-product-match/run', {
        method: 'POST',
      }),
    } as never);
    expect(res.status).toBe(403);
    expect(createMatchMock).not.toHaveBeenCalled();
  });

  it('validates request body', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({ ok: true, supabase: {} });
    const res = await POST({
      request: new Request('http://localhost/api/staff/account-product-match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: 1 }),
      }),
    } as never);
    expect(res.status).toBe(400);
  });

  it('returns matched items', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({ ok: true, supabase: {} });
    createMatchMock.mockResolvedValue({
      ok: true,
      outcome: 'matched',
      run: { id: 'match-1', status: 'succeeded' },
      items: [{ id: 'item-1', citation_ids: ['citation-1'] }],
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/account-product-match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: 42,
          salesLineId: LINE_ID,
          researchRunId: RUN_ID,
        }),
      }),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('matched');
    expect(body.items).toHaveLength(1);
  });

  it('returns 409 for identity unresolved empty outcome', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({ ok: true, supabase: {} });
    createMatchMock.mockResolvedValue({
      ok: true,
      outcome: 'empty',
      empty_reason: 'identity_unresolved',
      run: { id: 'match-2', status: 'empty' },
      items: [],
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/account-product-match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: 42,
          salesLineId: LINE_ID,
          researchRunId: RUN_ID,
        }),
      }),
    } as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.empty_reason).toBe('identity_unresolved');
  });
});
