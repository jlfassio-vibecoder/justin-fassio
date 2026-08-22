import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncOperationalTerritoryReview } from '@/lib/operationalTerritories/syncOperationalTerritoryReview';
import { prospectFixture } from '@/lib/prospectFixture';
import type { Prospect } from '@/lib/prospects';

const findLastLeftUnassignedResolutionMock = vi.fn();
const resolveMock = vi.fn();
const upsertMock = vi.fn();

vi.mock('@/lib/operationalTerritories/reviewQueue', () => ({
  findLastLeftUnassignedResolution: (...args: unknown[]) =>
    findLastLeftUnassignedResolutionMock(...args),
  resolveOperationalTerritoryReviewForProspect: (...args: unknown[]) => resolveMock(...args),
  upsertOperationalTerritoryReviewForProspect: (...args: unknown[]) => upsertMock(...args),
}));

function baseProspect(overrides: Partial<Prospect> = {}): Prospect {
  return prospectFixture({
    id: 1,
    name: 'Test Shop',
    region: 'WA',
    city: 'Seattle',
    address: '1 Pike St',
    territoryId: 'terr-wa',
    territoryCode: 'wa',
    territoryName: 'Washington',
    operationalTerritoryId: null,
    operationalTerritoryCode: null,
    operationalTerritoryName: null,
    postalCode: '98101',
    ...overrides,
  });
}

describe('syncOperationalTerritoryReview', () => {
  const client = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    findLastLeftUnassignedResolutionMock.mockResolvedValue(null);
    resolveMock.mockResolvedValue({ ok: true, resolved: 1 });
    upsertMock.mockResolvedValue({ ok: true, id: 'q1' });
  });

  it('enqueues unassigned WA prospect', async () => {
    const result = await syncOperationalTerritoryReview({
      prospect: baseProspect(),
      locationChanged: true,
      client,
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalled();
  });

  it('skips BC/AB and resolves no_longer_applicable', async () => {
    const result = await syncOperationalTerritoryReview({
      prospect: baseProspect({ territoryCode: 'bc', territoryName: 'BC' }),
      locationChanged: true,
      client,
    });
    expect(result).toEqual({ ok: true });
    expect(resolveMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ resolution: 'no_longer_applicable', resolvedBy: null }),
      client,
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('respects left_unassigned closure when fingerprint unchanged', async () => {
    const fp = { postalCode: '98101', address: '1 Pike St', storeTerritoryCode: 'wa' };
    findLastLeftUnassignedResolutionMock.mockResolvedValue({ locationFingerprint: fp });
    const result = await syncOperationalTerritoryReview({
      prospect: baseProspect(),
      locationChanged: false,
      client,
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('reopens after left_unassigned when location changes', async () => {
    const fp = { postalCode: '98101', address: '1 Pike St', storeTerritoryCode: 'wa' };
    findLastLeftUnassignedResolutionMock.mockResolvedValue({ locationFingerprint: fp });
    const result = await syncOperationalTerritoryReview({
      prospect: baseProspect({ postalCode: '97201', region: 'OR', territoryCode: 'or' }),
      locationChanged: true,
      client,
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalled();
  });

  it('enqueues when assigned prospect loses ZIP after location change', async () => {
    const result = await syncOperationalTerritoryReview({
      prospect: baseProspect({
        operationalTerritoryId: 'ops-pnw-west',
        operationalTerritoryCode: 'pnw-west',
        operationalTerritoryName: 'PNW West',
        postalCode: '',
        address: '',
      }),
      locationChanged: true,
      client,
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        trigger: 'location_changed_unresolved',
        detail_reason: 'missing_zip_or_county',
      }),
      client,
    );
  });

  it('enqueues when assigned prospect has multi-county span after location change', async () => {
    const result = await syncOperationalTerritoryReview({
      prospect: baseProspect({
        territoryCode: 'ca',
        territoryName: 'California',
        region: 'CA',
        postalCode: '92530',
        operationalTerritoryId: 'ops-la-metro',
        operationalTerritoryCode: 'la-metro-oc',
        operationalTerritoryName: 'LA Metro OC',
      }),
      locationChanged: true,
      client,
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        trigger: 'location_changed_unresolved',
        detail_reason: 'unresolved_geography',
      }),
      client,
    );
  });

  it('skips enqueue when ops assigned in same write', async () => {
    const result = await syncOperationalTerritoryReview({
      prospect: baseProspect({
        operationalTerritoryId: 'ops-pnw-west',
        operationalTerritoryCode: 'pnw-west',
      }),
      locationChanged: true,
      opsAssignedThisWrite: true,
      client,
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
