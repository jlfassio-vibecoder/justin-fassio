import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyOperationalTerritorySuggestion,
  leaveOperationalTerritoryUnassigned,
} from '@/lib/operationalTerritories/reviewApi';

const updateProspectAccountDetailsMock = vi.fn();
const resolveMock = vi.fn();
const fetchOpsMock = vi.fn();

vi.mock('@/lib/updateProspectAccountDetails', () => ({
  draftFromProspect: (p: { name?: string; operationalTerritoryId: string | null }) => ({
    name: p.name ?? 'Test',
    operationalTerritoryId: p.operationalTerritoryId,
  }),
  updateProspectAccountDetails: (...args: unknown[]) => updateProspectAccountDetailsMock(...args),
}));

vi.mock('@/lib/operationalTerritories/fetchOperationalTerritories', () => ({
  fetchOperationalTerritories: (...args: unknown[]) => fetchOpsMock(...args),
}));

vi.mock('@/lib/operationalTerritories/reviewQueue', () => ({
  resolveOperationalTerritoryReviewForProspect: (...args: unknown[]) => resolveMock(...args),
}));

function prospectRow() {
  return {
    id: 9,
    name: 'Seattle Shop',
    category: 'outdoor_retail',
    region: 'WA',
    city: 'Seattle',
    address: '1 Pike',
    phone: null,
    fit: null,
    account_status: 'prospect',
    converted_at: null,
    initial_order_date: null,
    notes: null,
    territory_id: 'terr-wa',
    territories: { code: 'wa', name: 'Washington' },
    operational_territory_id: null,
    operational_territories: null,
    external_id: null,
    subterritory: null,
    primary_district: null,
    retail_category: null,
    website: null,
    fit_score: null,
    ideal_opening_units: null,
    priority: null,
    provisional_grade: null,
    verification_status: null,
    buyer_verified: false,
    import_protected: false,
    apparel_capability: null,
    existing_ogr: null,
    qualification_status: null,
    next_action: null,
    source_note: null,
    postal_code: '98101',
    secondary_channels: null,
    retail_subchannels: null,
    venue_contexts: null,
    lifestyle_themes: null,
    retail_capabilities: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

describe('operational territory review API helpers', () => {
  const supabase = {
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchOpsMock.mockResolvedValue({
      data: [{ id: 'ops-pnw-west', code: 'pnw-west', name: 'PNW West' }],
      error: null,
    });
    resolveMock.mockResolvedValue({ ok: true, resolved: 1 });
    updateProspectAccountDetailsMock.mockResolvedValue({
      ok: true,
      data: { id: 9 },
      auditWarning: null,
      reviewWarning: null,
    });
    supabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: prospectRow(), error: null }),
        }),
      }),
    });
  });

  it('apply suggestion delegates to updateProspectAccountDetails only', async () => {
    const result = await applyOperationalTerritorySuggestion(supabase as never, 9, 'actor-1');
    expect(result.ok).toBe(true);
    expect(updateProspectAccountDetailsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operationalTerritoryId: 'ops-pnw-west' }),
      expect.objectContaining({ actorId: 'actor-1', client: supabase }),
    );
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('apply suggestion returns 409 when suggestion is unavailable', async () => {
    supabase.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              ...prospectRow(),
              postal_code: '92530',
              territories: { code: 'ca', name: 'California' },
            },
            error: null,
          }),
        }),
      }),
    });

    const result = await applyOperationalTerritorySuggestion(supabase as never, 9, 'actor-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/Suggestion unavailable/);
    }
    expect(updateProspectAccountDetailsMock).not.toHaveBeenCalled();
  });

  it('leave unassigned resolves queue with fingerprint', async () => {
    const result = await leaveOperationalTerritoryUnassigned(supabase as never, 9, 'actor-1');
    expect(result.ok).toBe(true);
    expect(resolveMock).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        resolution: 'left_unassigned',
        resolvedBy: 'actor-1',
        payloadPatch: expect.objectContaining({ location_fingerprint: expect.any(Object) }),
      }),
      supabase,
    );
    expect(updateProspectAccountDetailsMock).not.toHaveBeenCalled();
  });
});
