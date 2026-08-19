import type { AgentSupabase } from '@/lib/agentAuth';
import { loadCrmMatchSnapshot } from '@/lib/accountImport/preview';
import { isUniqueConstraintError } from '@/lib/accountImport/commit';
import { territoryCodeFromImportState } from '@/lib/accountImport/territory';
import { nextProspectId } from '@/lib/createEnrichedProspect';
import {
  isLookalikeSeedRla,
  LOOKALIKE_LINE_CODE,
  parseLookalikeSeedIds,
} from '@/lib/lookalike/classification';
import { buildLookalikeInsertFields } from '@/lib/lookalike/insert';
import { classifyLookalikeCandidate, type ProposedLookalike } from '@/lib/lookalike/match';
import { searchLookalikeCandidates } from '@/lib/lookalike/search';
import { buildLookalikeTraitBrief, type LookalikeSeedProfile } from '@/lib/lookalike/traits';
import type {
  LookalikeCandidateView,
  LookalikeJobSnapshot,
  LookalikeSeedListItem,
} from '@/lib/lookalike/types';
import {
  fetchSalesLineTerritories,
  suggestedAssignmentForLocation,
} from '@/lib/salesLineTerritories';
import { resolveTerritoryIdByCode } from '@/lib/territories';
import { isUuid } from '@/lib/resolveSalesLineQuery';
import type { AccountImportMatchDecision, LookalikeCandidateStatus } from '@/types/database';

export type { LookalikeCandidateView, LookalikeJobSnapshot, LookalikeSeedListItem };

type JobResult =
  { ok: true; snapshot: LookalikeJobSnapshot } | { ok: false; error: string; status: number };

const CANDIDATE_SELECT =
  'id, name, city, state, website, evidence, match_decision, status, retailer_id';

function mapCandidate(row: {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  evidence: string | null;
  match_decision: AccountImportMatchDecision | null;
  status: LookalikeCandidateStatus;
  retailer_id: number | null;
}): LookalikeCandidateView {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    state: row.state,
    website: row.website,
    evidence: row.evidence,
    matchDecision: row.match_decision,
    status: row.status,
    retailerId: row.retailer_id,
  };
}

async function allocateLookalikeProspectId(
  supabase: AgentSupabase,
): Promise<{ ok: true; id: number } | { ok: false; error: string; status: number }> {
  const { data: maxRow, error: maxError } = await supabase
    .from('prospects')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) return { ok: false, error: maxError.message, status: 500 };
  return { ok: true, id: nextProspectId(maxRow?.id) };
}

async function loadSnapshot(supabase: AgentSupabase, jobId: string): Promise<JobResult> {
  const { data: job, error: jobError } = await supabase
    .from('lookalike_jobs')
    .select('id, sales_line_id, status, trait_brief, error')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError) return { ok: false, error: jobError.message, status: 500 };
  if (!job) return { ok: false, error: 'Unknown lookalike job', status: 404 };
  const { data: rows, error: candError } = await supabase
    .from('lookalike_candidates')
    .select(CANDIDATE_SELECT)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (candError) return { ok: false, error: candError.message, status: 500 };
  return {
    ok: true,
    snapshot: {
      jobId: job.id,
      salesLineId: job.sales_line_id,
      status: job.status,
      traitBrief: job.trait_brief,
      error: job.error,
      candidates: (rows ?? []).map(mapCandidate),
    },
  };
}

async function loadOgrLine(
  supabase: AgentSupabase,
  salesLineId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const { data: line, error } = await supabase
    .from('lines')
    .select('id, code')
    .eq('id', salesLineId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!line || line.code !== LOOKALIKE_LINE_CODE) {
    return {
      ok: false,
      error: 'Lookalike discovery is only available for Old Guys Rule',
      status: 400,
    };
  }
  return { ok: true, id: line.id };
}

export async function listLookalikeSeeds(
  supabase: AgentSupabase,
  salesLineId: string,
): Promise<
  { ok: true; seeds: LookalikeSeedListItem[] } | { ok: false; error: string; status: number }
