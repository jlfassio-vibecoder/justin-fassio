/**
 * Server-side staff feature flags (Phase 2+).
 * Never expose as PUBLIC_* — staff UI reads a boolean snapshot via /api/staff/features.
 */

export type StaffFeatureFlags = {
  /** Enables represented-line picker, /app/lines/* routes, and line-scoped reads. Default off. */
  FEATURE_MULTI_LINE_UI: boolean;
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

/** Snapshot of staff feature flags for approved-staff API responses. */
export function getStaffFeatureFlags(): StaffFeatureFlags {
  return {
    FEATURE_MULTI_LINE_UI: isMultiLineUiEnabled(),
  };
}
