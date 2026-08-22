import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { mapProspectRow, PROSPECT_SELECT, type ProspectListRow } from '@/lib/prospects';
import type { Database, OperationalTerritoryReviewResolution } from '@/types/database';
import {
  parseLocationFingerprintFromPayload,
  type LocationFingerprint,
} from '@/lib/operationalTerritories/locationFingerprint';

type Client = SupabaseClient<Database>;

export const OPS_REVIEW_CANONICAL_REASON = 'needs_operational_territory';

export type OpsReviewQueuePayload = {
  trigger: 'missing_assignment' | 'location_changed_unresolved' | 'location_mismatch' | 'backfill';
  detail_reason?: string | null;
  location_fingerprint: LocationFingerprint;
  suggested_territory_code?: string;
  suggested_at?: string;
};

export type ResolveOperationalTerritoryReviewOptions = {
  resolution: OperationalTerritoryReviewResolution;
  resolvedBy?: string | null;
  payloadPatch?: Record<string, unknown>;
};

/**
 * Resolve outstanding ops-territory review rows for a prospect.
 * Call after staff confirms assignment (`assigned`) or explicit leave-unassigned.
 * BC/AB auto-close uses `no_longer_applicable` with null resolvedBy.
 */
export async function resolveOperationalTerritoryReviewForProspect(
  prospectId: number,
  options: ResolveOperationalTerritoryReviewOptions,
  client: Client = supabase,
): Promise<{ ok: true; resolved: number } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data: openRows, error: fetchError } = await client
    .from('operational_territory_review_queue')
    .select('id, payload')
    .eq('entity_type', 'prospect')
    .eq('entity_id', String(prospectId))
    .is('resolved_at', null);

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }
  if (!openRows?.length) {
    return { ok: true, resolved: 0 };
  }

  let resolved = 0;
  for (const row of openRows) {
    const mergedPayload = {
      ...(typeof row.payload === 'object' && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : {}),
      ...(options.payloadPatch ?? {}),
    };
    const { error } = await client
      .from('operational_territory_review_queue')
      .update({
        resolved_at: now,
        resolution: options.resolution,
        resolved_by: options.resolvedBy ?? null,
        payload: mergedPayload,
        updated_at: now,
      })
      .eq('id', row.id);

    if (error) {
      return { ok: false, error: error.message };
    }
    resolved += 1;
  }
  return { ok: true, resolved };
}

export async function upsertOperationalTerritoryReviewForProspect(
  prospectId: number,
  payload: OpsReviewQueuePayload,
  client: Client = supabase,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await client.rpc('upsert_operational_territory_review', {
    p_entity_id: String(prospectId),
    p_reason: OPS_REVIEW_CANONICAL_REASON,
    p_payload: payload as Record<string, unknown>,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Upsert returned no id' };
  }
  return { ok: true, id: data };
}

export async function findLastLeftUnassignedResolution(
  prospectId: number,
  client: Client = supabase,
): Promise<{ locationFingerprint: LocationFingerprint; resolvedAt: string } | null> {
  const { data, error } = await client
    .from('operational_territory_review_queue')
    .select('payload, resolved_at')
    .eq('entity_type', 'prospect')
    .eq('entity_id', String(prospectId))
    .eq('resolution', 'left_unassigned')
    .not('resolved_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.resolved_at) return null;
  const fp = parseLocationFingerprintFromPayload(data.payload as Record<string, unknown> | null);
  if (!fp) return null;
  return { locationFingerprint: fp, resolvedAt: data.resolved_at };
}

export async function countUnresolvedOperationalTerritoryReviews(
  client: Client = supabase,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { count, error } = await client
    .from('operational_territory_review_queue')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', 'prospect')
    .is('resolved_at', null);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, count: count ?? 0 };
}

export type UnresolvedOpsReviewRow = {
  id: string;
  entityId: string;
  reason: string;
  payload: OpsReviewQueuePayload;
  createdAt: string;
  updatedAt: string;
  prospect: {
    id: number;
    name: string;
    city: string | null;
    postalCode: string | null;
    address: string | null;
    territoryCode: string | null;
    territoryName: string | null;
    operationalTerritoryId: string | null;
    operationalTerritoryCode: string | null;
    operationalTerritoryName: string | null;
  };
};

export async function fetchUnresolvedOperationalTerritoryReviews(
  client: Client = supabase,
): Promise<{ ok: true; rows: UnresolvedOpsReviewRow[] } | { ok: false; error: string }> {
  const { data: queueRows, error } = await client
    .from('operational_territory_review_queue')
    .select('id, entity_id, reason, payload, created_at, updated_at')
    .eq('entity_type', 'prospect')
    .is('resolved_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!queueRows?.length) {
    return { ok: true, rows: [] };
  }

  const prospectIds = queueRows
    .map((row) => Number.parseInt(row.entity_id, 10))
    .filter((id) => Number.isFinite(id));

  const { data: prospectRows, error: prospectError } = await client
    .from('prospects')
    .select(PROSPECT_SELECT)
    .in('id', prospectIds);

  if (prospectError) {
    return { ok: false, error: prospectError.message };
  }

  const prospectById = new Map(
    (prospectRows ?? []).map((row) => {
      const prospect = mapProspectRow(row as ProspectListRow);
      return [prospect.id, prospect] as const;
    }),
  );

  const rows: UnresolvedOpsReviewRow[] = [];
  for (const row of queueRows) {
    const prospectId = Number.parseInt(row.entity_id, 10);
    const prospect = prospectById.get(prospectId);
    if (!prospect) continue;
    rows.push({
      id: row.id,
      entityId: row.entity_id,
      reason: row.reason,
      payload: row.payload as OpsReviewQueuePayload,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      prospect: {
        id: prospect.id,
        name: prospect.name,
        city: prospect.city,
        postalCode: prospect.postalCode,
        address: prospect.address,
        territoryCode: prospect.territoryCode,
        territoryName: prospect.territoryName,
        operationalTerritoryId: prospect.operationalTerritoryId,
        operationalTerritoryCode: prospect.operationalTerritoryCode,
        operationalTerritoryName: prospect.operationalTerritoryName,
      },
    });
  }

  return { ok: true, rows };
}

export async function hasOpenOperationalTerritoryReview(
  prospectId: number,
  client: Client = supabase,
): Promise<boolean> {
  const { count, error } = await client
    .from('operational_territory_review_queue')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', 'prospect')
    .eq('entity_id', String(prospectId))
    .is('resolved_at', null);

  if (error) return false;
  return (count ?? 0) > 0;
}