> {
  const line = await loadOgrLine(supabase, salesLineId);
  if (!line.ok) return line;
  const { data: rlas, error: rlaError } = await supabase
    .from('retailer_line_accounts')
    .select('retailer_id, relationship_status, line_account_markers')
    .eq('sales_line_id', salesLineId);
  if (rlaError) return { ok: false, error: rlaError.message, status: 500 };
  const seedIds = (rlas ?? [])
    .filter((row) =>
      isLookalikeSeedRla({
        lineCode: LOOKALIKE_LINE_CODE,
        relationshipStatus: row.relationship_status,
        markers: row.line_account_markers,
      }),
    )
    .map((row) => row.retailer_id);
  if (seedIds.length === 0) return { ok: true, seeds: [] };

  const { data: prospects, error: prospectError } = await supabase
    .from('prospects')
    .select('id, name, city, territory_id')
    .in('id', seedIds);
  if (prospectError) return { ok: false, error: prospectError.message, status: 500 };
  const { data: territories, error: terrError } = await supabase
    .from('territories')
    .select('id, code');
  if (terrError) return { ok: false, error: terrError.message, status: 500 };
  const codeById = new Map((territories ?? []).map((row) => [row.id, row.code]));
  const byId = new Map((prospects ?? []).map((row) => [row.id, row]));
  return {
    ok: true,
    seeds: seedIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        retailerId: row.id,
        name: row.name,
        city: row.city,
        territoryCode: row.territory_id ? (codeById.get(row.territory_id) ?? null) : null,
      })),
  };
}

export async function startLookalikeJob(
  supabase: AgentSupabase,
  userId: string,
  input: { salesLineId: string; seedRetailerIds: unknown },
): Promise<JobResult> {
  const line = await loadOgrLine(supabase, input.salesLineId);
  if (!line.ok) return line;
  const seedIds = parseLookalikeSeedIds(input.seedRetailerIds);
  if (!seedIds) {
    return { ok: false, error: 'Select between 1 and 12 historical OGR accounts', status: 400 };
  }
  const { data: rlas, error: rlaError } = await supabase
    .from('retailer_line_accounts')
    .select('retailer_id, relationship_status, line_account_markers')
    .eq('sales_line_id', input.salesLineId)
    .in('retailer_id', seedIds);
  if (rlaError) return { ok: false, error: rlaError.message, status: 500 };
  const byRetailer = new Map((rlas ?? []).map((row) => [row.retailer_id, row]));
  for (const id of seedIds) {
    const rla = byRetailer.get(id);
    if (
      !rla ||
      !isLookalikeSeedRla({
        lineCode: LOOKALIKE_LINE_CODE,
        relationshipStatus: rla.relationship_status,
        markers: rla.line_account_markers,
      })
    ) {
      return {
        ok: false,
        error: 'Lookalike seeds must be verified historical OGR purchasers',
        status: 400,
      };
    }
  }
  const { data: job, error } = await supabase
    .from('lookalike_jobs')
    .insert({
      sales_line_id: input.salesLineId,
      created_by: userId,
      seed_retailer_ids: seedIds,
      status: 'queued',
    })
    .select('id')
    .single();
  if (error || !job) {
    return { ok: false, error: error?.message ?? 'Could not start lookalike job', status: 500 };
  }
  return loadSnapshot(supabase, job.id);
}

export async function getLookalikeJob(supabase: AgentSupabase, jobId: string): Promise<JobResult> {
  if (!isUuid(jobId)) return { ok: false, error: 'Invalid job id', status: 400 };
  return loadSnapshot(supabase, jobId);
}

export async function cancelLookalikeJob(
  supabase: AgentSupabase,
  jobId: string,
): Promise<JobResult> {
  if (!isUuid(jobId)) return { ok: false, error: 'Invalid job id', status: 400 };
  const { data: job, error } = await supabase
    .from('lookalike_jobs')
    .select('id, status')
    .eq('id', jobId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!job) return { ok: false, error: 'Unknown lookalike job', status: 404 };
  if (job.status === 'proposed' || job.status === 'failed') {
    return loadSnapshot(supabase, jobId);
  }
  const { error: updateError } = await supabase
    .from('lookalike_jobs')
    .update({ status: 'cancelled', error: null })
    .eq('id', jobId)
    .in('status', ['queued', 'running']);
  if (updateError) return { ok: false, error: updateError.message, status: 500 };
  return loadSnapshot(supabase, jobId);
}

async function loadSeedProfiles(
  supabase: AgentSupabase,
  seedIds: number[],
): Promise<
  { ok: true; seeds: LookalikeSeedProfile[] } | { ok: false; error: string; status: number }
> {
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, city, category, retail_category, territory_id')
    .in('id', seedIds);
  if (error) return { ok: false, error: error.message, status: 500 };
  const { data: territories, error: terrError } = await supabase
    .from('territories')
    .select('id, code');
  if (terrError) return { ok: false, error: terrError.message, status: 500 };
  const codeById = new Map((territories ?? []).map((row) => [row.id, row.code]));
  return {
    ok: true,
    seeds: (prospects ?? []).map((row) => ({
      name: row.name,
      city: row.city,
      territoryCode: row.territory_id ? (codeById.get(row.territory_id) ?? null) : null,
      category: row.category,
      retailCategory: row.retail_category,
    })),
  };
}

