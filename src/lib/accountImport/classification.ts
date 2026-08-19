/**
 * Bulk-import classification contract (Phase 1 data foundation).
 * No I/O — Phase B will call these helpers when committing rows.
 */

import type {
  AccountImportSourceType,
  AccountStatus,
  ActivityStatus,
  LineAccountMarker,
  ProductivityClass,
  RelationshipStatus,
} from '@/types/database';

export const LINE_ACCOUNT_MARKERS = [
  'historical_purchaser',
  'reactivation_candidate',
  'reactivation_unresponsive',
  'outreach_eligible',
  'lookalike_prospect',
] as const satisfies readonly LineAccountMarker[];

/** Markers import commit may stamp. outreach_eligible is owner opt-in only. */
export const IMPORT_SETTABLE_MARKERS = [
  'historical_purchaser',
  'reactivation_candidate',
  'reactivation_unresponsive',
] as const satisfies readonly LineAccountMarker[];

const ALLOWED_MARKERS = new Set<string>(LINE_ACCOUNT_MARKERS);
const IMPORT_SETTABLE_MARKER_SET = new Set<string>(IMPORT_SETTABLE_MARKERS);

export const ACCOUNT_IMPORT_SOURCE_TYPES = [
  'historical_customer',
  'faire_customer',
  'zoominfo_lead',
  'research_prospect',
  'other',
] as const satisfies readonly AccountImportSourceType[];

export const ACCOUNT_IMPORT_SOURCE_OPTIONS = [
  { value: 'historical_customer', label: 'Historical customer', enabled: true },
  { value: 'faire_customer', label: 'Faire customer', enabled: true },
  { value: 'zoominfo_lead', label: 'ZoomInfo', enabled: true },
  { value: 'research_prospect', label: 'Research', enabled: false },
  { value: 'other', label: 'Other', enabled: false },
] as const;

/** ZoomInfo spreadsheet import is Eagle Peak only (F3). */
export const ZOOMINFO_IMPORT_LINE_CODE = 'eagle-peak';

export function isZoominfoLeadSource(sourceType: AccountImportSourceType): boolean {
  return sourceType === 'zoominfo_lead';
}

export function isAccountImportSourceEnabled(
  sourceType: AccountImportSourceType,
  lineCode: string | undefined,
): boolean {
  const option = ACCOUNT_IMPORT_SOURCE_OPTIONS.find((item) => item.value === sourceType);
  if (!option?.enabled) return false;
  if (isZoominfoLeadSource(sourceType)) return lineCode === ZOOMINFO_IMPORT_LINE_CODE;
  return true;
}

export function isLineAccountMarker(value: string): value is LineAccountMarker {
  return ALLOWED_MARKERS.has(value);
}

export function isImportSettableMarker(value: string): value is LineAccountMarker {
  return IMPORT_SETTABLE_MARKER_SET.has(value);
}

export function hasMarker(
  markers: readonly string[] | null | undefined,
  marker: LineAccountMarker,
): boolean {
  return (markers ?? []).includes(marker);
}

