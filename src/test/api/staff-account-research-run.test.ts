import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const startOrReuseMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/accountResearch/orchestrate', () => ({
  startOrReuseAccountResearch: (...args: unknown[]) => startOrReuseMock(...args),
}));

import { POST } from '@/pages/api/staff/account-research/run';

describe('POST /api/staff/account-research/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires approved staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/account-research/run', {
        method: 'POST',
        body: JSON.stringify({ retailerId: 1, scope: 'website' }),
      }),
    } as never);
    expect(res.status).toBe(403);
    expect(startOrReuseMock).not.toHaveBeenCalled();
  });

  it('rejects invalid scope', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/account-research/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: 1, scope: 'linkedin' }),
      }),
    } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(startOrReuseMock).not.toHaveBeenCalled();
  });

  it('rejects non-boolean forceRefresh', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/account-research/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: 1, scope: 'website', forceRefresh: 'false' }),
      }),
    } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(startOrReuseMock).not.toHaveBeenCalled();
  });

  it('starts a run for valid scope', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'user-1',
    });
    startOrReuseMock.mockResolvedValue({
      ok: true,
      outcome: 'started',
      snapshot: {
        run: { id: 'run-1', requested_scope: 'website', status: 'running' },
        sources: [{ id: 'src-1', source_type: 'website', status: 'pending' }],
        citationsBySourceId: {},
        sourceFreshness: {},
      },
    });

    const res = await POST({
      request: new Request('http://localhost/api/staff/account-research/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: 42, scope: 'all', forceRefresh: false }),
      }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe('started');
    expect(startOrReuseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        retailerId: 42,
        scope: 'all',
        forceRefresh: false,
        userId: 'user-1',
      }),
    );
  });
});
