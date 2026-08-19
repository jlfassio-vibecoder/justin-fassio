import { hasMarker } from '@/lib/accountImport/classification';
import type { AccountStatus, LineAccountMarker, RelationshipStatus } from '@/types/database';

export const LOOKALIKE_LINE_CODE = 'ogr';
export const LOOKALIKE_MAX_SEEDS = 12;
export const LOOKALIKE_MAX_CANDIDATES = 8;

export const LOOKALIKE_PROSPECT_DEFAULTS = {
  relationshipStatus: 'prospect' as RelationshipStatus,
  accountStatus: 'prospect' as AccountStatus,
  existingOgr: 'Unknown',
  markers: ['lookalike_prospect'] as LineAccountMarker[],
  importProtected: true as const,
  qualificationStatus: null,
  convertedAt: null,
  initialOrderDate: null,
  createOrders: false as const,
};

export function isLookalikeSeedRla(row: {
  lineCode?: string | null;
  relationshipStatus: string;
  markers?: readonly string[] | null;
}): boolean {
  if (row.lineCode && row.lineCode !== LOOKALIKE_LINE_CODE) return false;
  if (row.relationshipStatus === 'terminated') return false;
  return hasMarker(row.markers, 'historical_purchaser');
}

export function parseLookalikeSeedIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = [
    ...new Set(
      raw
        .map((value) =>
          typeof value === 'number' && Number.isFinite(value)
            ? Math.floor(value)
            : typeof value === 'string' && value.trim()
              ? Math.floor(Number(value))
              : NaN,
        )
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  if (ids.length < 1 || ids.length > LOOKALIKE_MAX_SEEDS) return null;
  return ids;
}
