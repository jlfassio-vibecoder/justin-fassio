import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApprovedStaffClientMock = vi.fn();
const createOutreachIdentifiedTargetDraftMock = vi.fn();
const getOutreachGoalSettingsMock = vi.fn();

vi.mock('@/lib/agentAuth', () => ({
  requireApprovedStaffClient: (...args: unknown[]) => requireApprovedStaffClientMock(...args),
}));

vi.mock('@/lib/createOutreachIdentifiedTargetDraft', () => ({
  createOutreachIdentifiedTargetDraft: (...args: unknown[]) =>
    createOutreachIdentifiedTargetDraftMock(...args),
}));

vi.mock('@/lib/operationalTerritories/fetchOperationalTerritories', () => ({
  fetchOperationalTerritories: vi.fn(async () => ({
    data: [{ id: 'ops-pnw-west', code: 'pnw-west', name: 'PNW West' }],
    error: null,
  })),
}));

vi.mock('@/lib/operationalTerritories/resolve', async () => {
  const actual = await vi.importActual<typeof import('@/lib/operationalTerritories/resolve')>(
    '@/lib/operationalTerritories/resolve',
  );
  return actual;
});

vi.mock('@/lib/outreachGoals', () => ({
  getOutreachGoalSettings: (...args: unknown[]) => getOutreachGoalSettingsMock(...args),
}));

vi.mock('@/lib/outreachNightlyPrep', () => ({
  briefingSellingDate: () => '2026-08-12',
}));

vi.mock('@/lib/outreachSelectTargets', () => ({
  formatOutreachPreparationDate: () => '2026-08-12',
}));

vi.mock('@/lib/outreachSellingDays', () => ({
  isWeekdayIso: () => true,
}));

import { POST } from '@/pages/api/staff/outreach/identified-target-draft';

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('POST /api/staff/outreach/identified-target-draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: true,
      supabase: {},
      userId: 'staff-1',
    });
    getOutreachGoalSettingsMock.mockResolvedValue({
      ok: true,
      settings: { businessTimezone: 'America/Los_Angeles' },
    });
    createOutreachIdentifiedTargetDraftMock.mockResolvedValue({
      ok: true,
      draftId: 'd1',
      catalogItemId: PRODUCT_A,
      productName: 'Frozen A',
      reusedPending: false,
    });
  });

  it('rejects unauthenticated staff', async () => {
    requireApprovedStaffClientMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });
    const res = await POST({
      request: new Request('http://localhost/api/staff/outreach/identified-target-draft', {
        method: 'POST',
        body: '{}',
      }),
    } as never);
    expect(res.status).toBe(401);
    expect(createOutreachIdentifiedTargetDraftMock).not.toHaveBeenCalled();
  });

  it('validates required body fields', async () => {
    const res = await POST({
      request: new Request('http://localhost/api/staff/outreach/identified-target-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: 12 }),
      }),
    } as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/catalogItemId/i);
    expect(createOutreachIdentifiedTargetDraftMock).not.toHaveBeenCalled();
  });

  it('passes scope + frozen ids to createOutreachIdentifiedTargetDraft', async () => {
    const res = await POST({
      request: new Request('http://localhost/api/staff/outreach/identified-target-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: 12,
          catalogItemId: PRODUCT_A,
          operationalTerritoryId: 'ops-pnw-west',
          storeTerritoryCode: 'or',
          crmRegion: 'Oregon Coast',
          city: 'Newport',
        }),
      }),
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; draftId?: string };
    expect(body.ok).toBe(true);
    expect(body.draftId).toBe('d1');
    expect(createOutreachIdentifiedTargetDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prospectId: 12,
        catalogItemId: PRODUCT_A,
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        crmRegion: 'Oregon Coast',
        city: 'newport',
        preparationDate: '2026-08-12',
        userId: 'staff-1',
      }),
    );
  });
});
