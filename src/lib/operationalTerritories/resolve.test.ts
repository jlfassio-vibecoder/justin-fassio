import { describe, expect, it } from 'vitest';
import {
  COUNTY_MEMBERSHIP_SEEDS,
  EXPECTED_COUNTY_COUNTS,
  LA_COUNTY_FIPS,
  OPS_TERRITORY_SEED_EFFECTIVE_DATE,
  OPS_TERRITORY_SEED_SOURCE,
  ZIP_MEMBERSHIP_SEEDS,
} from '@/lib/operationalTerritories/membershipSeedData';
import {
  ogrMayConsumeOperationalTerritory,
  resolveOperationalTerritory,
} from '@/lib/operationalTerritories/resolve';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('operational territory Phase 0 coverage', () => {
  it('records seed provenance', () => {
    expect(OPS_TERRITORY_SEED_SOURCE.length).toBeGreaterThan(10);
    expect(OPS_TERRITORY_SEED_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const provenance = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/territories/provenance.json'), 'utf8'),
    ) as { source: string; effective_date: string };
    expect(provenance.source).toBe(OPS_TERRITORY_SEED_SOURCE);
    expect(provenance.effective_date).toBe(OPS_TERRITORY_SEED_EFFECTIVE_DATE);
  });

  it('covers every WA and OR county exactly once', () => {
    const wa = COUNTY_MEMBERSHIP_SEEDS.filter((r) => r.state_code === 'WA');
    const or = COUNTY_MEMBERSHIP_SEEDS.filter((r) => r.state_code === 'OR');
    expect(wa).toHaveLength(EXPECTED_COUNTY_COUNTS.WA);
    expect(or).toHaveLength(EXPECTED_COUNTY_COUNTS.OR);
    expect(new Set(wa.map((r) => r.county_fips)).size).toBe(wa.length);
    expect(new Set(or.map((r) => r.county_fips)).size).toBe(or.length);
    expect(
      wa.every((r) => r.territory_code === 'pnw-west' || r.territory_code === 'pnw-east'),
    ).toBe(true);
    expect(
      or.every((r) => r.territory_code === 'pnw-west' || r.territory_code === 'pnw-east'),
    ).toBe(true);
  });

  it('covers every CA county except LA exactly once', () => {
    const ca = COUNTY_MEMBERSHIP_SEEDS.filter((r) => r.state_code === 'CA');
    expect(ca).toHaveLength(EXPECTED_COUNTY_COUNTS.CA_EX_LA);
    expect(ca.some((r) => r.county_fips === LA_COUNTY_FIPS)).toBe(false);
    expect(new Set(ca.map((r) => r.county_fips)).size).toBe(ca.length);
  });

  it('locks Monterey, Fresno, and Kern', () => {
    expect(COUNTY_MEMBERSHIP_SEEDS.find((r) => r.county_fips === '06053')?.territory_code).toBe(
      'norcal-coastal',
    );
    expect(COUNTY_MEMBERSHIP_SEEDS.find((r) => r.county_fips === '06019')?.territory_code).toBe(
      'norcal-inland',
    );
    expect(COUNTY_MEMBERSHIP_SEEDS.find((r) => r.county_fips === '06029')?.territory_code).toBe(
      'ie-san-diego',
    );
  });

  it('assigns each approved LA ZIP exactly once to territory 5 or 6', () => {
    expect(ZIP_MEMBERSHIP_SEEDS.every((r) => r.state_code === 'CA')).toBe(true);
    expect(
      ZIP_MEMBERSHIP_SEEDS.every(
        (r) => r.territory_code === 'ca-central-la-north' || r.territory_code === 'la-metro-oc',
      ),
    ).toBe(true);
    expect(new Set(ZIP_MEMBERSHIP_SEEDS.map((r) => r.zip)).size).toBe(ZIP_MEMBERSHIP_SEEDS.length);
    expect(ZIP_MEMBERSHIP_SEEDS.every((r) => /^[0-9]{5}$/.test(r.zip))).toBe(true);
  });
});

describe('resolveOperationalTerritory', () => {
  it('prefers ZIP exact over county', () => {
    const zipRow = ZIP_MEMBERSHIP_SEEDS[0];
    const result = resolveOperationalTerritory({
      zip: zipRow.zip,
      countyFips: '06053', // Monterey — would be coastal if county won
      stateCode: 'CA',
    });
    expect(result).toEqual({
      ok: true,
      territoryCode: zipRow.territory_code,
      matchedBy: 'zip',
    });
  });

  it('resolves county when ZIP unknown (non-LA)', () => {
    const result = resolveOperationalTerritory({
      zip: '99999',
      countyFips: '06053',
      stateCode: 'CA',
    });
    expect(result).toEqual({
      ok: true,
      territoryCode: 'norcal-coastal',
      matchedBy: 'county',
    });
  });

  it('returns la_zip_unlisted for LA county without approved ZIP', () => {
    const result = resolveOperationalTerritory({
      zip: '90000',
      countyFips: LA_COUNTY_FIPS,
      stateCode: 'CA',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('la_zip_unlisted');
  });

  it('does not infer from ZIP numeric proximity', () => {
    const result = resolveOperationalTerritory({
      zip: '91300', // near valley ZIPs but not seeded
      stateCode: 'CA',
    });
    expect(result.ok).toBe(false);
  });

  it('enforces OGR may only consume PNW West/East', () => {
    expect(ogrMayConsumeOperationalTerritory('pnw-west')).toBe(true);
    expect(ogrMayConsumeOperationalTerritory('norcal-coastal')).toBe(false);
    expect(ogrMayConsumeOperationalTerritory('la-metro-oc')).toBe(false);
  });
});

describe('schema migration files', () => {
  it('define operational registry, memberships, review queue, and operational_territory_id', () => {
    const schema = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260822171921_operational_territories_geography.sql',
      ),
      'utf8',
    );
    expect(schema).toMatch(/create table if not exists operational_territories/);
    expect(schema).toMatch(/create table if not exists territory_geography_memberships/);
    expect(schema).toMatch(/create table if not exists territory_geography_seed_batches/);
    expect(schema).toMatch(/create table if not exists operational_territory_review_queue/);
    expect(schema).toMatch(/operational_territory_id/);
    expect(schema).not.toMatch(/zip_range/);
    expect(schema).toMatch(/is_approved_staff/);
  });

  it('seed migration asserts full coverage and locked counties', () => {
    const seed = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260822173157_operational_territory_memberships_seed.sql',
      ),
      'utf8',
    );
    expect(seed).toMatch(/WA county coverage/);
    expect(seed).toMatch(/LA ZIP coverage/);
    expect(seed).toMatch(/Monterey lock/);
    expect(seed).toMatch(/Fresno lock/);
    expect(seed).toMatch(/Kern lock/);
    expect(seed).toMatch(/a1000000-0000-4000-8000-000000000001/);
  });
});
