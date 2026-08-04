import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

import { fetchLandedRates } from '@/lib/landedRatesClient';

describe('fetchLandedRates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns not signed in when there is no session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const result = await fetchLandedRates();
    expect(result).toEqual({ ok: false, error: 'Not signed in' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces 501 stub error message', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: 'Landed rates research is not available yet' }),
        { status: 501, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await fetchLandedRates();
    expect(result).toEqual({
      ok: false,
      error: 'Landed rates research is not available yet',
    });
  });

  it('returns rates on success', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          rates: {
            fx: 1.38,
            freightRate: 0.1,
            gstRate: 0.05,
            brief: 'USD/CAD from Bank of Canada.',
            asOf: '2026-08-03T12:00:00.000Z',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await fetchLandedRates();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rates.fx).toBe(1.38);
    expect(result.rates.brief).toContain('Bank of Canada');
  });
});