export async function processLookalikeJob(
  supabase: AgentSupabase,
  jobId: string,
  search: typeof searchLookalikeCandidates = searchLookalikeCandidates,
): Promise<JobResult> {
  if (!isUuid(jobId)) return { ok: false, error: 'Invalid job id', status: 400 };
  const { data: job, error } = await supabase
    .from('lookalike_jobs')
    .select('id, sales_line_id, seed_retailer_ids, status')
    .eq('id', jobId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!job) return { ok: false, error: 'Unknown lookalike job', status: 404 };
  if (job.status === 'cancelled') return loadSnapshot(supabase, jobId);
  if (job.status === 'proposed' || job.status === 'failed') return loadSnapshot(supabase, jobId);

  const { data: claimed, error: runningError } = await supabase
    .from('lookalike_jobs')
    .update({ status: 'running', error: null })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('id')
    .maybeSingle();
  if (runningError) return { ok: false, error: runningError.message, status: 500 };
  if (!claimed) return loadSnapshot(supabase, jobId);

  const { data: cancelled } = await supabase
    .from('lookalike_jobs')
    .select('status')
    .eq('id', jobId)
    .maybeSingle();
  if (cancelled?.status === 'cancelled') return loadSnapshot(supabase, jobId);

  const profiles = await loadSeedProfiles(supabase, job.seed_retailer_ids);
  if (!profiles.ok) {
    await supabase
      .from('lookalike_jobs')
      .update({ status: 'failed', error: profiles.error })
      .eq('id', jobId);
    return profiles;
  }
  const traitBrief = buildLookalikeTraitBrief(profiles.seeds);
  const found = await search({
    traitBrief,
    seedNames: profiles.seeds.map((seed) => seed.name),
  });
  if (!found.ok) {
    await supabase
      .from('lookalike_jobs')
      .update({ status: 'failed', error: found.error, trait_brief: traitBrief })
      .eq('id', jobId);
    return { ok: false, error: found.error, status: 502 };
  }

  const { data: afterSearch } = await supabase
    .from('lookalike_jobs')
    .select('status')
    .eq('id', jobId)
    .maybeSingle();
  if (afterSearch?.status === 'cancelled') return loadSnapshot(supabase, jobId);

  const snapshot = await loadCrmMatchSnapshot(supabase, job.sales_line_id, 'historical_customer');
  if (!snapshot.ok) {
    await supabase
      .from('lookalike_jobs')
      .update({ status: 'failed', error: snapshot.error, trait_brief: traitBrief })
      .eq('id', jobId);
    return { ok: false, error: snapshot.error, status: 500 };
  }

  const rows = found.candidates.map((candidate: ProposedLookalike) => {
    const classified = classifyLookalikeCandidate({
      candidate,
      retailers: snapshot.retailers,
      rlas: snapshot.rlas,
      contacts: snapshot.contacts,
    });
    return {
      job_id: jobId,
      name: candidate.name,
      city: candidate.city,
      state: candidate.state,
      website: candidate.website,
      evidence: candidate.whySimilar,
      match_decision: classified?.matchDecision ?? 'blocked',
      status: classified?.status ?? 'already_in_crm',
    };
  });

  const { error: clearError } = await supabase
    .from('lookalike_candidates')
    .delete()
    .eq('job_id', jobId);
  if (clearError) {
    await supabase
      .from('lookalike_jobs')
      .update({ status: 'failed', error: clearError.message, trait_brief: traitBrief })
      .eq('id', jobId);
    return { ok: false, error: clearError.message, status: 500 };
  }
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('lookalike_candidates').insert(rows);
    if (insertError) {
      await supabase
        .from('lookalike_jobs')
        .update({ status: 'failed', error: insertError.message, trait_brief: traitBrief })
        .eq('id', jobId);
      return { ok: false, error: insertError.message, status: 500 };
    }
  }

  const { error: doneError } = await supabase
    .from('lookalike_jobs')
    .update({ status: 'proposed', trait_brief: traitBrief, error: null })
    .eq('id', jobId);
  if (doneError) return { ok: false, error: doneError.message, status: 500 };
  return loadSnapshot(supabase, jobId);
}

