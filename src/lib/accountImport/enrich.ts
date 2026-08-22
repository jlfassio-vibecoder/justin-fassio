import type { AgentSupabase } from '@/lib/agentAuth';
import { gateStaffAiContext } from '@/lib/aiLineContext';
import {
  cityStateAgrees,
  deriveBatchEnrichmentStatus,
  hasMultipleOfficialSites,
  isEnrichableBatchStatus,
  isGatewayRateLimitError,
  isStaleRunning,
  mergeProfileNotes,
  retailersNeedingJobs,
  type EnrichmentJobCounts,
  type EnrichmentSnapshot,
} from '@/lib/accountImport/enrichStatus';
import {
  inferFillBlankProspectFields,
  isBlankProspectValue,
  mergeFillBlankFields,
  type FillBlankAllowlistKey,
  type FillBlankEvidence,
  type FillBlankProspectFields,
} from '@/lib/fillBlankProspectFields';
import {
  mapProspectRow,
  PROSPECT_SELECT,
  type Prospect,
  type ProspectListRow,
} from '@/lib/prospects';
import {
  prospectPatchTouchesLocation,
  runOperationalTerritoryReviewSyncAfterWrite,
} from '@/lib/operationalTerritories/syncOperationalTerritoryReview';
import {
  insertRetailerFieldChanges,
  isVerifiedIdentityField,
  type RetailerFieldChangeInsert,
} from '@/lib/retailerFieldChanges';
import type {
  AccountEnrichmentJobStatus,
  AccountImportBatchStatus,
  Database,
  ProspectRow,
} from '@/types/database';

export {
  canResumeEnrich,
  canRetryFailedEnrich,
  cityStateAgrees,
  deriveBatchEnrichmentStatus,
  ENRICHABLE_BATCH_STATUSES,
  hasMultipleOfficialSites,
  isEnrichableBatchStatus,
  isGatewayRateLimitError,
  isStaleRunning,
  mergeProfileNotes,
  retailersNeedingJobs,
  STALE_RUNNING_MS,
} from '@/lib/accountImport/enrichStatus';
export type {
  EnrichmentJobCounts,
  EnrichmentSnapshot,
  EnrichmentSnapshotRow,
} from '@/lib/accountImport/enrichStatus';

type ProspectUpdate = Database['public']['Tables']['prospects']['Update'];
type EnrichmentJobRow = Database['public']['Tables']['account_enrichment_jobs']['Row'];

const ENRICHMENT_JOB_SELECT =
  'id, batch_id, retailer_id, retailer_line_account_id, mode, status, research_brief, evidence, provider, error, created_at, updated_at';

export const BULK_ENRICH_PROVIDER = 'openai/gpt-4o';
export const US_OGR_FILL_BLANK_PERSONA =
  'Extract public evidence for a US wholesale apparel retailer (Oregon/Washington). Do NOT invent scores, priority, grade, opening units, buyer identity, unpublished emails, or BC geography.';

const ELIGIBLE_ROW_STATUSES = ['imported', 'linked', 'updated'] as const;
const SKIP_BULK_FIELDS = new Set([
  'name',
  'region',
  'subterritory',
  'primaryDistrict',
  'fit',
  'fitScore',
  'priority',
  'provisionalGrade',
  'idealOpeningUnits',
  'nextAction',
]);

export type BulkFieldAction = 'apply' | 'pending';

export type BulkFieldDecision = {
  fieldPath: string;
  camel: string;
  oldValue: unknown;
  newValue: unknown;
  action: BulkFieldAction;
  confidence: 'high' | 'medium' | 'low';
};

type EnrichResult =
  { ok: true; snapshot: EnrichmentSnapshot } | { ok: false; error: string; status: number };

