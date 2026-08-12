import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requireCronSecret } from '@/lib/cronAuth';

describe('requireCronSecret', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  });

  it('returns 401 without Authorization header', () => {
    const result = requireCronSecret(new Request('http://localhost/api/cron/x'));
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns 401 with wrong Bearer token', () => {
    const result = requireCronSecret(
      new Request('http://localhost/api/cron/x', {
        headers: { Authorization: 'Bearer wrong' },
      }),
    );
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns ok with matching Bearer token', () => {
    const result = requireCronSecret(
      new Request('http://localhost/api/cron/x', {
        headers: { Authorization: 'Bearer test-cron-secret' },
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns 503 when CRON_SECRET is unset', () => {
    vi.stubEnv('CRON_SECRET', '');
    const result = requireCronSecret(
      new Request('http://localhost/api/cron/x', {
        headers: { Authorization: 'Bearer anything' },
      }),
    );
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: 'CRON_SECRET is not configured',
    });
  });
});
