import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLatestProductOutreachSends } from '@/lib/outreachLatestSends';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}));

describe('loadLatestProductOutreachSends', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('limits to one row when querying a single prospect id', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          prospect_id: 12,
          to_email: 'a@example.com',
          sent_at: '2026-08-20T12:00:00Z',
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const inFn = vi.fn(() => ({ order }));
    const not = vi.fn(() => ({ in: inFn }));
    const eq = vi.fn(() => ({ not }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });

    const result = await loadLatestProductOutreachSends({ from: fromMock } as never, [12]);
    expect(result.ok).toBe(true);
    expect(limit).toHaveBeenCalledWith(1);
    if (result.ok) {
      expect(result.byProspectId.get(12)).toBe('2026-08-20T12:00:00Z');
    }
  });

  it('does not force limit(1) for multi-prospect lookups', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          prospect_id: 12,
          to_email: 'a@example.com',
          sent_at: '2026-08-20T12:00:00Z',
        },
        {
          prospect_id: 13,
          to_email: 'b@example.com',
          sent_at: '2026-08-19T12:00:00Z',
        },
      ],
      error: null,
    });
    const inFn = vi.fn(() => ({ order }));
    const not = vi.fn(() => ({ in: inFn }));
    const eq = vi.fn(() => ({ not }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });

    const result = await loadLatestProductOutreachSends({ from: fromMock } as never, [12, 13]);
    expect(result.ok).toBe(true);
    expect(order).toHaveBeenCalled();
    expect(order.mock.results[0]?.value).not.toHaveProperty('limit');
  });
});
