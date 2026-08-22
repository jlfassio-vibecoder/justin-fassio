import { isStoreTerritoryCode } from '@/lib/territories';
import { hasMarker } from '@/lib/accountImport/classification';
import type { AccountStatus, RelationshipStatus } from '@/types/database';

export type DirectoryPresentationRow = {
  accountStatus: AccountStatus | string;
  lineRelationshipStatus?: RelationshipStatus | string | null;
  lineAccountMarkers?: readonly string[] | null;
};

export type QualifyingOrderEvidence = {
  order_date: string;
  status: string;
};

/** Mirrors retailer_line_account_activity: non-draft order_date >= asOf - 365 days. */
export function hasQualifyingOrderLast365Days(
  orders: readonly QualifyingOrderEvidence[],
  asOfIso: string,
): boolean {
  const cutoff = isoDateMinusDays(asOfIso, 365);
  if (!cutoff) return false;
  return orders.some((order) => order.status !== 'draft' && order.order_date >= cutoff);
}

export function isReactivationCandidate(
  row: DirectoryPresentationRow,
  evidence: { hasQualifyingOrderLast365Days?: boolean } = {},
): boolean {
  if (evidence.hasQualifyingOrderLast365Days) return false;
  const opened =
    row.lineRelationshipStatus === 'opened' ||
    (row.accountStatus === 'active_account' &&
      row.lineRelationshipStatus !== 'prospect' &&
      row.lineRelationshipStatus !== 'qualified' &&
      row.lineRelationshipStatus !== 'inactive' &&
      row.lineRelationshipStatus !== 'terminated');
  return opened && hasMarker(row.lineAccountMarkers, 'reactivation_candidate');
}

/** Historical purchaser parked or still a candidate — must stay findable on Active Accounts. */
export function isReactivationDirectoryRow(row: DirectoryPresentationRow): boolean {
  if (row.lineRelationshipStatus === 'terminated') return false;
  if (!hasMarker(row.lineAccountMarkers, 'historical_purchaser')) return false;
  return (
    hasMarker(row.lineAccountMarkers, 'reactivation_candidate') ||
    hasMarker(row.lineAccountMarkers, 'reactivation_unresponsive')
  );
}

/** Reactivation filter: opened candidates plus inactive unresponsive historicals. */
export function isReactivationFilterRow(
  row: DirectoryPresentationRow,
  evidence: { hasQualifyingOrderLast365Days?: boolean } = {},
): boolean {
  if (evidence.hasQualifyingOrderLast365Days) return false;
  if (isReactivationCandidate(row, evidence)) return true;
  if (row.lineRelationshipStatus === 'terminated') return false;
  return (
    hasMarker(row.lineAccountMarkers, 'historical_purchaser') &&
    hasMarker(row.lineAccountMarkers, 'reactivation_unresponsive')
  );
}

/** Default Active Accounts list: opened / active_account only (not parked unresponsive). */
export function isDefaultActiveAccountRow(row: DirectoryPresentationRow): boolean {
  if (row.lineRelationshipStatus === 'opened') return true;
  if (row.lineRelationshipStatus === 'inactive' || row.lineRelationshipStatus === 'terminated') {
    return false;
  }
  return row.accountStatus === 'active_account';
}

function isoDateMinusDays(asOfIso: string, days: number): string | null {
  const parts = asOfIso.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const utc = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utc)) return null;
  const shifted = new Date(utc);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return shifted.toISOString().slice(0, 10);
}

export function isProspectsPipelineRow(row: DirectoryPresentationRow): boolean {
  if (hasMarker(row.lineAccountMarkers, 'historical_purchaser')) return false;
  if (row.lineRelationshipStatus === 'opened') return false;
  if (row.lineRelationshipStatus === 'prospect' || row.lineRelationshipStatus === 'qualified') {
    return true;
  }
  return row.accountStatus !== 'active_account';
}

export function territoryDisplayLabel(input: {
  territoryCode: string | null | undefined;
  territoryName: string | null | undefined;
}): string | null {
  const name = input.territoryName?.trim() || null;
  const code = (input.territoryCode ?? '').trim().toLowerCase();
  if (name) return name;
  if (code === 'or') return 'Oregon';
  if (code === 'wa') return 'Washington';
  if (code === 'bc') return 'British Columbia';
  if (code === 'ab') return 'Alberta';
  if (code === 'ca') return 'California';
  return null;
}

/**
 * City / region / store territory for drawer and directory headers.
 * When region equals the store territory name, omit the duplicate:
 * `Grand Ronde · Oregon` instead of `Grand Ronde (Oregon) · Oregon`.
 */
export function formatAccountLocationLine(input: {
  city: string;
  region: string;
  territoryCode?: string | null;
  territoryName?: string | null;
}): string {
  const city = input.city.trim();
  const region = input.region.trim();
  const territory = territoryDisplayLabel({
    territoryCode: input.territoryCode,
    territoryName: input.territoryName,
  });

  if (!city && !region && !territory) return '';

  const regionMatchesTerritory =
    Boolean(territory) && region.toLowerCase() === territory!.toLowerCase();

  if (regionMatchesTerritory) {
    if (city && territory) return `${city} · ${territory}`;
    return city || territory || '';
  }

  const cityRegion = city ? (region ? `${city} (${region})` : city) : region;
  if (cityRegion && territory) return `${cityRegion} · ${territory}`;
  return cityRegion || territory || '';
}

export function parseDirectoryTerritoryParam(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === 'ALL') return value;
  if (isStoreTerritoryCode(value)) return value.trim().toLowerCase();
  return null;
}
