import type { AgentSupabase } from '@/lib/agentAuth';
import { fetchOperationalTerritories } from '@/lib/operationalTerritories/fetchOperationalTerritories';
import { locationFingerprintFromProspect } from '@/lib/operationalTerritories/locationFingerprint';
import {
  countUnresolvedOperationalTerritoryReviews,
  fetchUnresolvedOperationalTerritoryReviews,
  resolveOperationalTerritoryReviewForProspect,
  type UnresolvedOpsReviewRow,
} from '@/lib/operationalTerritories/reviewQueue';
import type { OpsReviewListItem } from '@/lib/operationalTerritories/reviewHttp';
import { suggestOperationalTerritoryForAccount } from '@/lib/operationalTerritories/suggestOperationalTerritory';
import {
  draftFromProspect,
  updateProspectAccountDetails,
} from '@/lib/updateProspectAccountDetails';
import { mapProspectRow, PROSPECT_SELECT, type ProspectListRow } from '@/lib/prospects';

function liveSuggestionForRow(row: UnresolvedOpsReviewRow) {
  return suggestOperationalTerritoryForAccount({
    postalCode: row.prospect.postalCode,
    address: row.prospect.address,
    storeTerritoryCode: row.prospect.territoryCode,
  });
}

export async function listOperationalTerritoryReviews(
  supabase: AgentSupabase,
): Promise<{ ok: true; items: OpsReviewListItem[] } | { ok: false; error: string }> {
  const result = await fetchUnresolvedOperationalTerritoryReviews(supabase);
  if (!result.ok) return result;
  return {
    ok: true,
    items: result.rows.map((row) => ({
      ...row,
      currentSuggestion: liveSuggestionForRow(row),
    })),
  };
}

export async function getOperationalTerritoryReviewCount(
  supabase: AgentSupabase,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  return countUnresolvedOperationalTerritoryReviews(supabase);
}

async function loadProspectById(supabase: AgentSupabase, prospectId: number) {
  const { data, error } = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', prospectId)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: 'Prospect not found' };
  return { ok: true as const, prospect: mapProspectRow(data as ProspectListRow) };
}

export async function applyOperationalTerritorySuggestion(
  supabase: AgentSupabase,
  prospectId: number,
  actorId: string,
): Promise<
  | {
      ok: true;
      prospect: ReturnType<typeof mapProspectRow>;
      auditWarning: string | null;
      reviewWarning: string | null;
    }
  | { ok: false; error: string; status: number }
> {
  const loaded = await loadProspectById(supabase, prospectId);
  if (!loaded.ok) return { ok: false, error: loaded.error, status: 404 };

  const suggestion = suggestOperationalTerritoryForAccount({
    postalCode: loaded.prospect.postalCode,
    address: loaded.prospect.address,
    storeTerritoryCode: loaded.prospect.territoryCode,
  });
  if (!suggestion.ok) {
    return { ok: false, error: `Suggestion unavailable: ${suggestion.reason}`, status: 409 };
  }

  const opsTerritoriesResult = await fetchOperationalTerritories(supabase);
  if (opsTerritoriesResult.error) {
    return { ok: false, error: opsTerritoriesResult.error, status: 500 };
  }
  const opsTerritories = opsTerritoriesResult.data;
  const match = opsTerritories.find((row) => row.code === suggestion.territoryCode);
  if (!match) {
    return { ok: false, error: 'Suggested territory is not active', status: 409 };
  }

  const draft = draftFromProspect(loaded.prospect);
  draft.operationalTerritoryId = match.id;

  const saved = await updateProspectAccountDetails(loaded.prospect, draft, {
    storeTerritoryCode: loaded.prospect.territoryCode,
    operationalTerritories: opsTerritories,
    actorId,
    client: supabase,
  });
  if (!saved.ok) return { ok: false, error: saved.error, status: 400 };
  return {
    ok: true,
    prospect: saved.data,
    auditWarning: saved.auditWarning,
    reviewWarning: saved.reviewWarning,
  };
}

export async function assignOperationalTerritory(
  supabase: AgentSupabase,
  prospectId: number,
  operationalTerritoryId: string,
  actorId: string,
): Promise<
  | {
      ok: true;
      prospect: ReturnType<typeof mapProspectRow>;
      auditWarning: string | null;
      reviewWarning: string | null;
    }
  | { ok: false; error: string; status: number }
