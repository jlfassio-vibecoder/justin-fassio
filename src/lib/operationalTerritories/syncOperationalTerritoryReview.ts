import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isCanadianStoreCode,
  storeCodeToStateCode,
} from '@/lib/operationalTerritories/allowedOperationalTerritories';
import {
  fingerprintsEqual,
  locationFingerprintFromProspect,
  type LocationFingerprint,
} from '@/lib/operationalTerritories/locationFingerprint';
import {
  findLastLeftUnassignedResolution,
  resolveOperationalTerritoryReviewForProspect,
  upsertOperationalTerritoryReviewForProspect,
  type OpsReviewQueuePayload,
} from '@/lib/operationalTerritories/reviewQueue';
import { suggestOperationalTerritoryForAccount } from '@/lib/operationalTerritories/suggestOperationalTerritory';
import { supabase } from '@/lib/supabase';
import type { Prospect } from '@/lib/prospects';
import { mapProspectRow, PROSPECT_SELECT, type ProspectListRow } from '@/lib/prospects';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

const US_WEST_STORE_CODES = new Set(['ca', 'or', 'wa']);

export type SyncOperationalTerritoryReviewInput = {
  prospect: Prospect;
  locationChanged: boolean;
  /** When staff confirmed a non-null ops assignment in the same write, skip enqueue. */
  opsAssignedThisWrite?: boolean;
  client?: Client;
};

function isUsWestStore(storeCode: string | null | undefined): boolean {
  return US_WEST_STORE_CODES.has((storeCode ?? '').trim().toLowerCase());
}

function buildEnqueuePayload(
  prospect: Prospect,
  trigger: OpsReviewQueuePayload['trigger'],
  detailReason: string | null,
  fingerprint: LocationFingerprint,
): OpsReviewQueuePayload {
  const suggestion = suggestOperationalTerritoryForAccount({
    postalCode: prospect.postalCode,
    address: prospect.address,
    storeTerritoryCode: prospect.territoryCode,
  });
  const payload: OpsReviewQueuePayload = {
    trigger,
    detail_reason: detailReason,
    location_fingerprint: fingerprint,
  };
  if (suggestion.ok) {
    payload.suggested_territory_code = suggestion.territoryCode;
    payload.suggested_at = new Date().toISOString();
  }
  return payload;
}

async function shouldEnqueueForAssignedProspect(
  prospect: Prospect,
  locationChanged: boolean,
): Promise<{
  enqueue: boolean;
  trigger?: OpsReviewQueuePayload['trigger'];
  detailReason?: string | null;
}> {
  if (!locationChanged) {
    return { enqueue: false };
  }

  const suggestion = suggestOperationalTerritoryForAccount({
    postalCode: prospect.postalCode,
    address: prospect.address,
    storeTerritoryCode: prospect.territoryCode,
  });

  if (!suggestion.ok) {
    return {
      enqueue: true,
      trigger: 'location_changed_unresolved',
      detailReason: suggestion.reason,
    };
  }

  const assignedCode = (prospect.operationalTerritoryCode ?? '').trim().toLowerCase();
  if (assignedCode && suggestion.territoryCode !== assignedCode) {
    return {
      enqueue: true,
      trigger: 'location_mismatch',
      detailReason: `assigned:${assignedCode},suggested:${suggestion.territoryCode}`,
    };
  }

  return { enqueue: false };
}

async function shouldEnqueueForUnassignedProspect(
  prospect: Prospect,
  fingerprint: LocationFingerprint,
  locationChanged: boolean,
  client: Client,
): Promise<{
  enqueue: boolean;
  trigger?: OpsReviewQueuePayload['trigger'];
  detailReason?: string | null;
}> {
  const lastLeft = await findLastLeftUnassignedResolution(prospect.id, client);
  if (
    lastLeft &&
    !locationChanged &&
    fingerprintsEqual(fingerprint, lastLeft.locationFingerprint)
  ) {
    return { enqueue: false };
  }

  const suggestion = suggestOperationalTerritoryForAccount({
    postalCode: prospect.postalCode,
    address: prospect.address,
    storeTerritoryCode: prospect.territoryCode,
  });

  return {
    enqueue: true,
    trigger: 'missing_assignment',
    detailReason: suggestion.ok ? null : suggestion.reason,
  };
}

/**
 * Enqueue or refresh ops-territory review work after a prospect write.
 * Never assigns operational_territory_id. Failures are non-blocking for callers.
 */
export async function syncOperationalTerritoryReview(
  input: SyncOperationalTerritoryReviewInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = input.client ?? supabase;
  const { prospect, locationChanged, opsAssignedThisWrite } = input;
  const storeCode = prospect.territoryCode;
  const fingerprint = locationFingerprintFromProspect(prospect);

  if (isCanadianStoreCode(storeCode)) {
    const resolve = await resolveOperationalTerritoryReviewForProspect(
      prospect.id,
      { resolution: 'no_longer_applicable', resolvedBy: null },
      client,
    );
    if (!resolve.ok) return resolve;
    return { ok: true };
  }

  if (!isUsWestStore(storeCode) || !storeCodeToStateCode(storeCode)) {
    return { ok: true };
  }

  if (opsAssignedThisWrite) {
    return { ok: true };
  }

  const hasAssignment =
    prospect.operationalTerritoryId != null && prospect.operationalTerritoryId !== '';

  let decision: {
    enqueue: boolean;
    trigger?: OpsReviewQueuePayload['trigger'];
    detailReason?: string | null;
  };

  if (hasAssignment) {
    decision = await shouldEnqueueForAssignedProspect(prospect, locationChanged);
  } else {
    decision = await shouldEnqueueForUnassignedProspect(
      prospect,
      fingerprint,
      locationChanged,
      client,
    );
  }

  if (!decision.enqueue || !decision.trigger) {
    return { ok: true };
  }

  const payload = buildEnqueuePayload(
    prospect,
    decision.trigger,
    decision.detailReason ?? null,
    fingerprint,
  );

  const upserted = await upsertOperationalTerritoryReviewForProspect(prospect.id, payload, client);
  if (!upserted.ok) return upserted;
  return { ok: true };
}

export async function runOperationalTerritoryReviewSyncAfterWrite(
  client: Client,
  prospect: Prospect,
  options: { locationChanged: boolean; opsAssignedThisWrite?: boolean },
): Promise<string | null> {
  const sync = await syncOperationalTerritoryReview({
    prospect,
    locationChanged: options.locationChanged,
    opsAssignedThisWrite: options.opsAssignedThisWrite,
    client,
  });
  if (!sync.ok) {
    return `Operational territory review could not be updated: ${sync.error}`;
  }
  return null;
}

export const LOCATION_PROSPECT_PATCH_FIELDS = new Set(['postal_code', 'address', 'territory_id']);

export function prospectPatchTouchesLocation(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((key) => LOCATION_PROSPECT_PATCH_FIELDS.has(key));
}

export async function runOperationalTerritoryReviewSyncForProspectId(
  client: Client,
  prospectId: number,
  options: { locationChanged: boolean; opsAssignedThisWrite?: boolean },
): Promise<string | null> {
  const { data, error } = await client
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', prospectId)
    .maybeSingle();
  if (error || !data) {
    return error ? `Operational territory review could not be updated: ${error.message}` : null;
  }
  const prospect = mapProspectRow(data as ProspectListRow);
  return runOperationalTerritoryReviewSyncAfterWrite(client, prospect, options);
}
