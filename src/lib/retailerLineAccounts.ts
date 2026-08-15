/**
 * Phase 2 line-scoped directory reads + cross-line badge helper.
 * Writes remain on legacy prospects / account_contacts (1C-protected).
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
import type { RelationshipStatus } from '@/types/database';

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
  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .select('relationship_status, sales_line_id, lines!inner(code, name)')
    .eq('retailer_id', input.retailerId)
    .neq('sales_line_id', input.currentSalesLineId)
    .neq('relationship_status', 'terminated');

  if (error) {
    return { data: [], error: error.message };
  }

  const badges: CrossLineBadge[] = [];
  for (const row of data ?? []) {
    const line = row.lines as unknown as { code: string; name: string } | null;
    if (!line?.code || !line?.name) continue;
    badges.push({
      lineCode: line.code,
      lineName: line.name,
      relationshipStatus: row.relationship_status as RelationshipStatus,
    });
  }
  return { data: badges, error: null };
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
