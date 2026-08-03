import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { requireApprovedStaffClient } from '@/lib/agentAuth';

function jsonBody(res: Response): Promise<{ ok: boolean; error?: string }> {
  return res.json() as Promise<{ ok: boolean; error?: string }>;
}

describe('requireApprovedStaffClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    createClientMock.mockReturnValue({
      auth: { getUser: getUserMock },
      rpc: rpcMock,
    });
  });

  it('returns 401 when bearer token is missing', async () => {
    const result = await requireApprovedStaffClient(new Request('http://localhost/api/agent'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    await expect(jsonBody(result.response)).resolves.toMatchObject({
      ok: false,
      error: 'Missing bearer token',
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns 401 when getUser fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const result = await requireApprovedStaffClient(
      new Request('http://localhost/api/agent', {
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    await expect(jsonBody(result.response)).resolves.toMatchObject({ error: 'Unauthorized' });
  });

  it('returns 403 when staff is not approved', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    rpcMock.mockResolvedValue({ data: false, error: null });
    const result = await requireApprovedStaffClient(
      new Request('http://localhost/api/agent', {
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(jsonBody(result.response)).resolves.toMatchObject({ error: 'Forbidden' });
  });

  it('returns supabase client and userId when approved', async () => {
    const supabase = { auth: { getUser: getUserMock }, rpc: rpcMock };
    createClientMock.mockReturnValue(supabase);
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-42' } }, error: null });
    rpcMock.mockResolvedValue({ data: true, error: null });

    const result = await requireApprovedStaffClient(
      new Request('http://localhost/api/agent', {
        headers: { Authorization: 'Bearer tok' },
      }),
    );

    expect(result).toEqual({ ok: true, supabase, userId: 'user-42' });
    expect(rpcMock).toHaveBeenCalledWith('is_approved_staff');
  });
});
