import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOperationalTerritoryReviewForProspect } from '@/lib/operationalTerritories/reviewQueue';

describe('resolveOperationalTerritoryReviewForProspect', () => {
  const selectMock = vi.fn();
  const updateMock = vi.fn();
  const eqMock = vi.fn();
  const isMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const selectChain = {
      eq: eqMock.mockReturnThis(),
      is: isMock.mockReturnThis(),
      select: selectMock,
    };
    selectMock.mockResolvedValue({ data: [{ id: 'q1', payload: {} }], error: null });
    const updateChain = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    updateMock.mockReturnValue(updateChain);
    eqMock.mockReturnValue(selectChain);
    isMock.mockReturnValue(selectChain);
  });

  it('resolves with assigned metadata', async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [{ id: 'q1', payload: {} }], error: null }),
    };
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => selectChain),
        update: vi.fn(() => ({ eq: updateEqMock })),
      })),
    };

    const result = await resolveOperationalTerritoryReviewForProspect(
      42,
      { resolution: 'assigned', resolvedBy: 'actor-1' },
      client as never,
    );
    expect(result).toEqual({ ok: true, resolved: 1 });
  });
});

describe('ops review queue migration', () => {
  it('includes resolution columns, RPC, backlog, and prospect unique index', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260822190000_operational_territory_review_queue_resolution.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/legacy_resolved/);
    expect(sql).toMatch(/upsert_operational_territory_review/);
    expect(sql).toMatch(/unique_violation/);
    expect(sql).toMatch(/grant execute on function public\.upsert_operational_territory_review/);
    expect(sql).toMatch(/operational_territory_review_queue_unresolved_prospect_uidx/);
    expect(sql).toMatch(/insert into operational_territory_review_queue/);
    expect(sql).toMatch(/on delete set null/i);
  });
});
