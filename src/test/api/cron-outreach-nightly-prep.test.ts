import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function restoreEnv(name: string, prev: string | undefined): void {
  if (prev !== undefined) process.env[name] = prev;
  else delete process.env[name];
}

describe('/api/cron/outreach-nightly-prep', () => {
  const prevFlag = process.env.FEATURE_OUTREACH_NIGHTLY_PREP;

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

  afterEach(() => {
    restoreEnv('FEATURE_OUTREACH_NIGHTLY_PREP', prevFlag);
  });

  it('GET returns 401 without secret', async () => {
    requireCronSecretMock.mockReturnValue({ ok: false, status: 401, error: 'Unauthorized' });
    const res = await GET({
      request: new Request('http://localhost/api/cron/outreach-nightly-prep'),
    } as never);
    expect(res.status).toBe(401);
    expect(runOutreachNightlyPrepMock).not.toHaveBeenCalled();
  });

  it('no-ops when FEATURE_OUTREACH_NIGHTLY_PREP is off (default)', async () => {
    delete process.env.FEATURE_OUTREACH_NIGHTLY_PREP;
    const res = await POST({
      request: new Request('http://localhost/api/cron/outreach-nightly-prep', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
      }),
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; disabled?: boolean };
    expect(body.ok).toBe(true);
    expect(body.disabled).toBe(true);
    expect(runOutreachNightlyPrepMock).not.toHaveBeenCalled();
    expect(getServiceRoleClientMock).not.toHaveBeenCalled();
  });

  it('POST runs prep when authorized and flag is on', async () => {
    process.env.FEATURE_OUTREACH_NIGHTLY_PREP = '1';
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
