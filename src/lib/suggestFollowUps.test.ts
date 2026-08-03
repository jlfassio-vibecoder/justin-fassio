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

import { suggestFollowUps } from '@/lib/suggestFollowUps';

function httpError(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return new FunctionsHttpError(response);
}

describe('suggestFollowUps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-positive prospectId without invoke', async () => {
    await expect(suggestFollowUps(0)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'prospectId must be a positive integer',
    });
    await expect(suggestFollowUps(-1)).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(suggestFollowUps(1.5)).resolves.toMatchObject({ ok: false, status: 400 });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('maps 401 FunctionsHttpError', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(401, { ok: false, error: 'Unauthorized' }),
    });
    const result = await suggestFollowUps(12);
    expect(invokeMock).toHaveBeenCalledWith('suggest-follow-ups', {
      body: { prospect_id: 12 },
    });
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('maps 403 FunctionsHttpError', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(403, { ok: false, error: 'Forbidden' }),
    });
    const result = await suggestFollowUps(3, 8);
    expect(invokeMock).toHaveBeenCalledWith('suggest-follow-ups', {
      body: { prospect_id: 3, limit: 8 },
    });
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('maps successful payload', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        summary: 'Warm lead, sample sent.',
        followUps: ['Call buyer Tuesday', 'Offer rack deal'],
      },
      error: null,
    });
    await expect(suggestFollowUps(7)).resolves.toEqual({
      ok: true,
      status: 200,
      summary: 'Warm lead, sample sent.',
      followUps: ['Call buyer Tuesday', 'Offer rack deal'],
    });
  });
});
