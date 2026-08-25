/**
 * Server-side staff feature flags (Phase 2+).
 * Never expose as PUBLIC_* — staff UI reads a boolean snapshot via /api/staff/features.
 */

export type StaffFeatureFlags = {
  /** Enables represented-line picker, /app/lines/* routes, and line-scoped reads. Default off. */
  FEATURE_MULTI_LINE_UI: boolean;
  /** Enables writes on line accounts as source of truth. Default off. Not PUBLIC_. */
  FEATURE_MULTI_LINE_WRITES: boolean;
  /** Isolates staff AI behind explicit sales_line_id. Default off. Not PUBLIC_. */
  FEATURE_MULTI_LINE_AI: boolean;
  /** Enables line-territory rights CRUD. Default off. Not PUBLIC_. */
  FEATURE_LINE_TERRITORY_ADMIN: boolean;
  /**
   * Eagle Peak convert / orders / calls / reorder / junction.
   * Snapshot is selling && UI && writes. Default off. Not PUBLIC_.
   */
  FEATURE_EAGLE_PEAK_SELLING: boolean;
  /**
   * Staff generate-draft / briefing product pick in Eagle Peak context.
   * Snapshot is outreach && UI (does not AND writes). Default off. Not PUBLIC_.
   */
  FEATURE_EAGLE_PEAK_OUTREACH: boolean;
  /**
   * Reserved public EP catalog flag (Phase 6 no-op). Raw server value only.
   * Default off. Not PUBLIC_. Not wired to AuthGate / LineContext.
   */
  FEATURE_EAGLE_PEAK_PUBLIC_CATALOG: boolean;
  /**
   * Big Fish convert / orders / calls / reorder / junction.
   * Snapshot is selling && UI && writes. Default off. Not PUBLIC_.
   */
  FEATURE_BIG_FISH_SELLING: boolean;
  /**
   * Staff generate-draft / briefing product pick in Big Fish context.
   * Snapshot is outreach && UI (does not AND writes). Default off. Not PUBLIC_.
   */
  FEATURE_BIG_FISH_OUTREACH: boolean;
  /**
   * Reserved public BF catalog flag (Phase 7 no-op). Raw server value only.
   * Default off. Not PUBLIC_. Not wired to AuthGate / LineContext.
   */
  FEATURE_BIG_FISH_PUBLIC_CATALOG: boolean;
  /**
   * Owner Prospective Lines acquisition workspace.
   * Snapshot is prospective && UI (does not AND writes). Default off. Not PUBLIC_.
   */
  FEATURE_PROSPECTIVE_LINES: boolean;
};

/** Island snapshot omits reserved public-catalog flags (no EP/BF showroom). */
export type StaffIslandFeatureFlags = Omit<
  StaffFeatureFlags,
  'FEATURE_EAGLE_PEAK_PUBLIC_CATALOG' | 'FEATURE_BIG_FISH_PUBLIC_CATALOG'
>;

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** Parse a server env string as a feature flag (default off). */
export function parseFeatureFlag(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  return TRUTHY.has(normalized);
}

function readEnv(name: string): string | undefined {
  const fromProcess = typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
  if (typeof fromProcess === 'string' && fromProcess.trim()) return fromProcess;
  const fromImportMeta =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, string | undefined> | undefined)?.[name]
      : undefined;
  if (typeof fromImportMeta === 'string' && fromImportMeta.trim()) return fromImportMeta;
  return undefined;
}

/** Read FEATURE_MULTI_LINE_UI from server env (default off). */
export function isMultiLineUiEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_MULTI_LINE_UI'));
}

/** Read FEATURE_MULTI_LINE_WRITES from server env (default off). */
export function isMultiLineWritesEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_MULTI_LINE_WRITES'));
}

/** Read FEATURE_MULTI_LINE_AI from server env (default off). */
export function isMultiLineAiEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_MULTI_LINE_AI'));
}