export async function reviewLookalikeCandidate(
  supabase: AgentSupabase,
  input: { jobId: string; candidateId: string; action: 'approve' | 'reject' },
): Promise<JobResult> {
  if (!isUuid(input.jobId) || !isUuid(input.candidateId)) {
    return { ok: false, error: 'Invalid id', status: 400 };
  }
  const { data: job, error: jobError } = await supabase
    .from('lookalike_jobs')
    .select('id, sales_line_id, status')
    .eq('id', input.jobId)
    .maybeSingle();
  if (jobError) return { ok: false, error: jobError.message, status: 500 };
  if (!job) return { ok: false, error: 'Unknown lookalike job', status: 404 };
  const { data: candidate, error: candError } = await supabase
    .from('lookalike_candidates')
    .select(CANDIDATE_SELECT)
    .eq('id', input.candidateId)
    .eq('job_id', input.jobId)
    .maybeSingle();
  if (candError) return { ok: false, error: candError.message, status: 500 };
  if (!candidate) return { ok: false, error: 'Unknown lookalike candidate', status: 404 };
  if (candidate.status === 'approved' || candidate.status === 'rejected') {
    return loadSnapshot(supabase, input.jobId);
  }
  if (input.action === 'reject') {
    const { error } = await supabase
      .from('lookalike_candidates')
      .update({ status: 'rejected' })
      .eq('id', input.candidateId)
      .in('status', ['proposed', 'already_in_crm']);
    if (error) return { ok: false, error: error.message, status: 500 };
    return loadSnapshot(supabase, input.jobId);
  }
  if (job.status !== 'proposed') {
    return { ok: false, error: 'Job is not ready for review', status: 400 };
  }
  if (candidate.status !== 'proposed') {
    return { ok: false, error: 'Only net-new candidates can be approved', status: 400 };
  }

  const crm = await loadCrmMatchSnapshot(supabase, job.sales_line_id, 'historical_customer');
  if (!crm.ok) return { ok: false, error: crm.error, status: 500 };
  const rematch = classifyLookalikeCandidate({
    candidate: {
      name: candidate.name,
      city: candidate.city ?? '',
      state: candidate.state ?? '',
      website: candidate.website,
      whySimilar: candidate.evidence ?? '',
    },
    retailers: crm.retailers,
    rlas: crm.rlas,
    contacts: crm.contacts,
  });
  if (!rematch || rematch.status !== 'proposed') {
    await supabase
      .from('lookalike_candidates')
      .update({
        status: 'already_in_crm',
        match_decision: rematch?.matchDecision ?? 'needs_review',
      })
      .eq('id', input.candidateId);
    return { ok: false, error: 'Candidate already exists in the CRM', status: 409 };
  }

  const stateCode = territoryCodeFromImportState(candidate.state);
  if (!stateCode) {
    return { ok: false, error: 'Candidate is not in Oregon or Washington', status: 400 };
  }
  const territory = await resolveTerritoryIdByCode(supabase, stateCode);
  if ('error' in territory) return { ok: false, error: territory.error, status: 400 };
  const assignments = await fetchSalesLineTerritories(supabase, job.sales_line_id);
  if (assignments.error) return { ok: false, error: assignments.error, status: 500 };
  const slt = suggestedAssignmentForLocation(assignments.data, stateCode);

  const fields = buildLookalikeInsertFields({
    jobId: input.jobId,
    name: candidate.name,
    city: candidate.city,
    state: candidate.state,
    website: candidate.website,
    territoryId: territory.id,
    salesLineTerritoryId: slt?.id ?? null,
  });
  // Copilot suggestion ignored: prospect ids use the same nextProspectId allocation as Add via AI; a sequence/RPC rewrite is out of scope for this slice.
  const allocated = await allocateLookalikeProspectId(supabase);
  if (!allocated.ok) return allocated;
  let id = allocated.id;
  let { error: prospectError } = await supabase.from('prospects').insert({
    id,
    ...fields.prospect,
  });
  if (prospectError && isUniqueConstraintError(prospectError)) {
    const retried = await allocateLookalikeProspectId(supabase);
    if (!retried.ok) return retried;
    id = retried.id;
    const retryInsert = await supabase.from('prospects').insert({
      id,
      ...fields.prospect,
    });
    prospectError = retryInsert.error;
  }
  if (prospectError) return { ok: false, error: prospectError.message, status: 500 };
  const { error: rlaError } = await supabase.from('retailer_line_accounts').insert({
    retailer_id: id,
    sales_line_id: job.sales_line_id,
    ...fields.rla,
  });
  if (rlaError) {
    await supabase.from('prospects').delete().eq('id', id);
    return { ok: false, error: rlaError.message, status: 500 };
  }
  const { error: stampError } = await supabase
    .from('lookalike_candidates')
    .update({ status: 'approved', retailer_id: id })
    .eq('id', input.candidateId);
  if (stampError) return { ok: false, error: stampError.message, status: 500 };
  return loadSnapshot(supabase, input.jobId);
}
