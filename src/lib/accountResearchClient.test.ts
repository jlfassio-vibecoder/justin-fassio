import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  processAccountResearchSource,
  runAccountResearchUntilDone,
} from '@/lib/accountResearchClient';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'token' } },
      }),
    },
    from: vi.fn(),
  },
}));

const fetchMock = vi.fn();

describe('accountResearchClient', () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('runAccountResearchUntilDone stops when process returns done', async () => {
    const snapshot = {
      run: { id: 'run-1', status: 'succeeded' },
      sources: [],
      citationsBySourceId: {},
      sourceFreshness: {},
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          processed: true,
          sourceId: 'src-1',
          done: true,
          ...snapshot,
        }),
      }),
    );

    const result = await runAccountResearchUntilDone('run-1', { delayMs: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.done).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('processAccountResearchSource returns error when not signed in', async () => {
    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    } as never);

    const result = await processAccountResearchSource('run-1');
    expect(result).toEqual({ ok: false, error: 'Not signed in' });
  });
});
