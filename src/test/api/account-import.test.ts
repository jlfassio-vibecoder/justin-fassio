import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedOwnerClientMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedOwnerClient: (...args: unknown[]) => requireApprovedOwnerClientMock(...args),
  requireApprovedStaffClient: vi.fn(),
}));

import { POST as parsePost } from '@/pages/api/staff/account-import/parse';
import { POST as previewPost } from '@/pages/api/staff/account-import/preview';
import { POST as commitPost } from '@/pages/api/staff/account-import/commit';

describe('account import APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for reps on parse, preview, and commit', async () => {
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

    expect(parseRes.status).toBe(403);
    expect(previewRes.status).toBe(403);
    expect(commitRes.status).toBe(403);
  });
});