/** Read FEATURE_LINE_TERRITORY_ADMIN from server env (default off). */
export function isLineTerritoryAdminEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_LINE_TERRITORY_ADMIN'));
}

/** Read FEATURE_EAGLE_PEAK_SELLING from server env (default off). */
export function isEaglePeakSellingEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_EAGLE_PEAK_SELLING'));
}

/** Read FEATURE_EAGLE_PEAK_OUTREACH from server env (default off). */
export function isEaglePeakOutreachEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_EAGLE_PEAK_OUTREACH'));
}

/** Read FEATURE_EAGLE_PEAK_PUBLIC_CATALOG from server env (default off). Phase 6 no-op. */
export function isEaglePeakPublicCatalogEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_EAGLE_PEAK_PUBLIC_CATALOG'));
}

/** Read FEATURE_BIG_FISH_SELLING from server env (default off). */
export function isBigFishSellingEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_BIG_FISH_SELLING'));
}

/** Read FEATURE_BIG_FISH_OUTREACH from server env (default off). */
export function isBigFishOutreachEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_BIG_FISH_OUTREACH'));
}

/** Read FEATURE_BIG_FISH_PUBLIC_CATALOG from server env (default off). Phase 7 no-op. */
export function isBigFishPublicCatalogEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_BIG_FISH_PUBLIC_CATALOG'));
}

/** Read FEATURE_PROSPECTIVE_LINES from server env (default off). */
export function isProspectiveLinesEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_PROSPECTIVE_LINES'));
}

/**
 * Overnight Vercel cron for outreach prep (`/api/cron/outreach-nightly-prep`).
 * Default off for MVP (manual Run prep now only). Not PUBLIC_; not on staff island snapshot.
 */
export function isOutreachNightlyPrepEnabled(): boolean {
  return parseFeatureFlag(readEnv('FEATURE_OUTREACH_NIGHTLY_PREP'));
}

/** Snapshot of staff feature flags for approved-staff API responses. */
export function getStaffFeatureFlags(): StaffFeatureFlags {
  const ui = isMultiLineUiEnabled();
  return {
    FEATURE_MULTI_LINE_UI: ui,
    // Writes without the picker leaves salesLineId null and blocks selling UI.
    FEATURE_MULTI_LINE_WRITES: isMultiLineWritesEnabled() && ui,
    // AI without the picker cannot send salesLineId; snapshot stays off.
    FEATURE_MULTI_LINE_AI: isMultiLineAiEnabled() && ui,
    // Territory admin without the picker has no current salesLineId.
    FEATURE_LINE_TERRITORY_ADMIN: isLineTerritoryAdminEnabled() && ui,
    // Selling without picker/writes would hit the OGR legacy convert path.
    FEATURE_EAGLE_PEAK_SELLING: isEaglePeakSellingEnabled() && ui && isMultiLineWritesEnabled(),
    // Outreach generate-draft needs the picker to send salesLineId; do not AND writes.
    FEATURE_EAGLE_PEAK_OUTREACH: isEaglePeakOutreachEnabled() && ui,
    // Reserved; Phase 6 does not add public RPCs or a showroom.
    FEATURE_EAGLE_PEAK_PUBLIC_CATALOG: isEaglePeakPublicCatalogEnabled(),
    // Selling without picker/writes would hit the OGR legacy convert path.
    FEATURE_BIG_FISH_SELLING: isBigFishSellingEnabled() && ui && isMultiLineWritesEnabled(),
    // Outreach generate-draft needs the picker to send salesLineId; do not AND writes.
    FEATURE_BIG_FISH_OUTREACH: isBigFishOutreachEnabled() && ui,
    // Reserved; Phase 7 does not add public RPCs or a showroom.
    FEATURE_BIG_FISH_PUBLIC_CATALOG: isBigFishPublicCatalogEnabled(),
    // Acquisition workspace without the picker has no line routes.
    FEATURE_PROSPECTIVE_LINES: isProspectiveLinesEnabled() && ui,
  };
}
