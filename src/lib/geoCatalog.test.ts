import { describe, expect, it } from 'vitest';
import {
  REGIONS_BY_TERRITORY,
  UNASSIGNED_REGION_VALUE,
  allDriveableRegionOptions,
  isStatewideRegionLabel,
  opsCodeForBriefingRegion,
  regionOptionsForTerritory,
  territoryCodeFromDriveableRegion,
} from '@/lib/geoCatalog';

describe('geoCatalog', () => {
  it('nests driveable regions under store territories (no statewide Oregon/Washington siblings)', () => {
    const orValues = (REGIONS_BY_TERRITORY.or ?? []).map((r) => r.value);
    const waValues = (REGIONS_BY_TERRITORY.wa ?? []).map((r) => r.value);
    const bcValues = (REGIONS_BY_TERRITORY.bc ?? []).map((r) => r.value);

    expect(orValues).toContain('Portland Metro & Gorge');
    expect(orValues).toContain('Eastern Oregon');
    expect(orValues).not.toContain('Oregon');
    expect(waValues).toContain('Puget Sound');
    expect(waValues).not.toContain('Washington');
    expect(bcValues).toContain('Okanagan');
    expect(bcValues).not.toContain('British Columbia');

    const flat = allDriveableRegionOptions().map((o) => o.value);
    expect(flat).not.toContain('Oregon');
    expect(flat).not.toContain('Washington');
    expect(flat).toContain('Okanagan');
    expect(flat).toContain(UNASSIGNED_REGION_VALUE);
  });

  it('regionOptionsForTerritory includes All + clusters + Unassigned for a store geo', () => {
    const or = regionOptionsForTerritory('or');
    expect(or[0]).toEqual({ value: 'ALL', label: 'All regions' });
    expect(or.map((o) => o.value)).toContain('Willamette Valley');
    expect(or.map((o) => o.value)).toContain(UNASSIGNED_REGION_VALUE);
    expect(or.map((o) => o.value)).not.toContain('Oregon');

    const all = regionOptionsForTerritory('ALL');
    expect(all).toEqual([{ value: 'ALL', label: 'All regions' }]);
  });

  it('recognizes statewide leftovers and driveable → territory mapping', () => {
    expect(isStatewideRegionLabel('Oregon', 'or')).toBe(true);
    expect(isStatewideRegionLabel('oregon', 'or')).toBe(true);
    expect(isStatewideRegionLabel('Willamette Valley', 'or')).toBe(false);
    expect(isStatewideRegionLabel('Oregon', 'wa')).toBe(false);
    expect(isStatewideRegionLabel('Oregon')).toBe(true);

    expect(territoryCodeFromDriveableRegion('Puget Sound')).toBe('wa');
    expect(territoryCodeFromDriveableRegion('Portland Metro & Gorge')).toBe('or');
    expect(territoryCodeFromDriveableRegion('Okanagan')).toBe('bc');
  });

  it('maps briefing regions to pnw-west / pnw-east', () => {
    expect(opsCodeForBriefingRegion('or', 'ALL')).toBe('pnw-west');
    expect(opsCodeForBriefingRegion('or', 'Portland Metro & Gorge')).toBe('pnw-west');
    expect(opsCodeForBriefingRegion('or', 'Central Oregon')).toBe('pnw-east');
    expect(opsCodeForBriefingRegion('wa', 'Puget Sound')).toBe('pnw-west');
    expect(opsCodeForBriefingRegion('wa', 'Eastern Washington')).toBe('pnw-east');
    expect(opsCodeForBriefingRegion('', 'ALL')).toBeNull();
  });
});