export function buildAiProfileNote(input: {
  evidence: FillBlankEvidence;
  brief: string | null;
  applied: BulkFieldDecision[];
  pending: BulkFieldDecision[];
  asOf: string;
}): string {
  const sourced: string[] = [];
  const inference: string[] = [];
  const unknown: string[] = [];
  const url = input.evidence.sourceUrls?.[0] ?? null;
  const cite = url || 'web research';
  for (const row of input.applied) {
    sourced.push(`- ${row.fieldPath}: ${String(row.newValue)} — ${cite} — ${input.asOf}`);
  }
  for (const row of input.pending) {
    inference.push(`- ${row.fieldPath} proposed as ${String(row.newValue)} (model inference)`);
  }
  if (input.evidence.directoryOnly) {
    inference.push('- Evidence is directory-only; treat store facts as unverified.');
  }
  if (!input.brief) unknown.push('- Public research brief was empty.');
  unknown.push('- Purchase dates, current buyer, unpublished email.');
  const parts: string[] = [];
  if (sourced.length > 0) parts.push(['Sourced', ...sourced].join('\n'));
  if (inference.length > 0) parts.push(['Inference', ...inference].join('\n'));
  parts.push(['Unknown', ...unknown].join('\n'));
  return parts.join('\n\n');
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function taxonomyEvidenced(evidence: FillBlankEvidence): boolean {
  const category = nonBlank(evidence.retailCategory);
  if (!category) return false;
  return category !== 'Other / needs review';
}

export function classifyBulkFillBlank(input: {
  current: Prospect;
  fields: FillBlankProspectFields;
  evidence: FillBlankEvidence;
  brief: string | null;
}): {
  applyPatch: Record<string, string | number | boolean | null>;
  applied: BulkFieldDecision[];
  pending: BulkFieldDecision[];
  cityStateAgrees: boolean;
  multipleOfficialSites: boolean;
} {
  const cityOk = cityStateAgrees({
    city: input.current.city,
    region: input.current.region,
    address: input.evidence.address,
    brief: input.brief,
  });
  const multiSite = hasMultipleOfficialSites(input.evidence.sourceUrls);
  const directoryOnly = input.evidence.directoryOnly === true;
  const highWeb = Boolean(
    nonBlank(input.evidence.officialWebsite) &&
    input.evidence.operatingConfirmed &&
    !directoryOnly &&
    cityOk,
  );
  const highPhone = Boolean(
    nonBlank(input.evidence.phone) && input.evidence.operatingConfirmed && !directoryOnly && cityOk,
  );
  const highTaxonomy = taxonomyEvidenced(input.evidence) && !directoryOnly && cityOk && !multiSite;

  const fieldMeta: Array<{
    camel: FillBlankAllowlistKey;
    fieldPath: string;
    high: boolean;
  }> = [
    { camel: 'website', fieldPath: 'website', high: highWeb },
    { camel: 'phone', fieldPath: 'phone', high: highPhone },
    { camel: 'category', fieldPath: 'category', high: highTaxonomy },
    { camel: 'retailCategory', fieldPath: 'retail_category', high: highTaxonomy },
    { camel: 'apparelCapability', fieldPath: 'apparel_capability', high: highTaxonomy },
    { camel: 'verificationStatus', fieldPath: 'verification_status', high: highWeb },
    { camel: 'address', fieldPath: 'address', high: false },
    { camel: 'city', fieldPath: 'city', high: false },
  ];
  const merged = mergeFillBlankFields(input.current, input.fields);
  const filled = new Set(merged.filledKeys);
  const applied: BulkFieldDecision[] = [];
  const pending: BulkFieldDecision[] = [];
  const applyPatch: Record<string, string | number | boolean | null> = {};

  for (const meta of fieldMeta) {
    if (SKIP_BULK_FIELDS.has(meta.camel)) continue;
    const proposedRaw = input.fields[meta.camel];
    const proposed = typeof proposedRaw === 'string' ? nonBlank(proposedRaw) : proposedRaw;
    if (proposed == null || proposed === '') continue;
    const currentVal = input.current[meta.camel as keyof Prospect];
    if (!filled.has(meta.camel)) {
      if (isBlankProspectValue(meta.camel, currentVal)) continue;
      if (String(currentVal ?? '') === String(proposed)) continue;
      pending.push({
        fieldPath: meta.fieldPath,
        camel: meta.camel,
        oldValue: currentVal ?? null,
        newValue: proposed,
        action: 'pending',
        confidence:
          input.current.importProtected && isVerifiedIdentityField(meta.fieldPath)
            ? 'low'
            : 'medium',
      });
      continue;
    }
    if (meta.high) {
      const fromMerge = merged.dbPatch[meta.fieldPath];
      const appliedValue =
        fromMerge !== undefined
          ? fromMerge
          : typeof proposed === 'string' || typeof proposed === 'number'
            ? proposed
            : null;
      applyPatch[meta.fieldPath] = appliedValue;
      applied.push({
        fieldPath: meta.fieldPath,
        camel: meta.camel,
        oldValue: currentVal ?? null,
        newValue: proposed,
        action: 'apply',
        confidence: 'high',
      });
      continue;
    }
    pending.push({
      fieldPath: meta.fieldPath,
      camel: meta.camel,
      oldValue: currentVal ?? null,
      newValue: proposed,
      action: 'pending',
      confidence: directoryOnly || !cityOk ? 'low' : 'medium',
    });
  }

  return {
    applyPatch,
    applied,
    pending,
    cityStateAgrees: cityOk,
    multipleOfficialSites: multiSite,
  };
}

function countJobs(
  rows: Array<{ status: string }>,
): Omit<EnrichmentJobCounts, 'pendingFieldChanges'> {
  const counts = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: rows.length,
  };
  for (const row of rows) {
    if (row.status === 'queued') counts.queued += 1;
    else if (row.status === 'running') counts.running += 1;
    else if (row.status === 'completed') counts.completed += 1;
    else if (row.status === 'failed') counts.failed += 1;
    else if (row.status === 'cancelled') counts.cancelled += 1;
  }
  return counts;
}

