import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOperationalTerritoryReviewForProspect } from '@/lib/operationalTerritories/reviewQueue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('resolveOperationalTerritoryReviewForProspect', () => {
  const updateMock = vi.fn();
  const eqMock = vi.fn();
  const isMock = vi.fn();
  const selectMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      update: updateMock.mockReturnThis(),
      eq: eqMock.mockReturnThis(),
      is: isMock.mockReturnThis(),
      select: selectMock.mockResolvedValue({ data: [{ id: 'q1' }], error: null }),
    };
    updateMock.mockReturnValue(chain);
    eqMock.mockReturnValue(chain);
    isMock.mockReturnValue(chain);
  });

  it('updates unresolved prospect rows and returns resolved count', async () => {
    const client = {
      from: vi.fn(() => ({
        update: updateMock,
      })),
    };

    const result = await resolveOperationalTerritoryReviewForProspect(42, client as never);
    expect(result).toEqual({ ok: true, resolved: 1 });
    expect(client.from).toHaveBeenCalledWith('operational_territory_review_queue');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ resolved_at: expect.any(String) }),
    );
    expect(eqMock).toHaveBeenCalledWith('entity_type', 'prospect');
    expect(eqMock).toHaveBeenCalledWith('entity_id', '42');
    expect(isMock).toHaveBeenCalledWith('resolved_at', null);
  });

  it('returns error when update fails', async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: 'rls' } });
    const client = {
      from: vi.fn(() => ({
        update: updateMock,
      })),
    };
    const result = await resolveOperationalTerritoryReviewForProspect(1, client as never);
    expect(result).toEqual({ ok: false, error: 'rls' });
  });
});

describe('activate operational territories migration', () => {
  it('sets status active for the seven ops codes without editing prior migrations', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260822181446_activate_operational_territories.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/status = 'active'/);
    expect(sql).toMatch(/pnw-west/);
    expect(sql).toMatch(/ie-san-diego/);
    expect(sql).not.toMatch(/zip_range/);
  });
});
