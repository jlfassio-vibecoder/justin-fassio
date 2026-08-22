export {
  COUNTY_MEMBERSHIP_SEEDS,
  EXPECTED_COUNTY_COUNTS,
  LA_COUNTY_FIPS,
  OPS_TERRITORY_CODES,
  OPS_TERRITORY_SEED_EFFECTIVE_DATE,
  OPS_TERRITORY_SEED_SOURCE,
  ZIP_MEMBERSHIP_SEEDS,
  type CountyMembershipSeed,
  type OpsTerritoryCode,
  type ZipMembershipSeed,
} from '@/lib/operationalTerritories/membershipSeedData';
export {
  ogrMayConsumeOperationalTerritory,
  OGR_OPERATIONAL_TERRITORY_CODES,
  normalizeCountyFips,
  normalizeStateCode,
  normalizeZip,
  resolveOperationalTerritory,
  type ResolveOperationalTerritoryInput,
  type ResolveOperationalTerritoryResult,
} from '@/lib/operationalTerritories/resolve';
