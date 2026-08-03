import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

const invokeMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

import { pingAuthorizedServer } from '@/lib/serverPing';

function httpError(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return new FunctionsHttpError(response);
}

describe('pingAuthorizedServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok on successful invoke', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(pingAuthorizedServer()).resolves.toEqual({ ok: true, status: 200 });
  });

  it('maps 401 FunctionsHttpError', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(401, { ok: false, error: 'Unauthorized' }),
    });
    const result = await pingAuthorizedServer();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe('Unauthorized');
  });

  it('maps 403 FunctionsHttpError', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(403, { ok: false, error: 'Forbidden' }),
    });
    const result = await pingAuthorizedServer();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('Forbidden');
  });
});
