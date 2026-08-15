/**
 * Phase 2 line-scoped directory reads + cross-line badge helper.
 * Phase 3 adds RLA write helpers behind FEATURE_MULTI_LINE_WRITES (callers pass snapshot).
 */

import { supabase } from '@/lib/supabase';
import { fetchAllContacts, type ContactDirectoryRow } from '@/lib/accountContacts';
import {
  fetchProspects,
  mapProspectRow,
  PROSPECT_SELECT,
  type Prospect,
  type ProspectListRow,
} from '@/lib/prospects';
import type { AccountContactRole, LineStatus, RelationshipStatus } from '@/types/database';

export type CrossLineBadge = {
  lineCode: string;
  lineName: string;
  relationshipStatus: RelationshipStatus;
};

export type LineAccountResolveResult =
  | { ok: true; lineAccountId: string; salesLineId: string; retailerId: number }
  | { ok: false; reason: 'not_found' | 'wrong_line' };

/** Non-terminated retailer ids for a sales line (empty book → []). */
export async function fetchRetailerIdsForSalesLine(
  salesLineId: string,
): Promise<{ data: number[]; error: string | null }> {
  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .select('retailer_id')
    .eq('sales_line_id', salesLineId)
    .neq('relationship_status', 'terminated');

  if (error) {
    return { data: [], error: error.message };
  }

  const ids = [
    ...new Set((data ?? []).map((r) => r.retailer_id).filter((id) => Number.isFinite(id))),
  ];
  return { data: ids, error: null };
}

/** Non-terminated RLA ids for a sales line. */
export async function fetchLineAccountIdsForSalesLine(
  salesLineId: string,
): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .select('id')
    .eq('sales_line_id', salesLineId)
    .neq('relationship_status', 'terminated');

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []).map((r) => r.id), error: null };
}

/**
 * Directory prospects for a sales line via RLA → prospects identity join.
 * Empty RLA set returns [] (Eagle Peak / Big Fish empty books).
 */
export async function fetchProspectsForSalesLine(
  salesLineId: string,
): Promise<{ data: Prospect[]; error: string | null }> {
  const retailerIds = await fetchRetailerIdsForSalesLine(salesLineId);
  if (retailerIds.error) {
    return { data: [], error: retailerIds.error };
  }
  if (retailerIds.data.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .in('id', retailerIds.data)
    .order('id', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []).map((row) => mapProspectRow(row as ProspectListRow)), error: null };
}

/**
 * Contacts linked via retailer_line_contacts for RLAs on the current line
 * (falls back to RLA retailer filter inside fetchAllContacts).
 */
export async function fetchContactsForSalesLine(
  salesLineId: string,
): Promise<{ data: ContactDirectoryRow[]; error: string | null }> {
  return fetchAllContacts({ salesLineId });
}

/**
 * Cross-line badges for a retailer: other non-terminated RLAs only.
 * Payload is name + relationship_status only (no orders/revenue/KPIs).
 */
export async function fetchCrossLineBadges(input: {
  retailerId: number;
  currentSalesLineId: string;
}): Promise<{ data: CrossLineBadge[]; error: string | null }> {
  const batched = await fetchCrossLineBadgesForRetailers({
    retailerIds: [input.retailerId],
    currentSalesLineId: input.currentSalesLineId,
  });
  if (batched.error) return { data: [], error: batched.error };
  return { data: batched.data.get(input.retailerId) ?? [], error: null };
}

/**
 * Batch cross-line badge reads for a directory list (avoids per-row N+1).
 * Payload remains name + relationship_status only.
 */
