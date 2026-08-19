import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffAiFetch } from '@/lib/staffAiFetch';

describe('staffAiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws the JSON error field on non-OK JSON responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: 'AI Gateway is not authenticated locally.' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(staffAiFetch('/api/agent', { method: 'POST' })).rejects.toThrow(
      'AI Gateway is not authenticated locally.',
    );
  });
});
