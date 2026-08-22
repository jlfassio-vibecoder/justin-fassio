import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeProspectIdentity, type Prospect } from '@/lib/prospects';
import {
  buildAccountDetailsPatch,
  draftFromProspect,
  shouldConfirmProtectedIdentityEdit,
  updateProspectAccountDetails,
  validateAccountDetailsDraft,
} from '@/lib/updateProspectAccountDetails';

const insertRetailerFieldChangesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/retailerFieldChanges', async () => {
  const actual = await vi.importActual<typeof import('@/lib/retailerFieldChanges')>(
    '@/lib/retailerFieldChanges',
  );
  return {
    ...actual,
    insertRetailerFieldChanges: (...args: unknown[]) => insertRetailerFieldChangesMock(...args),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';

function baseProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 42,
    name: 'Kelowna Pro Shop',
    category: 'golf_retail',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '100 Main St',
    phone: '250-555-0100',
    fit: 'Strong local fit',
    accountStatus: 'active_account',
    convertedAt: '2026-01-15T00:00:00.000Z',
    initialOrderDate: '2026-01-20',
    notes: 'Keep notes',
    territoryId: 'terr-bc',
    territoryCode: 'bc',
    territoryName: 'British Columbia',
    operationalTerritoryId: null,
    secondaryChannels: [],
    retailSubchannels: [],
    venueContexts: [],
    lifestyleThemes: [],
    retailCapabilities: [],
    externalId: null,
    subterritory: null,
    primaryDistrict: null,
    retailCategory: null,
    website: 'https://example.com',
    fitScore: null,
    idealOpeningUnits: null,
    priority: null,
    provisionalGrade: null,
    verificationStatus: null,
    buyerVerified: false,
    importProtected: false,
    apparelCapability: null,
    existingOgr: null,
    qualificationStatus: null,
    nextAction: null,
    sourceNote: null,
    postalCode: 'V1Y 1A1',
    lineRelationshipStatus: 'opened',
    lineAccountMarkers: ['outreach_eligible'],
    ...overrides,
  };
}

function prospectRowFromExisting(existing: Prospect, patch: Record<string, unknown> = {}) {
  return {
    id: existing.id,
    name: (patch.name as string | undefined) ?? existing.name,
    category: existing.category,
    region: (patch.region as string | undefined) ?? existing.region,
    city: (patch.city as string | undefined) ?? existing.city,
    address: (patch.address as string | undefined) ?? existing.address,
    phone: (patch.phone as string | undefined) ?? existing.phone,
    fit: (patch.fit as string | undefined) ?? existing.fit,
    account_status: 'prospect',
    converted_at: null,
    initial_order_date: null,
    notes: existing.notes,
    territory_id: (patch.territory_id as string | undefined) ?? existing.territoryId,
    operational_territory_id: existing.operationalTerritoryId,
    territories: patch.territories
      ? (patch.territories as { code: string; name: string })
      : { code: existing.territoryCode, name: existing.territoryName },
    external_id: existing.externalId,
    subterritory: existing.subterritory,
    primary_district: existing.primaryDistrict,
    retail_category: existing.retailCategory,
    website: (patch.website as string | null | undefined) ?? existing.website,
    fit_score: existing.fitScore,
    ideal_opening_units: existing.idealOpeningUnits,
    priority: existing.priority,
    provisional_grade: existing.provisionalGrade,
    verification_status: existing.verificationStatus,
    buyer_verified: existing.buyerVerified,
    import_protected: existing.importProtected,
    apparel_capability: existing.apparelCapability,
    existing_ogr: existing.existingOgr,
    qualification_status: existing.qualificationStatus,
    next_action: existing.nextAction,
    source_note: existing.sourceNote,
    postal_code: (patch.postal_code as string | null | undefined) ?? existing.postalCode,
    secondary_channels: existing.secondaryChannels,
    retail_subchannels: existing.retailSubchannels,
    venue_contexts: existing.venueContexts,
    lifestyle_themes: existing.lifestyleThemes,
    retail_capabilities: existing.retailCapabilities,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-08-21T12:00:00Z',
  };
}