async function loadBatch(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string },
): Promise<
  { ok: true; status: AccountImportBatchStatus } | { ok: false; error: string; status: number }
> {
  const { data, error } = await supabase
    .from('account_import_batches')
    .select('id, status')
    .eq('id', input.batchId)
    .eq('sales_line_id', input.salesLineId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: 'Batch not found', status: 404 };
  return { ok: true, status: data.status };
}

async function loadJobs(
  supabase: AgentSupabase,
  batchId: string,
): Promise<{ ok: true; rows: EnrichmentJobRow[] } | { ok: false; error: string; status: number }> {
  const { data, error } = await supabase
    .from('account_enrichment_jobs')
    .select(ENRICHMENT_JOB_SELECT)
    .eq('batch_id', batchId)
    .eq('mode', 'fill-blanks')
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, rows: (data ?? []) as EnrichmentJobRow[] };
}

async function countPendingChanges(supabase: AgentSupabase, jobIds: string[]): Promise<number> {
  if (jobIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('retailer_field_changes')
    .select('id', { count: 'exact', head: true })
    .in('enrichment_job_id', jobIds)
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
}

async function setBatchStatus(
  supabase: AgentSupabase,
  batchId: string,
  jobs: Array<{ status: string }>,
): Promise<AccountImportBatchStatus | null> {
  const next = deriveBatchEnrichmentStatus(jobs);
  if (!next) return null;
  const { error } = await supabase
    .from('account_import_batches')
    .update({ status: next })
    .eq('id', batchId);
  if (error) return next;
  return next;
}

export async function getEnrichmentSnapshot(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string; pauseReason?: 'rate_limit' | null },
): Promise<EnrichResult> {
  const batch = await loadBatch(supabase, input);
  if (!batch.ok) return batch;
  const jobs = await loadJobs(supabase, input.batchId);
  if (!jobs.ok) return jobs;
  const counts = countJobs(jobs.rows);
  const pendingFieldChanges = await countPendingChanges(
    supabase,
    jobs.rows.map((row) => row.id),
  );
  const derived = deriveBatchEnrichmentStatus(jobs.rows);
  return {
    ok: true,
    snapshot: {
      batchId: input.batchId,
      batchStatus: derived ?? batch.status,
      jobs: { ...counts, pendingFieldChanges },
      rows: jobs.rows.map((row) => ({
        id: row.id,
        retailerId: row.retailer_id,
        status: row.status,
        error: row.error,
      })),
      pauseReason: input.pauseReason ?? null,
    },
  };
}

async function resetStaleRunningJobs(
  supabase: AgentSupabase,
  batchId: string,
  now = Date.now(),
): Promise<void> {
  const jobs = await loadJobs(supabase, batchId);
  if (!jobs.ok) return;
  const staleIds = jobs.rows
    .filter((row) => row.status === 'running' && isStaleRunning(row.updated_at, now))
    .map((row) => row.id);
  if (staleIds.length === 0) return;
  await supabase
    .from('account_enrichment_jobs')
    .update({ status: 'queued', error: 'Reset after stale running job' })
    .in('id', staleIds)
    .eq('status', 'running');
}

