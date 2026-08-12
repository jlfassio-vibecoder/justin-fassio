import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCronSecretMock = vi.fn();
const getServiceRoleClientMock = vi.fn();
const runOutreachNightlyPrepMock = vi.fn();

vi.mock('@/lib/cronAuth', () => ({
  requireCronSecret: (...args: unknown[]) => requireCronSecretMock(...args),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
  getServiceRoleClient: (...args: unknown[]) => getServiceRoleClientMock(...args),
}));

vi.mock('@/lib/outreachNightlyPrep', () => ({
  runOutreachNightlyPrep: (...args: unknown[]) => runOutreachNightlyPrepMock(...args),
}));

import { GET, POST } from '@/pages/api/cron/outreach-nightly-prep';

describe('/api/cron/outreach-nightly-prep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCronSecretMock.mockReturnValue({ ok: true });
    getServiceRoleClientMock.mockReturnValue({ from: vi.fn() });
    runOutreachNightlyPrepMock.mockResolvedValue({
      ok: true,
      noop: false,
      run: { id: 'run-1', status: 'succeeded', producedCount: 2 },
    });
  });

  it('GET returns 401 without secret', async () => {
    requireCronSecretMock.mockReturnValue({ ok: false, status: 401, error: 'Unauthorized' });
    const res = await GET({
      request: new Request('http://localhost/api/cron/outreach-nightly-prep'),
    } as never);
    expect(res.status).toBe(401);
    expect(runOutreachNightlyPrepMock).not.toHaveBeenCalled();
  });

  it('POST runs prep when authorized', async () => {
    const res = await POST({
      request: new Request('http://localhost/api/cron/outreach-nightly-prep', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
      }),
    } as never);
    expect(res.status).toBe(200);
    expect(runOutreachNightlyPrepMock).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'cron' }),
    );
  });
});
