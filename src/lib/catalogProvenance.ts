export type FieldSource = 'catalog' | 'user' | 'ai' | 'calculated' | 'import' | 'unknown';

export type FieldMetaEntry = {
  source?: FieldSource;
  verified?: boolean;
  confidence?: number | null;
  proposedValue?: unknown;
  proposedSource?: FieldSource;
  updatedAt?: string;
};

export type FieldMetaMap = Record<string, FieldMetaEntry>;

/**
 * Resolve effective commercial value.
 * Precedence: verified user override → verified catalog → import → (AI stays proposed) → blank.
 */
export function resolveEffectiveNumber(input: {
  override: number | null | undefined;
  catalog: number | null | undefined;
  legacy?: number | null | undefined;
  meta?: FieldMetaEntry;
}): number {
  if (input.override != null && Number.isFinite(input.override)) {
    return input.override;
  }
  if (input.catalog != null && Number.isFinite(input.catalog)) {
    return input.catalog;
  }
  if (input.legacy != null && Number.isFinite(input.legacy)) {
    return input.legacy;
  }
  return 0;
}

export function hasManualOverride(override: number | null | undefined): boolean {
  return override != null && Number.isFinite(override);
}

export function canAiFillField(meta: FieldMetaEntry | undefined): boolean {
  if (!meta) return true;
  if (meta.verified && (meta.source === 'user' || meta.source === 'catalog')) return false;
  if (meta.source === 'user' || meta.source === 'catalog') return false;
  return true;
}

export function markUserEdit(
  meta: FieldMetaMap,
  field: string,
  at = new Date().toISOString(),
): FieldMetaMap {
  return {
    ...meta,
    [field]: {
      ...(meta[field] ?? {}),
      source: 'user',
      verified: true,
      updatedAt: at,
      proposedValue: undefined,
      proposedSource: undefined,
    },
  };
}

export function resetFieldToCatalog(
  meta: FieldMetaMap,
  field: string,
  at = new Date().toISOString(),
): FieldMetaMap {
  return {
    ...meta,
    [field]: {
      source: 'catalog',
      verified: true,
      updatedAt: at,
      proposedValue: undefined,
      proposedSource: undefined,
    },
  };
}