export async function fetchCrossLineBadgesForRetailers(input: {
  retailerIds: number[];
  currentSalesLineId: string;
}): Promise<{ data: Map<number, CrossLineBadge[]>; error: string | null }> {
  const ids = [...new Set(input.retailerIds.filter((id) => Number.isFinite(id)))];
  const empty = new Map<number, CrossLineBadge[]>();
  if (ids.length === 0) {
    return { data: empty, error: null };
  }

  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .select('retailer_id, relationship_status, sales_line_id, lines!inner(code, name)')
    .in('retailer_id', ids)
    .neq('sales_line_id', input.currentSalesLineId)
    .neq('relationship_status', 'terminated');

  if (error) {
    return { data: empty, error: error.message };
  }

  const byRetailer = new Map<number, CrossLineBadge[]>();
  for (const row of data ?? []) {
    const line = row.lines as unknown as { code: string; name: string } | null;
    if (!line?.code || !line?.name) continue;
    const retailerId = row.retailer_id;
    const list = byRetailer.get(retailerId) ?? [];
    list.push({
      lineCode: line.code,
      lineName: line.name,
      relationshipStatus: row.relationship_status as RelationshipStatus,
    });
    byRetailer.set(retailerId, list);
  }
  return { data: byRetailer, error: null };
}

/** Shape guard for badge payloads used in tests — forbids commercial fields. */
export function isCrossLineBadgePayload(value: unknown): value is CrossLineBadge {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort();
  if (keys.join(',') !== 'lineCode,lineName,relationshipStatus') return false;
  return (
    typeof v.lineCode === 'string' &&
    typeof v.lineName === 'string' &&
    typeof v.relationshipStatus === 'string'
  );
}

/**
 * Resolve an RLA for a represented line slug.
 * Returns wrong_line when the account exists but belongs to another sales line.
 */
export async function resolveLineAccountForSlug(input: {
  lineSlug: string;
  lineAccountId: string;
}): Promise<LineAccountResolveResult> {
  const { data: line, error: lineError } = await supabase
    .from('lines')
    .select('id, code')
    .eq('code', input.lineSlug.trim().toLowerCase())
    .maybeSingle();

  if (lineError || !line) {
    return { ok: false, reason: 'not_found' };
  }

  const { data: rla, error: rlaError } = await supabase
    .from('retailer_line_accounts')
    .select('id, sales_line_id, retailer_id')
    .eq('id', input.lineAccountId)
    .maybeSingle();

  if (rlaError || !rla) {
    return { ok: false, reason: 'not_found' };
  }

  if (rla.sales_line_id !== line.id) {
    return { ok: false, reason: 'wrong_line' };
  }

  return {
    ok: true,
    lineAccountId: rla.id,
    salesLineId: rla.sales_line_id,
    retailerId: rla.retailer_id,
  };
}

/** Unscoped legacy directory (flag-off path). */
export async function fetchUnscopedDirectoryProspects(): Promise<{
  data: Prospect[];
  error: string | null;
}> {
  return fetchProspects();
}

export type OperationalWriteGate = 'allow' | 'ui_blocked' | 'reject';

export type LineWriteOptions = {
  writesEnabled?: boolean;
  salesLineId?: string | null;
};

export type LineWriteMeta = {
  id: string;
  code: string;
  status: LineStatus;
  defaultCurrency: string | null;
};

export type RetailerLineAccountRow = {
  id: string;
  retailerId: number;
  salesLineId: string;
  relationshipStatus: RelationshipStatus;
  notes: string | null;
  salesLineTerritoryId: string | null;
};

/** Writes path is used when the staff snapshot is on and the caller supplies line context. */
export function isLineAccountWritePath(
  options: LineWriteOptions | undefined,
): options is { writesEnabled: true; salesLineId: string } {
  return Boolean(options?.writesEnabled && options.salesLineId);
}

export function assertLineAllowsOperationalWrite(line: {
  code: string;
  status: string;
}): OperationalWriteGate {
  if (line.status === 'prospective' || line.status === 'declined' || line.status === 'terminated') {
    return 'reject';
  }
  if (line.code === 'bkg') return 'reject';
  if (line.code === 'ogr' && line.status === 'active') return 'allow';
  if (line.code === 'eagle-peak' || line.code === 'big-fish') return 'ui_blocked';
  return 'reject';
}

/** Staff selling UI (convert/order/call/reorder/junction) is OGR-only when writes are on. */
export function isStaffSellingUiBlocked(
  line: { code: string; status: string } | null,
  writesEnabled: boolean,
): boolean {
  if (!writesEnabled) return false;
  if (!line) return true;
  return assertLineAllowsOperationalWrite(line) !== 'allow';
}

