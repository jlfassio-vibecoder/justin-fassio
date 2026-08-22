export {
  allowedOpsCodesForStore,
  isCanadianStoreCode,
  isOpsAssignmentAllowed,
  storeCodeToStateCode,
} from '@/lib/operationalTerritories/allowedOperationalTerritories';
export {
  countiesForZip,
  ZIP_COUNTY_CROSSWALK,
  ZIP_COUNTY_CROSSWALK_EFFECTIVE_DATE,
  ZIP_COUNTY_CROSSWALK_SOURCE,
  type ZipCountyCrosswalkEntry,
} from '@/lib/operationalTerritories/deriveCountyFips';
export {
  fetchOperationalTerritories,
  type OperationalTerritoryOption,
} from '@/lib/operationalTerritories/fetchOperationalTerritories';
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
export { resolveOperationalTerritoryReviewForProspect } from '@/lib/operationalTerritories/reviewQueue';
export {
  suggestOperationalTerritoryForAccount,
  type SuggestOperationalTerritoryInput,
  type SuggestOperationalTerritoryResult,
} from '@/lib/operationalTerritories/suggestOperationalTerritory';