async function loadEligibleImportRows(
  supabase: AgentSupabase,
  batchId: string,
): Promise<
  | {
      ok: true;
      rows: Array<{ retailerId: number; retailerLineAccountId: string }>;
    }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await supabase
    .from('account_import_rows')
    .select('retailer_id, retailer_line_account_id, status')
    .eq('batch_id', batchId)
    .in('status', [...ELIGIBLE_ROW_STATUSES]);
  if (error) return { ok: false, error: error.message, status: 500 };
  const rows: Array<{ retailerId: number; retailerLineAccountId: string }> = [];
  const seen = new Set<number>();
  for (const row of data ?? []) {
    if (row.retailer_id == null || !row.retailer_line_account_id) continue;
    if (seen.has(row.retailer_id)) continue;
    seen.add(row.retailer_id);
    rows.push({
      retailerId: row.retailer_id,
      retailerLineAccountId: row.retailer_line_account_id,
    });
  }
  return { ok: true, rows };
}

export async function startBatchEnrichment(
  supabase: AgentSupabase,
  _userId: string,
  input: {
    salesLineId: string;
    batchId: string;
    retailerIds?: number[];
    failedOnly?: boolean;
  },
): Promise<EnrichResult> {
  const batch = await loadBatch(supabase, input);
  if (!batch.ok) return batch;
  if (!isEnrichableBatchStatus(batch.status)) {
    return { ok: false, error: 'Batch is not ready for enrichment', status: 400 };
  }
  await resetStaleRunningJobs(supabase, input.batchId);

  if (input.failedOnly) {
    let query = supabase
      .from('account_enrichment_jobs')
      .update({ status: 'queued', error: null })
      .eq('batch_id', input.batchId)
      .eq('mode', 'fill-blanks')
      .eq('status', 'failed');
    if (input.retailerIds && input.retailerIds.length > 0) {
      query = query.in('retailer_id', input.retailerIds);
    }
    const { error } = await query;
    if (error) return { ok: false, error: error.message, status: 500 };
    const jobs = await loadJobs(supabase, input.batchId);
    if (!jobs.ok) return jobs;
    await setBatchStatus(supabase, input.batchId, jobs.rows);
    return getEnrichmentSnapshot(supabase, input);
  }

  const eligible = await loadEligibleImportRows(supabase, input.batchId);
  if (!eligible.ok) return eligible;
  const selected =
    input.retailerIds && input.retailerIds.length > 0
      ? eligible.rows.filter((row) => input.retailerIds?.includes(row.retailerId))
      : eligible.rows;
  const existing = await loadJobs(supabase, input.batchId);
  if (!existing.ok) return existing;
  const existingIds = existing.rows
    .filter((row) => row.status !== 'cancelled')
    .map((row) => row.retailer_id);
  const needed = retailersNeedingJobs(
    selected.map((row) => row.retailerId),
    existingIds,
  );
  const byRetailer = new Map(selected.map((row) => [row.retailerId, row]));
  const inserts = needed.map((retailerId) => {
    const row = byRetailer.get(retailerId);
    return {
      batch_id: input.batchId,
      retailer_id: retailerId,
      retailer_line_account_id: row?.retailerLineAccountId ?? null,
      mode: 'fill-blanks' as const,
      status: 'queued' as const,
    };
  });
  if (inserts.length > 0) {
    const { error } = await supabase.from('account_enrichment_jobs').insert(inserts);
    if (error && !/duplicate key|unique constraint/i.test(error.message)) {
      return { ok: false, error: error.message, status: 500 };
    }
  }
  const jobs = await loadJobs(supabase, input.batchId);
  if (!jobs.ok) return jobs;
  if (jobs.rows.length === 0) {
    return { ok: false, error: 'No imported retailers to enrich', status: 400 };
  }
  await setBatchStatus(supabase, input.batchId, jobs.rows);
  return getEnrichmentSnapshot(supabase, input);
}

export async function retryFailedEnrichment(
  supabase: AgentSupabase,
  userId: string,
  input: { salesLineId: string; batchId: string },
): Promise<EnrichResult> {
  return startBatchEnrichment(supabase, userId, { ...input, failedOnly: true });
}

export async function cancelRemainingEnrichment(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string },
): Promise<EnrichResult> {
  const batch = await loadBatch(supabase, input);
  if (!batch.ok) return batch;
  const { error } = await supabase
    .from('account_enrichment_jobs')
    .update({ status: 'cancelled' })
    .eq('batch_id', input.batchId)
    .eq('mode', 'fill-blanks')
    .in('status', ['queued', 'running']);
  if (error) return { ok: false, error: error.message, status: 500 };
  const jobs = await loadJobs(supabase, input.batchId);
  if (!jobs.ok) return jobs;
  await setBatchStatus(supabase, input.batchId, jobs.rows);
  return getEnrichmentSnapshot(supabase, input);
}