export async function fetchLineWriteMeta(
  salesLineId: string,
): Promise<{ data: LineWriteMeta | null; error: string | null }> {
  const { data, error } = await supabase
    .from('lines')
    .select('id, code, status, default_currency')
    .eq('id', salesLineId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: 'Sales line not found' };
  return {
    data: {
      id: data.id,
      code: data.code,
      status: data.status as LineStatus,
      defaultCurrency: data.default_currency,
    },
    error: null,
  };
}

export async function fetchOperationalLineAccount(input: {
  retailerId: number;
  salesLineId: string;
}): Promise<{ data: RetailerLineAccountRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .select('id, retailer_id, sales_line_id, relationship_status, notes, sales_line_territory_id')
    .eq('retailer_id', input.retailerId)
    .eq('sales_line_id', input.salesLineId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return {
    data: {
      id: data.id,
      retailerId: data.retailer_id,
      salesLineId: data.sales_line_id,
      relationshipStatus: data.relationship_status as RelationshipStatus,
      notes: data.notes,
      salesLineTerritoryId: data.sales_line_territory_id,
    },
    error: null,
  };
}

export async function ensureRetailerLineAccount(input: {
  retailerId: number;
  salesLineId: string;
}): Promise<{
  data: RetailerLineAccountRow | null;
  error: string | null;
  gate: OperationalWriteGate;
}> {
  const line = await fetchLineWriteMeta(input.salesLineId);
  if (line.error || !line.data) {
    return { data: null, error: line.error ?? 'Sales line not found', gate: 'reject' };
  }

  const gate = assertLineAllowsOperationalWrite(line.data);
  if (gate === 'reject') {
    return { data: null, error: 'Operational writes are not allowed for this line', gate };
  }

  const existing = await fetchOperationalLineAccount(input);
  if (existing.error) return { data: null, error: existing.error, gate };
  if (existing.data) return { data: existing.data, error: null, gate };

  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .insert({
      retailer_id: input.retailerId,
      sales_line_id: input.salesLineId,
      relationship_status: 'prospect',
    })
    .select('id, retailer_id, sales_line_id, relationship_status, notes, sales_line_territory_id')
    .single();

  if (error) return { data: null, error: error.message, gate };
  return {
    data: {
      id: data.id,
      retailerId: data.retailer_id,
      salesLineId: data.sales_line_id,
      relationshipStatus: data.relationship_status as RelationshipStatus,
      notes: data.notes,
      salesLineTerritoryId: data.sales_line_territory_id,
    },
    error: null,
    gate,
  };
}

export async function updateRetailerLineAccountStatus(input: {
  lineAccountId: string;
  relationshipStatus: RelationshipStatus;
  convertedAt?: string | null;
  initialOrderDate?: string | null;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const patch: {
    relationship_status: RelationshipStatus;
    converted_at?: string | null;
    initial_order_date?: string | null;
    notes?: string | null;
  } = { relationship_status: input.relationshipStatus };
  if (input.convertedAt !== undefined) patch.converted_at = input.convertedAt;
  if (input.initialOrderDate !== undefined) patch.initial_order_date = input.initialOrderDate;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { error } = await supabase
    .from('retailer_line_accounts')
    .update(patch)
    .eq('id', input.lineAccountId);
  return { error: error?.message ?? null };
}

export async function updateRetailerLineAccountNotes(input: {
  lineAccountId: string;
  notes: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('retailer_line_accounts')
    .update({ notes: input.notes })
    .eq('id', input.lineAccountId);
  return { error: error?.message ?? null };
}

export async function upsertRetailerLineContact(input: {
  lineAccountId: string;
  accountContactId: string;
  role: AccountContactRole;
  isPrimary?: boolean;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('retailer_line_contacts').upsert(
    {
      retailer_line_account_id: input.lineAccountId,
      account_contact_id: input.accountContactId,
      role: input.role,
      is_primary: input.isPrimary ?? false,
      notes: input.notes ?? null,
    },
    { onConflict: 'retailer_line_account_id,account_contact_id' },
  );
  return { error: error?.message ?? null };
}