describe('mergeProspectIdentity', () => {
  it('preserves RLA commercial fields from existing', () => {
    const existing = baseProspect();
    const saved = baseProspect({
      accountStatus: 'prospect',
      convertedAt: null,
      initialOrderDate: null,
      lineRelationshipStatus: undefined,
      lineAccountMarkers: undefined,
      name: 'Renamed Shop',
    });
    const merged = mergeProspectIdentity(existing, saved);
    expect(merged.name).toBe('Renamed Shop');
    expect(merged.accountStatus).toBe('active_account');
    expect(merged.convertedAt).toBe(existing.convertedAt);
    expect(merged.initialOrderDate).toBe(existing.initialOrderDate);
    expect(merged.lineRelationshipStatus).toBe('opened');
    expect(merged.lineAccountMarkers).toEqual(['outreach_eligible']);
  });
});

describe('validateAccountDetailsDraft', () => {
  it('requires name, city, and region', () => {
    const draft = draftFromProspect(baseProspect());
    expect(validateAccountDetailsDraft({ ...draft, name: '  ' })).toMatch(/name/i);
    expect(validateAccountDetailsDraft({ ...draft, city: '' })).toMatch(/city/i);
    expect(validateAccountDetailsDraft({ ...draft, region: '' })).toMatch(/region/i);
  });

  it('rejects short phones and bad URLs', () => {
    const draft = draftFromProspect(baseProspect());
    expect(validateAccountDetailsDraft({ ...draft, phone: '123' })).toMatch(/phone/i);
    expect(validateAccountDetailsDraft({ ...draft, website: 'not a url' })).toMatch(/url/i);
  });

  it('allows unknown-country postal codes permissively', () => {
    const draft = draftFromProspect(baseProspect());
    expect(
      validateAccountDetailsDraft({ ...draft, postalCode: 'ABC-99' }, { countryCode: null }),
    ).toBeNull();
  });

  it('applies US ZIP rules when country is known', () => {
    const draft = draftFromProspect(baseProspect());
    expect(
      validateAccountDetailsDraft({ ...draft, postalCode: 'ABC' }, { countryCode: 'US' }),
    ).toMatch(/ZIP/i);
  });
});

describe('buildAccountDetailsPatch', () => {
  it('includes only changed fields and omits territory_id when unchanged', () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), fit: 'Updated fit', phone: '' };
    const { patch, changes } = buildAccountDetailsPatch(existing, draft);
    expect(patch).toEqual({ fit: 'Updated fit', phone: '' });
    expect(changes.map((c) => c.fieldPath).sort()).toEqual(['fit', 'phone']);
    expect(patch).not.toHaveProperty('territory_id');
    expect(patch).not.toHaveProperty('sales_line_territory_id');
  });

  it('patches territory_id alone without rewriting city or region', () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), territoryId: 'terr-or' };
    const { patch, changes } = buildAccountDetailsPatch(existing, draft);
    expect(patch).toEqual({ territory_id: 'terr-or' });
    expect(changes).toEqual([
      {
        fieldPath: 'territory_id',
        oldValue: 'terr-bc',
        newValue: 'terr-or',
      },
    ]);
    expect(patch).not.toHaveProperty('city');
    expect(patch).not.toHaveProperty('region');
    expect(patch).not.toHaveProperty('sales_line_territory_id');
  });

  it('normalizes blank website and postal to null', () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), website: '  ', postalCode: '  ' };
    const { patch } = buildAccountDetailsPatch(existing, draft);
    expect(patch.website).toBeNull();
    expect(patch.postal_code).toBeNull();
  });
});

describe('shouldConfirmProtectedIdentityEdit', () => {
  it('skips confirm for fit-only changes even when protected', () => {
    const existing = baseProspect({ importProtected: true });
    const draft = { ...draftFromProspect(existing), fit: 'Only fit changed' };
    expect(shouldConfirmProtectedIdentityEdit(existing, draft)).toBe(false);
  });

  it('requires confirm when a verified identity field changes', () => {
    const existing = baseProspect({ verificationStatus: 'verified' });
    const draft = { ...draftFromProspect(existing), name: 'New Name' };
    expect(shouldConfirmProtectedIdentityEdit(existing, draft)).toBe(true);
  });

  it('skips confirm when account is not protected', () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), name: 'New Name' };
    expect(shouldConfirmProtectedIdentityEdit(existing, draft)).toBe(false);
  });
});