/** Union current + added markers; drop unknowns and duplicates, preserve first-seen order. */
export function withMarkers(
  current: readonly string[] | null | undefined,
  add: readonly LineAccountMarker[],
): LineAccountMarker[] {
  const out: LineAccountMarker[] = [];
  const seen = new Set<LineAccountMarker>();
  for (const raw of [...(current ?? []), ...add]) {
    if (!isLineAccountMarker(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/** Drop a marker; keep remaining allowlisted values in first-seen order. */
export function withoutMarker(
  current: readonly string[] | null | undefined,
  marker: LineAccountMarker,
): LineAccountMarker[] {
  const out: LineAccountMarker[] = [];
  const seen = new Set<LineAccountMarker>();
  for (const raw of current ?? []) {
    if (!isLineAccountMarker(raw) || raw === marker || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export function markersAfterOutreachOptIn(
  current: readonly string[] | null | undefined,
  eligible: boolean,
): LineAccountMarker[] {
  return eligible
    ? withMarkers(current, ['outreach_eligible'])
    : withoutMarker(current, 'outreach_eligible');
}

/** Park a historical reactivation account: keep purchaser, drop candidate and outreach opt-in. */
export function markersAfterMarkUnresponsive(
  current: readonly string[] | null | undefined,
): LineAccountMarker[] {
  return withMarkers(
    withoutMarker(withoutMarker(current, 'reactivation_candidate'), 'outreach_eligible'),
    ['historical_purchaser', 'reactivation_unresponsive'],
  );
}

/** Reverse F2: restore candidate, clear unresponsive and outreach opt-in. */
export function markersAfterReopenCandidate(
  current: readonly string[] | null | undefined,
): LineAccountMarker[] {
  return withMarkers(
    withoutMarker(withoutMarker(current, 'reactivation_unresponsive'), 'outreach_eligible'),
    ['historical_purchaser', 'reactivation_candidate'],
  );
}

export type ImportClassificationDefaults = {
  relationshipStatus: RelationshipStatus;
  accountStatus: AccountStatus;
  convertedAt: null;
  initialOrderDate: null;
  createOrders: false;
  existingOgr: string;
  markers: LineAccountMarker[];
  importProtected: true;
  qualificationStatus: string | null;
  productivityClass: ProductivityClass;
};

export type HistoricalOgrImportDefaults = ImportClassificationDefaults & {
  existingOgr: 'yes';
  qualificationStatus: 'reactivation';
};

/** Design §5.2 — attested past OGR purchaser with no order ledger. */
export const HISTORICAL_OGR_IMPORT_DEFAULTS: HistoricalOgrImportDefaults = {
  relationshipStatus: 'opened',
  accountStatus: 'active_account',
  convertedAt: null,
  initialOrderDate: null,
  createOrders: false,
  existingOgr: 'yes',
  markers: ['historical_purchaser', 'reactivation_candidate'],
  importProtected: true,
  qualificationStatus: 'reactivation',
  productivityClass: 'unclassified',
};

/** F3 — ZoomInfo lead on Eagle Peak: never-ordered prospect, no OGR/reactivation stamps. */
export const ZOOMINFO_LEAD_IMPORT_DEFAULTS: ImportClassificationDefaults = {
  relationshipStatus: 'prospect',
  accountStatus: 'prospect',
  convertedAt: null,
  initialOrderDate: null,
  createOrders: false,
  existingOgr: 'Unknown',
  markers: [],
  importProtected: true,
  qualificationStatus: null,
  productivityClass: 'unclassified',
};

export function defaultsForImportSource(
  sourceType: AccountImportSourceType,
): ImportClassificationDefaults {
  return isZoominfoLeadSource(sourceType)
    ? ZOOMINFO_LEAD_IMPORT_DEFAULTS
    : HISTORICAL_OGR_IMPORT_DEFAULTS;
}

const ZOOMINFO_FORBIDDEN_MARKERS: ReadonlySet<string> = new Set([
  'historical_purchaser',
  'reactivation_candidate',
  'reactivation_unresponsive',
  'outreach_eligible',
  'lookalike_prospect',
]);

/** Server-side ZoomInfo classification lock. Empty markers stay empty. */
export function assertZoominfoImportClassification(classification: {
  relationshipStatus: string;
  markers: readonly string[];
  existingOgr: string;
}): { ok: true } | { ok: false; error: string; status: 400 } {
  if (classification.relationshipStatus !== 'prospect') {
    return {
      ok: false,
      error: 'ZoomInfo import must use prospect relationship',
      status: 400,
    };
  }
  if (classification.markers.some((marker) => ZOOMINFO_FORBIDDEN_MARKERS.has(marker))) {
    return {
      ok: false,
      error: 'ZoomInfo import cannot stamp historical or outreach markers',
      status: 400,
    };
  }
  if (classification.markers.length > 0) {
    return {
      ok: false,
      error: 'ZoomInfo import cannot stamp line-account markers',
      status: 400,
    };
  }
  if (classification.existingOgr.trim().toLowerCase() === 'yes') {
    return {
      ok: false,
      error: 'ZoomInfo import cannot set existing_ogr to yes',
      status: 400,
    };
  }
  return { ok: true };
}

/** Mirrors retailer_line_account_activity. Do not invent orders. */
export function activityStatusFromEvidence(input: {
  hasQualifyingOrderLast365Days: boolean;
  hasAnyNonDraftOrder: boolean;
  historicalPurchaser: boolean;
}): ActivityStatus {
  if (input.hasQualifyingOrderLast365Days) return 'active';
  if (input.hasAnyNonDraftOrder) return 'dormant';
  if (input.historicalPurchaser) return 'dormant';
  return 'never_ordered';
}
