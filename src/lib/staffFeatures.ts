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
};

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** Parse a server env string as a feature flag (default off). */
export function parseFeatureFlag(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  return TRUTHY.has(normalized);
}

function readEnv(name: string): string | undefined {
  const fromImportMeta =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, string | undefined>)[name]
      : undefined;
  if (typeof fromImportMeta === 'string') return fromImportMeta;
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
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
  };
}