describe('updateProspectAccountDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertRetailerFieldChangesMock.mockResolvedValue({ ok: true });
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-actor-1' } },
      error: null,
    } as never);
  });

  it('merges RLA fields after save and stamps actor_id on audit', async () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), name: 'Updated Name' };
    let capturedUpdate: Record<string, unknown> | null = null;

    vi.mocked(supabase.from).mockImplementation(() => {
      const chain = {
        update: (payload: Record<string, unknown>) => {
          capturedUpdate = payload;
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        single: async () => ({
          data: prospectRowFromExisting(existing, { name: 'Updated Name' }),
          error: null,
        }),
      };
      return chain as never;
    });

    const result = await updateProspectAccountDetails(existing, draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Updated Name');
    expect(result.data.accountStatus).toBe('active_account');
    expect(result.data.lineRelationshipStatus).toBe('opened');
    expect(result.auditWarning).toBeNull();
    expect(capturedUpdate).toEqual({ name: 'Updated Name' });
    expect(capturedUpdate).not.toHaveProperty('territory_id');
    expect(insertRetailerFieldChangesMock).toHaveBeenCalledWith(
      supabase,
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: 'name',
          source: 'user',
          actorId: 'user-actor-1',
          status: 'applied',
        }),
      ]),
    );
  });

  it('merges RLA fields and adopts territory from saved row on territory-only save', async () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), territoryId: 'terr-or' };
    let capturedUpdate: Record<string, unknown> | null = null;

    vi.mocked(supabase.from).mockImplementation(() => {
      const chain = {
        update: (payload: Record<string, unknown>) => {
          capturedUpdate = payload;
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        single: async () => ({
          data: prospectRowFromExisting(existing, {
            territory_id: 'terr-or',
            territories: { code: 'or', name: 'Oregon' },
          }),
          error: null,
        }),
      };
      return chain as never;
    });

    const result = await updateProspectAccountDetails(existing, draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(capturedUpdate).toEqual({ territory_id: 'terr-or' });
    expect(capturedUpdate).not.toHaveProperty('sales_line_territory_id');
    expect(result.data.city).toBe(existing.city);
    expect(result.data.region).toBe(existing.region);
    expect(result.data.territoryId).toBe('terr-or');
    expect(result.data.territoryCode).toBe('or');
    expect(result.data.territoryName).toBe('Oregon');
    expect(result.data.accountStatus).toBe('active_account');
    expect(result.data.lineRelationshipStatus).toBe('opened');
  });

  it('returns ok with auditWarning when audit insert fails after update', async () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), city: 'Vernon' };
    insertRetailerFieldChangesMock.mockResolvedValue({ ok: false, error: 'audit down' });

    vi.mocked(supabase.from).mockImplementation(() => {
      const chain = {
        update: () => chain,
        eq: () => chain,
        select: () => chain,
        single: async () => ({
          data: prospectRowFromExisting(existing, { city: 'Vernon' }),
          error: null,
        }),
      };
      return chain as never;
    });

    const result = await updateProspectAccountDetails(existing, draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.city).toBe('Vernon');
    expect(result.auditWarning).toMatch(/change log could not be written/i);
  });

  it('returns Save failed when prospects update errors', async () => {
    const existing = baseProspect();
    const draft = { ...draftFromProspect(existing), name: 'Nope' };

    vi.mocked(supabase.from).mockImplementation(() => {
      const chain = {
        update: () => chain,
        eq: () => chain,
        select: () => chain,
        single: async () => ({ data: null, error: { message: 'db error' } }),
      };
      return chain as never;
    });

    const result = await updateProspectAccountDetails(existing, draft);
    expect(result).toEqual({ ok: false, error: 'db error' });
    expect(insertRetailerFieldChangesMock).not.toHaveBeenCalled();
  });
});