async function persistJobFields(
  supabase: AgentSupabase,
  jobId: string,
  patch: {
    status?: AccountEnrichmentJobStatus;
    research_brief?: string | null;
    evidence?: unknown;
    provider?: string | null;
    error?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('account_enrichment_jobs').update(patch).eq('id', jobId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function runClaimedJob(
  supabase: AgentSupabase,
  userId: string,
  input: { salesLineId: string; batchId: string; job: EnrichmentJobRow },
): Promise<{ pauseReason?: 'rate_limit' | null; error?: string }> {
  const line = await supabase
    .from('lines')
    .select('id, code')
    .eq('id', input.salesLineId)
    .maybeSingle();
  if (line.error || !line.data) {
    await persistJobFields(supabase, input.job.id, {
      status: 'failed',
      error: line.error?.message ?? 'Unknown sales line',
      provider: BULK_ENRICH_PROVIDER,
    });
    return {};
  }

  const gated = await gateStaffAiContext({
    client: supabase,
    salesLineId: input.salesLineId,
    retailerLineAccountId: input.job.retailer_line_account_id,
    prospectId: input.job.retailer_id,
    kind: 'account',
  });
  if (!gated.ok) {
    await persistJobFields(supabase, input.job.id, {
      status: 'failed',
      error: gated.error,
      provider: BULK_ENRICH_PROVIDER,
    });
    return {};
  }

  const prospectResult = await supabase
    .from('prospects')
    .select(PROSPECT_SELECT)
    .eq('id', input.job.retailer_id)
    .maybeSingle();
  if (prospectResult.error || !prospectResult.data) {
    await persistJobFields(supabase, input.job.id, {
      status: 'failed',
      error: prospectResult.error?.message ?? 'Retailer not found',
      provider: BULK_ENRICH_PROVIDER,
    });
    return {};
  }
  const current = mapProspectRow(prospectResult.data as ProspectListRow);

  const inferred = await inferFillBlankProspectFields({
    current,
    lineCode: gated.ctx?.code ?? line.data.code,
    aiPersona: gated.ctx?.aiProfile.persona || US_OGR_FILL_BLANK_PERSONA,
    skipFitScoring: true,
  });
  if (!inferred.ok) {
    if (isGatewayRateLimitError(inferred.error)) {
      await persistJobFields(supabase, input.job.id, {
        status: 'queued',
        error: inferred.error,
        provider: BULK_ENRICH_PROVIDER,
      });
      return { pauseReason: 'rate_limit' };
    }
    await persistJobFields(supabase, input.job.id, {
      status: 'failed',
      error: inferred.error,
      provider: BULK_ENRICH_PROVIDER,
    });
    return {};
  }

  const classified = classifyBulkFillBlank({
    current,
    fields: inferred.fields,
    evidence: inferred.evidence,
    brief: inferred.researchBrief,
  });
  const evidencePayload = {
    ...inferred.evidence,
    cityStateAgrees: classified.cityStateAgrees,
    multipleOfficialSites: classified.multipleOfficialSites,
    appliedFieldPaths: classified.applied.map((row) => row.fieldPath),
    pendingFieldPaths: classified.pending.map((row) => row.fieldPath),
  };
  const briefPersist = await persistJobFields(supabase, input.job.id, {
    research_brief: inferred.researchBrief,
    evidence: evidencePayload,
    provider: BULK_ENRICH_PROVIDER,
  });
  if (!briefPersist.ok) {
    await persistJobFields(supabase, input.job.id, {
      status: 'failed',
      error: briefPersist.error,
    });
    return { error: briefPersist.error };
  }

  const { data: latest, error: latestError } = await supabase
    .from('account_enrichment_jobs')
    .select('status')
    .eq('id', input.job.id)
    .maybeSingle();
  if (latestError) {
    await persistJobFields(supabase, input.job.id, {
      status: 'failed',
      error: latestError.message,
    });
    return {};
  }
  if (latest?.status === 'cancelled') {
    return {};
  }
  if (!inferred.researchBrief?.trim()) {
    await persistJobFields(supabase, input.job.id, {
      status: 'failed',
      error: 'Web research returned empty brief',
    });
    return {};
  }

  if (Object.keys(classified.applyPatch).length > 0) {
    const { error: updateError } = await supabase
      .from('prospects')
      .update(classified.applyPatch as ProspectUpdate)
      .eq('id', input.job.retailer_id);
    if (updateError) {
      await persistJobFields(supabase, input.job.id, {
        status: 'failed',
        error: updateError.message,
      });
      return {};
    }
    if (prospectPatchTouchesLocation(classified.applyPatch as Record<string, unknown>)) {
      const { data: refreshed } = await supabase
        .from('prospects')
        .select(PROSPECT_SELECT)
        .eq('id', input.job.retailer_id)
        .maybeSingle();
      if (refreshed) {
        await runOperationalTerritoryReviewSyncAfterWrite(
          supabase,
          mapProspectRow(refreshed as ProspectListRow),
          { locationChanged: true },
        );
      }
    }
  }

  const changeRows: RetailerFieldChangeInsert[] = [
    ...classified.applied,
    ...classified.pending,
  ].map((row) => ({
    retailerId: input.job.retailer_id,
    fieldPath: row.fieldPath,
    oldValue: row.oldValue,
    newValue: row.newValue,
    source: 'ai',
    actorId: userId,
    salesLineId: input.salesLineId,
    retailerLineAccountId: input.job.retailer_line_account_id,
    status: row.action === 'apply' ? 'applied' : 'pending',
    confidence: row.confidence,
    provider: BULK_ENRICH_PROVIDER,
    sourceUrls: inferred.evidence.sourceUrls ?? [],
    enrichmentJobId: input.job.id,
  }));
  const changes = await insertRetailerFieldChanges(supabase, changeRows);
  if (!changes.ok) {
    await persistJobFields(supabase, input.job.id, { status: 'failed', error: changes.error });
    return {};
  }

  const note = buildAiProfileNote({
    evidence: inferred.evidence,
    brief: inferred.researchBrief,
    applied: classified.applied,
    pending: classified.pending,
    asOf: new Date().toISOString().slice(0, 10),
  });
  if (input.job.retailer_line_account_id) {
    const { data: rla } = await supabase
      .from('retailer_line_accounts')
      .select('id, notes')
      .eq('id', input.job.retailer_line_account_id)
      .maybeSingle();
    if (rla) {
      await supabase
        .from('retailer_line_accounts')
        .update({ notes: mergeProfileNotes(rla.notes, note) })
        .eq('id', rla.id);
    }
  }
  if ((gated.ctx?.code ?? line.data.code) === 'ogr') {
    const row = prospectResult.data as ProspectRow;
    await supabase
      .from('prospects')
      .update({ notes: mergeProfileNotes(row.notes, note) })
      .eq('id', input.job.retailer_id);
  }

  await persistJobFields(supabase, input.job.id, {
    status: 'completed',
    error: null,
    research_brief: inferred.researchBrief,
    evidence: evidencePayload,
    provider: BULK_ENRICH_PROVIDER,
  });
  return {};
}

export async function processNextEnrichmentJob(
  supabase: AgentSupabase,
  userId: string,
  input: { salesLineId: string; batchId: string },
): Promise<EnrichResult> {
  const batch = await loadBatch(supabase, input);
  if (!batch.ok) return batch;
  await resetStaleRunningJobs(supabase, input.batchId);

  const currentJobs = await loadJobs(supabase, input.batchId);
  if (!currentJobs.ok) return currentJobs;
  if (currentJobs.rows.some((row) => row.status === 'running')) {
    return getEnrichmentSnapshot(supabase, input);
  }

  const next = currentJobs.rows.find((row) => row.status === 'queued');
  if (!next) {
    await setBatchStatus(supabase, input.batchId, currentJobs.rows);
    return getEnrichmentSnapshot(supabase, input);
  }

  const { data: claimed, error: claimError } = await supabase
    .from('account_enrichment_jobs')
    .update({ status: 'running', error: null })
    .eq('id', next.id)
    .eq('status', 'queued')
    .select(ENRICHMENT_JOB_SELECT)
    .maybeSingle();
  if (claimError) return { ok: false, error: claimError.message, status: 500 };
  if (!claimed) return getEnrichmentSnapshot(supabase, input);

  const ran = await runClaimedJob(supabase, userId, {
    salesLineId: input.salesLineId,
    batchId: input.batchId,
    job: claimed as EnrichmentJobRow,
  });
  const after = await loadJobs(supabase, input.batchId);
  if (after.ok) await setBatchStatus(supabase, input.batchId, after.rows);
  return getEnrichmentSnapshot(supabase, {
    ...input,
    pauseReason: ran.pauseReason ?? null,
  });
}
