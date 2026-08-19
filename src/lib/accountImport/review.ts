import type { AgentSupabase } from '@/lib/agentAuth';
import {
  classifyApplyDecision,
  emptyReviewSnapshot,
  groupReviewRows,
  type ReviewSnapshot,
} from '@/lib/accountImport/reviewStatus';
import type { Database } from '@/types/database';

type ProspectPatch = Database['public']['Tables']['prospects']['Update'];
type FieldChangeRow = Database['public']['Tables']['retailer_field_changes']['Row'];
type EnrichmentJobRow = Database['public']['Tables']['account_enrichment_jobs']['Row'];

type ReviewResult =
  | { ok: true; review: ReviewSnapshot; conflicts: Array<{ changeId: string; error: string }> }
  | { ok: false; error: string; status: number };

const FIELD_CHANGE_SELECT =
  'id, retailer_id, field_path, old_value, new_value, source, status, confidence, provider, source_urls, enrichment_job_id';
const JOB_SELECT = 'id, retailer_id, research_brief, evidence';
const PROSPECT_REVIEW_SELECT =
  'id, name, website, phone, category, retail_category, apparel_capability, verification_status, address, city, import_protected';

async function loadBatchJobs(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string },
): Promise<{ ok: true; jobs: EnrichmentJobRow[] } | { ok: false; error: string; status: number }> {
  const { data: batch, error: batchError } = await supabase
    .from('account_import_batches')
    .select('id')
    .eq('id', input.batchId)
    .eq('sales_line_id', input.salesLineId)
    .maybeSingle();
  if (batchError) return { ok: false, error: batchError.message, status: 500 };
  if (!batch) return { ok: false, error: 'Batch not found', status: 404 };
  const { data, error } = await supabase
    .from('account_enrichment_jobs')
    .select(JOB_SELECT)
    .eq('batch_id', input.batchId)
    .eq('mode', 'fill-blanks');
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, jobs: (data ?? []) as EnrichmentJobRow[] };
}

export async function getBatchReview(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string },
): Promise<ReviewResult> {
  const jobs = await loadBatchJobs(supabase, input);
  if (!jobs.ok) return jobs;
  if (jobs.jobs.length === 0) {
    return { ok: true, review: emptyReviewSnapshot(input.batchId), conflicts: [] };
  }
  const jobIds = jobs.jobs.map((row) => row.id);
  const { data: changeRows, error: changeError } = await supabase
    .from('retailer_field_changes')
    .select(FIELD_CHANGE_SELECT)
    .in('enrichment_job_id', jobIds)
    .eq('source', 'ai')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (changeError) return { ok: false, error: changeError.message, status: 500 };
  const pending = (changeRows ?? []) as FieldChangeRow[];
  const retailerIds = [...new Set(pending.map((row) => row.retailer_id))];
  let retailers: Array<{ id: number; name: string; importProtected: boolean }> = [];
  if (retailerIds.length > 0) {
    const { data: prospectRows, error: prospectError } = await supabase
      .from('prospects')
      .select('id, name, import_protected')
      .in('id', retailerIds);
    if (prospectError) return { ok: false, error: prospectError.message, status: 500 };
    retailers = (prospectRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      importProtected: row.import_protected === true,
    }));
  }
  return {
    ok: true,
    review: groupReviewRows({
      batchId: input.batchId,
      changes: pending.map((row) => ({
        id: row.id,
        retailerId: row.retailer_id,
        fieldPath: row.field_path,
        oldValue: row.old_value,
        newValue: row.new_value,
        confidence: row.confidence,
        sourceUrls: row.source_urls,
        enrichmentJobId: row.enrichment_job_id,
      })),
      retailers,
      jobs: jobs.jobs.map((row) => ({
        id: row.id,
        retailerId: row.retailer_id,
        researchBrief: row.research_brief,
        evidence: row.evidence,
      })),
    }),
    conflicts: [],
  };
}

