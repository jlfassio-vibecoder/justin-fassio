/**
 * CRM link/thread line isolation (Phase 9A).
 * RLA wins; both-null is legacy OGR-only; mismatched non-null lineage fails closed.
 */

export type CrmLineageFields = {
  salesLineId: string | null | undefined;
  retailerLineAccountId: string | null | undefined;
};

export type ResolvedCrmLineage =
  { kind: 'line'; salesLineId: string } | { kind: 'legacy_ogr' } | { kind: 'mismatch' };

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve which sales line a CRM-linked row belongs to.
 * `rlaSalesLineId` is `retailer_line_accounts.sales_line_id` when the RLA id is set.
 */
export function resolveCrmLineage(
  row: CrmLineageFields,
  rlaSalesLineId?: string | null,
): ResolvedCrmLineage {
  const rowLine = trimOrNull(row.salesLineId);
  const rlaId = trimOrNull(row.retailerLineAccountId);
  const rlaLine = trimOrNull(rlaSalesLineId);

  if (rlaId) {
    if (!rlaLine) return { kind: 'mismatch' };
    if (rowLine && rowLine !== rlaLine) return { kind: 'mismatch' };
    return { kind: 'line', salesLineId: rlaLine };
  }
  if (rowLine) {
    return { kind: 'line', salesLineId: rowLine };
  }
  return { kind: 'legacy_ogr' };
}

/** True when the resolved lineage may appear in this line workspace. */
export function lineageVisibleOnSalesLine(
  resolved: ResolvedCrmLineage,
  salesLineId: string,
  ogrLineId: string | null,
): boolean {
  if (resolved.kind === 'mismatch') return false;
  if (resolved.kind === 'legacy_ogr') {
    return Boolean(ogrLineId && salesLineId === ogrLineId);
  }
  return resolved.salesLineId === salesLineId;
}

export type CrmLineageRow = {
  id: string;
  salesLineId?: string | null;
  retailerLineAccountId?: string | null;
};

export function partitionCrmRowsForSalesLine<T extends CrmLineageRow>(
  rows: T[],
  rlaSalesLineById: Map<string, string>,
  salesLineId: string,
  ogrLineId: string | null,
): { visible: T[]; mismatchIds: string[] } {
  const visible: T[] = [];
  const mismatchIds: string[] = [];
  for (const row of rows) {
    const rlaId = trimOrNull(row.retailerLineAccountId);
    const rlaLine = rlaId ? (rlaSalesLineById.get(rlaId) ?? null) : null;
    const resolved = resolveCrmLineage(
      { salesLineId: row.salesLineId, retailerLineAccountId: row.retailerLineAccountId },
      rlaLine,
    );
    if (resolved.kind === 'mismatch') {
      mismatchIds.push(row.id);
      continue;
    }
    if (lineageVisibleOnSalesLine(resolved, salesLineId, ogrLineId)) {
      visible.push(row);
    }
  }
  return { visible, mismatchIds };
}
