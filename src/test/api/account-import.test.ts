import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedOwnerClientMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedOwnerClient: (...args: unknown[]) => requireApprovedOwnerClientMock(...args),
  requireApprovedStaffClient: vi.fn(),
}));

import { POST as parsePost } from '@/pages/api/staff/account-import/parse';
import { POST as previewPost } from '@/pages/api/staff/account-import/preview';
import { POST as commitPost } from '@/pages/api/staff/account-import/commit';
import { GET as batchesGet } from '@/pages/api/staff/account-import/batches/index';
import { GET as batchGet } from '@/pages/api/staff/account-import/batches/[id]';

describe('account import APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for reps on parse, preview, commit, and history GETs', async () => {
    requireApprovedOwnerClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 }),
    });

    const parseRes = await parsePost({
      request: new Request('http://localhost/api/staff/account-import/parse', { method: 'POST' }),
    } as never);
    const previewRes = await previewPost({
      request: new Request('http://localhost/api/staff/account-import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    } as never);
    const commitRes = await commitPost({
      request: new Request('http://localhost/api/staff/account-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    } as never);
    const listRes = await batchesGet({
      request: new Request('http://localhost/api/staff/account-import/batches?sales_line_id=x', {
        method: 'GET',
      }),
    } as never);
    const detailRes = await batchGet({
      request: new Request(
        'http://localhost/api/staff/account-import/batches/00000000-0000-4000-8000-000000000001?sales_line_id=x',
        { method: 'GET' },
      ),
      params: { id: '00000000-0000-4000-8000-000000000001' },
    } as never);

    expect(parseRes.status).toBe(403);
    expect(previewRes.status).toBe(403);
    expect(commitRes.status).toBe(403);
    expect(listRes.status).toBe(403);
    expect(detailRes.status).toBe(403);
  });
});