async function applyOnePendingChange(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string; jobIds: string[]; changeId: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: change, error: changeError } = await supabase
    .from('retailer_field_changes')
    .select(FIELD_CHANGE_SELECT)
    .eq('id', input.changeId)
    .maybeSingle();
  if (changeError) return { ok: false, error: changeError.message, status: 500 };
  if (!change) return { ok: false, error: 'Field change not found', status: 404 };
  if (
    change.source !== 'ai' ||
    !change.enrichment_job_id ||
    !input.jobIds.includes(change.enrichment_job_id)
  ) {
    return { ok: false, error: 'Field change not found', status: 404 };
  }
  if (change.status === 'applied') return { ok: true };
  if (change.status !== 'pending') {
    return { ok: false, error: 'Field change is not pending', status: 409 };
  }

  const { data: prospect, error: prospectError } = await supabase
    .from('prospects')
    .select(PROSPECT_REVIEW_SELECT)
    .eq('id', change.retailer_id)
    .maybeSingle();
  if (prospectError) return { ok: false, error: prospectError.message, status: 500 };
  if (!prospect) return { ok: false, error: 'Retailer not found', status: 404 };

  const currentValue = (prospect as Record<string, unknown>)[change.field_path];
  const decision = classifyApplyDecision({
    fieldPath: change.field_path,
    currentValue,
    oldValue: change.old_value,
    newValue: change.new_value,
  });
  if (decision.kind === 'forbidden') {
    return { ok: false, error: 'Field cannot be applied from review', status: 400 };
  }
  if (decision.kind === 'conflict') {
    return {
      ok: false,
      error: 'Current value changed since this proposal was queued',
      status: 409,
    };
  }

  const { data: claimed, error: claimError } = await supabase
    .from('retailer_field_changes')
    .update({ status: 'applied' })
    .eq('id', change.id)
    .eq('status', 'pending')
    .select(FIELD_CHANGE_SELECT)
    .maybeSingle();
  if (claimError) return { ok: false, error: claimError.message, status: 500 };
  if (!claimed) {
    const { data: latest } = await supabase
      .from('retailer_field_changes')
      .select('status')
      .eq('id', change.id)
      .maybeSingle();
    if (latest?.status === 'applied') return { ok: true };
    return { ok: false, error: 'Field change is not pending', status: 409 };
  }

  if (decision.kind === 'write') {
    const { error: updateError } = await supabase
      .from('prospects')
      .update({ [change.field_path]: decision.patchValue } as ProspectPatch)
      .eq('id', claimed.retailer_id);
    if (updateError) {
      await supabase
        .from('retailer_field_changes')
        .update({ status: 'pending' })
        .eq('id', claimed.id)
        .eq('status', 'applied');
      return { ok: false, error: updateError.message, status: 500 };
    }
  }

  const { error: supersedeError } = await supabase
    .from('retailer_field_changes')
    .update({ status: 'superseded' })
    .eq('retailer_id', change.retailer_id)
    .eq('field_path', change.field_path)
    .eq('status', 'pending')
    .in('enrichment_job_id', input.jobIds)
    .neq('id', change.id);
  if (supersedeError) return { ok: false, error: supersedeError.message, status: 500 };
  return { ok: true };
}

async function rejectOnePendingChange(
  supabase: AgentSupabase,
  input: { jobIds: string[]; changeId: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: change, error: changeError } = await supabase
    .from('retailer_field_changes')
    .select(FIELD_CHANGE_SELECT)
    .eq('id', input.changeId)
    .maybeSingle();
  if (changeError) return { ok: false, error: changeError.message, status: 500 };
  if (!change) return { ok: false, error: 'Field change not found', status: 404 };
  if (
    change.source !== 'ai' ||
    !change.enrichment_job_id ||
    !input.jobIds.includes(change.enrichment_job_id)
  ) {
    return { ok: false, error: 'Field change not found', status: 404 };
  }
  if (change.status === 'rejected') return { ok: true };
  if (change.status !== 'pending') {
    return { ok: false, error: 'Field change is not pending', status: 409 };
  }
  const { error: rejectError } = await supabase
    .from('retailer_field_changes')
    .update({ status: 'rejected' })
    .eq('id', change.id)
    .eq('status', 'pending');
  if (rejectError) return { ok: false, error: rejectError.message, status: 500 };
  return { ok: true };
}

export async function applyBatchReviewChanges(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string; changeIds: string[] },
): Promise<ReviewResult> {
  if (input.changeIds.length === 0) {
    return { ok: false, error: 'No field changes selected', status: 400 };
  }
  const jobs = await loadBatchJobs(supabase, input);
  if (!jobs.ok) return jobs;
  const jobIds = jobs.jobs.map((row) => row.id);
  const conflicts: Array<{ changeId: string; error: string }> = [];
  for (const changeId of input.changeIds) {
    const result = await applyOnePendingChange(supabase, {
      salesLineId: input.salesLineId,
      batchId: input.batchId,
      jobIds,
      changeId,
    });
    if (!result.ok) conflicts.push({ changeId, error: result.error });
  }
  const review = await getBatchReview(supabase, input);
  if (!review.ok) return review;
  return { ok: true, review: review.review, conflicts };
}

export async function rejectBatchReviewChanges(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string; changeIds: string[] },
): Promise<ReviewResult> {
  if (input.changeIds.length === 0) {
    return { ok: false, error: 'No field changes selected', status: 400 };
  }
  const jobs = await loadBatchJobs(supabase, input);
  if (!jobs.ok) return jobs;
  const jobIds = jobs.jobs.map((row) => row.id);
  const conflicts: Array<{ changeId: string; error: string }> = [];
  for (const changeId of input.changeIds) {
    const result = await rejectOnePendingChange(supabase, { jobIds, changeId });
    if (!result.ok) conflicts.push({ changeId, error: result.error });
  }
  const review = await getBatchReview(supabase, input);
  if (!review.ok) return review;
  return { ok: true, review: review.review, conflicts };
}
