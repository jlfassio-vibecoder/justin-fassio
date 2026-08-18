import type { CollapsedImportRow, NormalizedImportRow } from '@/lib/accountImport/types';

const MERGE_FIELDS = [
  'street',
  'city',
  'stateCode',
  'postalCode',
  'postal5',
  'formerRepCode',
  'storeTypeRaw',
  'contactName',
  'email',
  'phone',
  'website',
  'externalId',
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];

function populatedCount(row: NormalizedImportRow): number {
  return (
    MERGE_FIELDS.reduce((count, field) => count + (row[field] ? 1 : 0), 0) + (row.name ? 1 : 0)
  );
}

function assignMergedField<K extends MergeField>(
  merged: NormalizedImportRow,
  field: K,
  value: NormalizedImportRow[K],
): void {
  merged[field] = value;
}

function mergeSurvivor(a: NormalizedImportRow, b: NormalizedImportRow): NormalizedImportRow {
  const winner = populatedCount(b) > populatedCount(a) ? b : a;
  const other = winner === a ? b : a;
  const merged: NormalizedImportRow = { ...winner, warnings: [...winner.warnings] };

  for (const field of MERGE_FIELDS) {
    const w = winner[field];
    const o = other[field];
    if (!w && o) {
      assignMergedField(merged, field, o);
    } else if (w && o && w !== o) {
      merged.warnings.push(
        `Kept ${field} from the more complete row; conflicting value was not overwritten`,
      );
      if (field === 'city' || field === 'stateCode' || field === 'postal5') {
        merged.warnings.push('Conflicting location on duplicate rows');
      }
    }
  }

  for (const warning of other.warnings) {
    if (!merged.warnings.includes(warning)) merged.warnings.push(warning);
  }

  return merged;
}

export function collapseInFileDuplicates(rows: NormalizedImportRow[]): CollapsedImportRow[] {
  const byFingerprint = new Map<string, NormalizedImportRow[]>();
  const unmatched: NormalizedImportRow[] = [];

  for (const row of rows) {
    if (!row.fingerprint) {
      unmatched.push(row);
      continue;
    }
    const group = byFingerprint.get(row.fingerprint) ?? [];
    group.push(row);
    byFingerprint.set(row.fingerprint, group);
  }

  const collapsed: CollapsedImportRow[] = [];

  for (const group of byFingerprint.values()) {
    if (group.length === 1) {
      const only = group[0];
      collapsed.push({
        ...only,
        inFileDuplicateOf: null,
        collapsedFromRowNumbers: [only.rowNumber],
      });
      continue;
    }

    let survivor = group[0];
    for (let i = 1; i < group.length; i += 1) {
      survivor = mergeSurvivor(survivor, group[i]);
    }

    const locationConflict = survivor.warnings.some((w) => w.includes('Conflicting location'));
    collapsed.push({
      ...survivor,
      warnings: locationConflict
        ? [...survivor.warnings, 'Duplicate rows have conflicting city, state, or ZIP']
        : survivor.warnings,
      inFileDuplicateOf: null,
      collapsedFromRowNumbers: group.map((r) => r.rowNumber),
    });

    for (const dup of group) {
      if (dup.rowNumber === survivor.rowNumber) continue;
      collapsed.push({
        ...dup,
        inFileDuplicateOf: survivor.rowNumber,
        collapsedFromRowNumbers: [dup.rowNumber],
      });
    }
  }

  for (const row of unmatched) {
    const sameNameMissingGeo = rows.filter(
      (other) =>
        other !== row &&
        other.nameNormalized === row.nameNormalized &&
        !other.fingerprint &&
        !row.fingerprint,
    );
    collapsed.push({
      ...row,
      warnings:
        sameNameMissingGeo.length > 0
          ? [...row.warnings, 'Same name with missing state and ZIP cannot be auto-collapsed']
          : row.warnings,
      inFileDuplicateOf: null,
      collapsedFromRowNumbers: [row.rowNumber],
    });
  }

  return collapsed.sort((a, b) => a.rowNumber - b.rowNumber);
}

export function uniqueBusinessRows(rows: CollapsedImportRow[]): CollapsedImportRow[] {
  return rows.filter((row) => row.inFileDuplicateOf == null);
}
