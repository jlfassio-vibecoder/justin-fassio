import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { listPendingProfiles, setProfileStatus } from '@/lib/ownerApprovals';

describe('ownerApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists pending profiles on success', async () => {
    const rows = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'rep@example.com',
        display_name: 'Rep',
        role: 'rep',
        status: 'pending',
        created_at: '2026-08-01T00:00:00Z',
      },
    ];
    rpcMock.mockResolvedValue({ data: rows, error: null });
    await expect(listPendingProfiles()).resolves.toEqual({ ok: true, data: rows });
    expect(rpcMock).toHaveBeenCalledWith('list_pending_profiles');
  });

  it('surfaces Forbidden from list RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Forbidden' } });
    await expect(listPendingProfiles()).resolves.toEqual({ ok: false, error: 'Forbidden' });
  });

  it('rejects empty targetId without RPC', async () => {
    await expect(setProfileStatus('  ', 'approved')).resolves.toEqual({
      ok: false,
      error: 'targetId is required',
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls set_profile_status on approve', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const id = '22222222-2222-2222-2222-222222222222';
    await expect(setProfileStatus(id, 'approved')).resolves.toEqual({ ok: true, data: null });
    expect(rpcMock).toHaveBeenCalledWith('set_profile_status', {
      target_id: id,
      new_status: 'approved',
    });
  });

  it('surfaces non-owner error from set_profile_status', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Forbidden' } });
    await expect(
      setProfileStatus('22222222-2222-2222-2222-222222222222', 'rejected'),
    ).resolves.toEqual({ ok: false, error: 'Forbidden' });
  });
});