> {
  const loaded = await loadProspectById(supabase, prospectId);
  if (!loaded.ok) return { ok: false, error: loaded.error, status: 404 };

  const opsTerritoriesResult = await fetchOperationalTerritories(supabase);
  if (opsTerritoriesResult.error) {
    return { ok: false, error: opsTerritoriesResult.error, status: 500 };
  }
  const draft = draftFromProspect(loaded.prospect);
  draft.operationalTerritoryId = operationalTerritoryId;

  const saved = await updateProspectAccountDetails(loaded.prospect, draft, {
    storeTerritoryCode: loaded.prospect.territoryCode,
    operationalTerritories: opsTerritoriesResult.data,
    actorId,
    client: supabase,
  });
  if (!saved.ok) return { ok: false, error: saved.error, status: 400 };
  return {
    ok: true,
    prospect: saved.data,
    auditWarning: saved.auditWarning,
    reviewWarning: saved.reviewWarning,
  };
}

export async function leaveOperationalTerritoryUnassigned(
  supabase: AgentSupabase,
  prospectId: number,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const loaded = await loadProspectById(supabase, prospectId);
  if (!loaded.ok) return { ok: false, error: loaded.error, status: 404 };

  const fingerprint = locationFingerprintFromProspect(loaded.prospect);
  const resolved = await resolveOperationalTerritoryReviewForProspect(
    prospectId,
    {
      resolution: 'left_unassigned',
      resolvedBy: actorId,
      payloadPatch: { location_fingerprint: fingerprint },
    },
    supabase,
  );
  if (!resolved.ok) return { ok: false, error: resolved.error, status: 500 };
  return { ok: true };
}

/**
 * Apply ZIP/address suggestions for store-geo prospects missing operational_territory_id.
 * Uses the same suggest → updateProspectAccountDetails path as single apply (no silent SQL).
 * Caps each request so the staff route stays within maxDuration; call again for remaining rows.
 */
export const OPS_APPLY_RESOLVABLE_BATCH_MAX = 100;

export async function applyResolvableOperationalTerritorySuggestionsForStore(
  supabase: AgentSupabase,
  storeTerritoryCode: string,
  actorId: string,
  limit = OPS_APPLY_RESOLVABLE_BATCH_MAX,
): Promise<
  | {
      ok: true;
      applied: number;
      skipped: number;
      failures: Array<{ prospectId: number; error: string }>;
      truncated: boolean;
    }
  | { ok: false; error: string }
> {
  const code = storeTerritoryCode.trim().toLowerCase();
  if (code !== 'or' && code !== 'wa' && code !== 'ca') {
    return { ok: false, error: 'storeTerritoryCode must be "or", "wa", or "ca"' };
  }

  const batchLimit = Math.max(1, Math.min(Math.floor(limit), OPS_APPLY_RESOLVABLE_BATCH_MAX));

  const { data: storeTerr, error: terrError } = await supabase
    .from('territories')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (terrError) return { ok: false, error: terrError.message };
  if (!storeTerr) return { ok: false, error: `Store territory ${code} not found` };

  const { data: rows, error } = await supabase
    .from('prospects')
    .select('id')
    .eq('territory_id', storeTerr.id)
    .is('operational_territory_id', null)
    .order('id', { ascending: true })
    .limit(batchLimit + 1);
  if (error) return { ok: false, error: error.message };

  const truncated = (rows?.length ?? 0) > batchLimit;
  const batch = truncated ? (rows ?? []).slice(0, batchLimit) : (rows ?? []);

  let applied = 0;
  let skipped = 0;
  const failures: Array<{ prospectId: number; error: string }> = [];

  for (const row of batch) {
    const result = await applyOperationalTerritorySuggestion(supabase, row.id, actorId);
    if (!result.ok) {
      if (result.status === 409) {
        skipped += 1;
        continue;
      }
      failures.push({ prospectId: row.id, error: result.error });
      continue;
    }
    applied += 1;
  }

  return { ok: true, applied, skipped, failures, truncated };
}
