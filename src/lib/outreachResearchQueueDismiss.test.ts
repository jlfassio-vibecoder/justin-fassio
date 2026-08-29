import { describe, expect, it, vi } from 'vitest';
import {
  dismissResearchQueueProspect,
  loadResearchQueueDismissals,
} from '@/lib/outreachResearchQueueDismiss';

describe('outreachResearchQueueDismiss', () => {
  it('loads dismissed prospect ids', async () => {
    const from = vi.fn(() => {
      const api: Record<string, unknown> = {};
      const result = { data: [{ prospect_id: 12 }, { prospect_id: 44 }], error: null };
      const self = () =>
        Object.assign(api, {
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(result).then(onFulfilled, onRejected);
          },
        });
      for (const key of ['select', 'in']) api[key] = vi.fn(self);
      return self();
    });

    const dismissed = await loadResearchQueueDismissals({ from } as never);
    expect([...dismissed].sort((a, b) => a - b)).toEqual([12, 44]);
  });

  it('upserts a dismissal', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    const result = await dismissResearchQueueProspect({ from } as never, 12, {
      dismissedBy: 'staff-1',
    });
    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        prospect_id: 12,
        dismissed_by: 'staff-1',
      }),
      { onConflict: 'prospect_id' },
    );
  });

  it('rejects invalid prospectId', async () => {
    const result = await dismissResearchQueueProspect({ from: vi.fn() } as never, 0);
    expect(result).toEqual({ ok: false, error: 'prospectId is required' });
  });
});
