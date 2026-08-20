import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ogrUsInboundTerritoryCode } from '@/lib/ogrUsInboundTerritory';

describe('ogrUsInboundTerritoryCode', () => {
  it('maps Oregon and Washington only', () => {
    expect(ogrUsInboundTerritoryCode('OR')).toBe('or');
    expect(ogrUsInboundTerritoryCode('Oregon')).toBe('or');
    expect(ogrUsInboundTerritoryCode('WA')).toBe('wa');
    expect(ogrUsInboundTerritoryCode(' washington ')).toBe('wa');
  });

  it('does not map California, Canadian provinces, or unknown onto BC or an OGR CA geo', () => {
    expect(ogrUsInboundTerritoryCode('CA')).toBeNull();
    expect(ogrUsInboundTerritoryCode('California')).toBeNull();
    expect(ogrUsInboundTerritoryCode('BC')).toBeNull();
    expect(ogrUsInboundTerritoryCode('NY')).toBeNull();
    expect(ogrUsInboundTerritoryCode('')).toBeNull();
    expect(ogrUsInboundTerritoryCode(null)).toBeNull();
  });

  it('does not import the unknown-province → BC helper', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/ogrUsInboundTerritory.ts'), 'utf8');
    expect(src).not.toMatch(/territoryCodeFromProvince/);
    expect(src).not.toMatch(/BC_TERRITORY_CODE/);
  });
});
