/**
 * Prospective Lines acquisition helpers (Phase 8).
 * Owner APIs use these. Islands must not insert lines or retailer_line_targets.
 */

import type { AgentSupabase, ApprovedStaffClientResult } from '@/lib/agentAuth';
import { requireApprovedOwnerClient } from '@/lib/agentAuth';
import { mapSalesLineAiProfile, type SalesLineAiProfile } from '@/lib/salesLineAiProfiles';
import { isProspectiveLinesEnabled } from '@/lib/staffFeatures';
import { supabase } from '@/lib/supabase';
import type { AcquisitionStage, LineStatus, RetailerLineTargetStatus } from '@/types/database';

export const PROSPECTIVE_LINE_SOFT_CAP = 12;
export const RESERVED_LINE_CODES = ['ogr', 'eagle-peak', 'big-fish', 'bkg'] as const;
export const PROSPECTIVE_OPERATIONAL_FORBIDDEN =
  'Operational writes are not allowed for prospective lines';
export const PROSPECTIVE_TARGETS_BLOCK_PROMOTE =
  'Cannot change line from prospective while retailer_line_targets exist; clear or archive targets before promotion';
export const PROSPECTIVE_FLAG_OFF = 'Prospective Lines is not enabled';

export function jsonProspective(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Owner JWT + FEATURE_PROSPECTIVE_LINES (raw flag; does not AND writes). */
export async function requireProspectiveLinesOwnerApi(
  request: Request,
): Promise<ApprovedStaffClientResult> {
  const gate = await requireApprovedOwnerClient(request);
  if (!gate.ok) return gate;
  if (!isProspectiveLinesEnabled()) {
    return {
      ok: false,
      response: jsonProspective({ ok: false, error: PROSPECTIVE_FLAG_OFF }, 403),
    };
  }
  return gate;
}

export const ACQUISITION_STAGES: readonly AcquisitionStage[] = [
  'identified',
  'researching',
  'contact_requested',
  'conversation',
  'evaluating',
  'negotiating',
  'decision_pending',
];

export const TARGET_STATUSES: readonly RetailerLineTargetStatus[] = [
  'watching',
  'shortlist',
  'dropped',
];

export const PROMOTE_STATUSES = ['confirmed', 'onboarding', 'declined'] as const;
export type ProspectivePromoteStatus = (typeof PROMOTE_STATUSES)[number];

const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EMPTY_PROSPECTIVE_AI_PROFILE: SalesLineAiProfile = {
  persona:
    'You are a research assistant for a prospective sales line. The published catalog is empty. Do not invent commercial terms, SKUs, or Old Guys Rule apparel rubrics.',
  systemPrompt:
    "You help staff research a prospective line using only this line's data. The catalog is empty — never invent SKUs or borrow another line's products. Do not convert accounts, log orders, or generate outreach. Do not invent store facts or commercial terms.",
  apfPrompt:
    'There are no catalog anchors for this line. Do not invent SKUs. If asked for product fit, say the catalog is empty.',
  fillBlanksPrompt:
    'Fill only publicly evidenced identity fields for this line. Do not apply Old Guys Rule apparel fit scoring or BC territory mappers.',
  catalogFilter: 'empty',
  currency: null,
  icp: '',
  rubric: '',
  researchNotes: '',
  geoInterest: '',
};

export type ProspectiveLineRecord = {
  id: string;
  code: string;
  name: string;
  status: LineStatus;
  acquisitionStage: AcquisitionStage | null;
  active: boolean;
  defaultCurrency: string | null;
  commissionRate: number | null;
  principalId: string | null;
  legalName: string | null;
  dbaName: string | null;
  icp: string;
  researchNotes: string;
  geoInterest: string;
  targetCount: number;
};

export type ProspectiveTargetRecord = {
  id: string;
  retailerId: number;
  salesLineId: string;
  retailerName: string | null;
  interest: string | null;
  fitNotes: string | null;
  suggestedGeo: string | null;
  status: RetailerLineTargetStatus;
  createdAt: string;
  updatedAt: string;
};

const LINE_SELECT =
  'id, code, name, active, status, acquisition_stage, default_currency, commission_rate, principal_id, ai_profile' as const;

/** Refuse convert/order when the sales line is still prospective. */
export function assertProspectiveOperationalWriteForbidden(
  lineStatus: string | null | undefined,
): string | null {
  if (lineStatus === 'prospective') return PROSPECTIVE_OPERATIONAL_FORBIDDEN;
  return null;
}

/** Kebab-case a display name into a line code. */
export function slugifyLineCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isReservedLineCode(code: string): boolean {
  return (RESERVED_LINE_CODES as readonly string[]).includes(code);
}

export function parseLineCode(
  raw: string | undefined | null,
): { ok: true; code: string } | { ok: false; error: string } {
  const code = slugifyLineCode(raw ?? '');
  if (!code || !CODE_RE.test(code)) {
    return { ok: false, error: 'A valid kebab-case line code is required' };
  }
  if (isReservedLineCode(code)) {
    return { ok: false, error: 'This line code is reserved' };
  }
  return { ok: true, code };
}

export function parseAcquisitionStage(raw: unknown): AcquisitionStage | null {
  if (typeof raw !== 'string') return null;
  const stage = raw.trim() as AcquisitionStage;
  return ACQUISITION_STAGES.includes(stage) ? stage : null;
}

export function parseTargetStatus(raw: unknown): RetailerLineTargetStatus | null {
  if (typeof raw !== 'string') return null;
  const status = raw.trim() as RetailerLineTargetStatus;
  return TARGET_STATUSES.includes(status) ? status : null;
}

export function parsePromoteStatus(raw: unknown): ProspectivePromoteStatus | null {
  if (typeof raw !== 'string') return null;
  const status = raw.trim() as ProspectivePromoteStatus;
  return (PROMOTE_STATUSES as readonly string[]).includes(status) ? status : null;
}

export function warnedAtSoftCap(existingCount: number): boolean {
  return existingCount >= PROSPECTIVE_LINE_SOFT_CAP;
}

function profileFromRow(raw: unknown): SalesLineAiProfile {
  return mapSalesLineAiProfile(raw);
}

function mapLine(
  row: {
    id: string;
    code: string;
    name: string;
    active: boolean;
    status: string;
    acquisition_stage: string | null;
    default_currency: string | null;
    commission_rate: number | null;
    principal_id: string | null;
    ai_profile: unknown;
  },
  extras: { legalName: string | null; dbaName: string | null; targetCount: number },
): ProspectiveLineRecord {
  const profile = profileFromRow(row.ai_profile);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status as LineStatus,
    acquisitionStage: row.acquisition_stage as AcquisitionStage | null,
    active: row.active,
    defaultCurrency: row.default_currency,
    commissionRate: row.commission_rate,
    principalId: row.principal_id,
    legalName: extras.legalName,
    dbaName: extras.dbaName,
    icp: profile.icp,
    researchNotes: profile.researchNotes,
    geoInterest: profile.geoInterest,
    targetCount: extras.targetCount,
  };
}

async function loadPrincipal(
  client: AgentSupabase,
  principalId: string | null,
): Promise<{ legalName: string | null; dbaName: string | null }> {
  if (!principalId) return { legalName: null, dbaName: null };
  const { data, error } = await client
    .from('principals')
    .select('legal_name, dba_name')
    .eq('id', principalId)
    .maybeSingle();
  if (error || !data) return { legalName: null, dbaName: null };
  return { legalName: data.legal_name, dbaName: data.dba_name };
}

async function countTargets(client: AgentSupabase, salesLineId: string): Promise<number> {
  const { count, error } = await client
    .from('retailer_line_targets')
    .select('id', { count: 'exact', head: true })
    .eq('sales_line_id', salesLineId);
  if (error) return 0;
  return count ?? 0;
}

async function hydrateLine(
  client: AgentSupabase,
  row: {
    id: string;
    code: string;
    name: string;
    active: boolean;
    status: string;
    acquisition_stage: string | null;
    default_currency: string | null;
    commission_rate: number | null;
    principal_id: string | null;
    ai_profile: unknown;
  },
): Promise<ProspectiveLineRecord> {
  const [principal, targetCount] = await Promise.all([
    loadPrincipal(client, row.principal_id),
    countTargets(client, row.id),
  ]);
  return mapLine(row, { ...principal, targetCount });
}

export async function countProspectiveLines(
  client: AgentSupabase,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await client
    .from('lines')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'prospective');
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function listProspectiveLines(
  client: AgentSupabase,
): Promise<{ data: ProspectiveLineRecord[]; error: string | null }> {
  const { data, error } = await client
    .from('lines')
    .select(LINE_SELECT)
    .eq('status', 'prospective')
    .order('name', { ascending: true });
  if (error) return { data: [], error: error.message };
  const rows = await Promise.all((data ?? []).map((row) => hydrateLine(client, row)));
  return { data: rows, error: null };
}

export async function getProspectiveLineByCode(
  client: AgentSupabase,
  code: string,
): Promise<{ data: ProspectiveLineRecord | null; error: string | null }> {
  const { data, error } = await client
    .from('lines')
    .select(LINE_SELECT)
    .eq('code', code)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  if (data.status !== 'prospective') {
    return { data: null, error: 'This line is not prospective' };
  }
  return { data: await hydrateLine(client, data), error: null };
}

export async function createProspectiveLine(
  client: AgentSupabase,
  input: {
    name: string;
    code?: string;
    acquisitionStage?: AcquisitionStage | null;
    legalName?: string | null;
  },
): Promise<{
  data: ProspectiveLineRecord | null;
  error: string | null;
  status?: number;
  warned: boolean;
}> {
  const name = input.name.trim();
  if (!name) return { data: null, error: 'Name is required', status: 400, warned: false };
  const parsed = parseLineCode(input.code?.trim() ? input.code : name);
  if (!parsed.ok) return { data: null, error: parsed.error, status: 400, warned: false };
  const stage = input.acquisitionStage === undefined ? 'identified' : input.acquisitionStage;
  if (!stage || !ACQUISITION_STAGES.includes(stage)) {
    return { data: null, error: 'acquisition_stage is required', status: 400, warned: false };
  }

  const counted = await countProspectiveLines(client);
  if (counted.error) return { data: null, error: counted.error, status: 400, warned: false };
  const warned = warnedAtSoftCap(counted.count);

  const legalName = input.legalName?.trim() ? input.legalName.trim() : null;
  const { data: principal, error: principalError } = await client
    .from('principals')
    .insert({ legal_name: legalName, dba_name: name })
    .select('id')
    .single();
  if (principalError || !principal) {
    return {
      data: null,
      error: principalError?.message ?? 'Could not create principal',
      status: 400,
      warned,
    };
  }

  const { data: line, error: lineError } = await client
    .from('lines')
    .insert({
      code: parsed.code,
      name,
      active: false,
      status: 'prospective',
      acquisition_stage: stage,
      principal_id: principal.id,
      default_currency: null,
      commission_rate: null,
      ai_profile: EMPTY_PROSPECTIVE_AI_PROFILE,
    })
    .select(LINE_SELECT)
    .single();

  if (lineError || !line) {
    return {
      data: null,
      error: lineError?.message ?? 'Could not create line',
      status: 400,
      warned,
    };
  }

  return { data: await hydrateLine(client, line), error: null, warned };
}

export async function updateProspectiveLine(
  client: AgentSupabase,
  code: string,
  patch: {
    name?: string;
    acquisitionStage?: AcquisitionStage;
    legalName?: string | null;
    icp?: string;
    researchNotes?: string;
    geoInterest?: string;
  },
): Promise<{ data: ProspectiveLineRecord | null; error: string | null; status?: number }> {
  const existing = await getProspectiveLineByCode(client, code);
  if (existing.error) return { data: null, error: existing.error, status: 400 };
  if (!existing.data) return { data: null, error: 'Line not found', status: 404 };

  const { data: current, error: currentError } = await client
    .from('lines')
    .select('id, ai_profile, principal_id')
    .eq('code', code)
    .maybeSingle();
  if (currentError || !current) {
    return { data: null, error: currentError?.message ?? 'Line not found', status: 404 };
  }

  const profile = {
    ...EMPTY_PROSPECTIVE_AI_PROFILE,
    ...mapSalesLineAiProfile(current.ai_profile),
  };
  if (patch.icp !== undefined) profile.icp = patch.icp;
  if (patch.researchNotes !== undefined) profile.researchNotes = patch.researchNotes;
  if (patch.geoInterest !== undefined) profile.geoInterest = patch.geoInterest;

  const lineUpdate: {
    name?: string;
    acquisition_stage?: AcquisitionStage;
    ai_profile: SalesLineAiProfile;
  } = { ai_profile: profile };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { data: null, error: 'Name is required', status: 400 };
    lineUpdate.name = name;
  }
  if (patch.acquisitionStage !== undefined) {
    if (!ACQUISITION_STAGES.includes(patch.acquisitionStage)) {
      return { data: null, error: 'Invalid acquisition_stage', status: 400 };
    }
    lineUpdate.acquisition_stage = patch.acquisitionStage;
  }

  const { error: updateError } = await client.from('lines').update(lineUpdate).eq('code', code);
  if (updateError) return { data: null, error: updateError.message, status: 400 };

  if (patch.legalName !== undefined && current.principal_id) {
    const legalName = patch.legalName?.trim() ? patch.legalName.trim() : null;
    const { error: principalError } = await client
      .from('principals')
      .update({ legal_name: legalName })
      .eq('id', current.principal_id);
    if (principalError) return { data: null, error: principalError.message, status: 400 };
  }

  return getProspectiveLineByCode(client, code);
}

export async function deleteProspectiveLine(
  client: AgentSupabase,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const existing = await getProspectiveLineByCode(client, code);
  if (existing.error) return { ok: false, error: existing.error, status: 400 };
  if (!existing.data) return { ok: false, error: 'Line not found', status: 404 };
  if (existing.data.targetCount > 0) {
    return { ok: false, error: PROSPECTIVE_TARGETS_BLOCK_PROMOTE, status: 409 };
  }
  const { error } = await client
    .from('lines')
    .delete()
    .eq('code', code)
    .eq('status', 'prospective');
  if (error) return { ok: false, error: error.message, status: 400 };
  return { ok: true };
}

export async function promoteProspectiveLine(
  client: AgentSupabase,
  code: string,
  nextStatus: ProspectivePromoteStatus,
): Promise<{
  data: { id: string; code: string; status: LineStatus } | null;
  error: string | null;
  status?: number;
}> {
  const existing = await getProspectiveLineByCode(client, code);
  if (existing.error) return { data: null, error: existing.error, status: 400 };
  if (!existing.data) return { data: null, error: 'Line not found', status: 404 };
  if (existing.data.targetCount > 0) {
    return { data: null, error: PROSPECTIVE_TARGETS_BLOCK_PROMOTE, status: 409 };
  }

  const { data, error } = await client
    .from('lines')
    .update({
      status: nextStatus,
      acquisition_stage: null,
    })
    .eq('code', code)
    .eq('status', 'prospective')
    .select('id, code, status')
    .maybeSingle();

  if (error) {
    const message = error.message;
    if (/retailer_line_targets exist/i.test(message)) {
      return { data: null, error: PROSPECTIVE_TARGETS_BLOCK_PROMOTE, status: 409 };
    }
    return { data: null, error: message, status: 400 };
  }
  if (!data) return { data: null, error: 'Line not found', status: 404 };
  return { data: { id: data.id, code: data.code, status: data.status as LineStatus }, error: null };
}

export async function listProspectiveTargets(
  client: AgentSupabase,
  salesLineId: string,
): Promise<{ data: ProspectiveTargetRecord[]; error: string | null }> {
  const { data, error } = await client
    .from('retailer_line_targets')
    .select(
      'id, retailer_id, sales_line_id, interest, fit_notes, suggested_geo, status, created_at, updated_at',
    )
    .eq('sales_line_id', salesLineId)
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: error.message };

  const retailerIds = [...new Set((data ?? []).map((row) => row.retailer_id))];
  const names = new Map<number, string>();
  if (retailerIds.length > 0) {
    const { data: prospects } = await client
      .from('prospects')
      .select('id, name')
      .in('id', retailerIds);
    for (const row of prospects ?? []) {
      names.set(row.id, row.name);
    }
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      retailerId: row.retailer_id,
      salesLineId: row.sales_line_id,
      retailerName: names.get(row.retailer_id) ?? null,
      interest: row.interest,
      fitNotes: row.fit_notes,
      suggestedGeo: row.suggested_geo,
      status: row.status as RetailerLineTargetStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    error: null,
  };
}

export async function createProspectiveTarget(
  client: AgentSupabase,
  input: {
    salesLineId: string;
    retailerId: number;
    interest?: string | null;
    fitNotes?: string | null;
    suggestedGeo?: string | null;
    status?: RetailerLineTargetStatus;
  },
): Promise<{ data: ProspectiveTargetRecord | null; error: string | null; status?: number }> {
  if (!Number.isFinite(input.retailerId)) {
    return { data: null, error: 'retailer_id is required', status: 400 };
  }
  const { data: prospect, error: prospectError } = await client
    .from('prospects')
    .select('id, name')
    .eq('id', input.retailerId)
    .maybeSingle();
  if (prospectError) return { data: null, error: prospectError.message, status: 400 };
  if (!prospect) return { data: null, error: 'Retailer not found', status: 404 };

  const { data, error } = await client
    .from('retailer_line_targets')
    .insert({
      retailer_id: input.retailerId,
      sales_line_id: input.salesLineId,
      interest: input.interest ?? null,
      fit_notes: input.fitNotes ?? null,
      suggested_geo: input.suggestedGeo ?? null,
      status: input.status ?? 'watching',
    })
    .select(
      'id, retailer_id, sales_line_id, interest, fit_notes, suggested_geo, status, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? 'Could not create target', status: 400 };
  }
  return {
    data: {
      id: data.id,
      retailerId: data.retailer_id,
      salesLineId: data.sales_line_id,
      retailerName: prospect.name,
      interest: data.interest,
      fitNotes: data.fit_notes,
      suggestedGeo: data.suggested_geo,
      status: data.status as RetailerLineTargetStatus,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
    error: null,
  };
}

export async function updateProspectiveTarget(
  client: AgentSupabase,
  input: {
    salesLineId: string;
    targetId: string;
    interest?: string | null;
    fitNotes?: string | null;
    suggestedGeo?: string | null;
    status?: RetailerLineTargetStatus;
  },
): Promise<{ data: ProspectiveTargetRecord | null; error: string | null; status?: number }> {
  const patch: {
    interest?: string | null;
    fit_notes?: string | null;
    suggested_geo?: string | null;
    status?: RetailerLineTargetStatus;
  } = {};
  if (input.interest !== undefined) patch.interest = input.interest;
  if (input.fitNotes !== undefined) patch.fit_notes = input.fitNotes;
  if (input.suggestedGeo !== undefined) patch.suggested_geo = input.suggestedGeo;
  if (input.status !== undefined) patch.status = input.status;
  if (Object.keys(patch).length === 0) {
    return { data: null, error: 'No valid patch fields provided', status: 400 };
  }

  const { data, error } = await client
    .from('retailer_line_targets')
    .update(patch)
    .eq('id', input.targetId)
    .eq('sales_line_id', input.salesLineId)
    .select(
      'id, retailer_id, sales_line_id, interest, fit_notes, suggested_geo, status, created_at, updated_at',
    )
    .maybeSingle();
  if (error) return { data: null, error: error.message, status: 400 };
  if (!data) return { data: null, error: 'Target not found', status: 404 };

  const listed = await listProspectiveTargets(client, input.salesLineId);
  const match = listed.data.find((row) => row.id === data.id) ?? null;
  return { data: match, error: listed.error };
}

export async function deleteProspectiveTarget(
  client: AgentSupabase,
  input: { salesLineId: string; targetId: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await client
    .from('retailer_line_targets')
    .delete()
    .eq('id', input.targetId)
    .eq('sales_line_id', input.salesLineId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 400 };
  if (!data) return { ok: false, error: 'Target not found', status: 404 };
  return { ok: true };
}

async function staffAuthHeaders(): Promise<
  { ok: true; headers: Record<string, string> } | { ok: false; error: string }
> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };
  return { ok: true, headers: { Authorization: `Bearer ${token}` } };
}

async function parseClientJson(
  res: Response,
): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  try {
    return (await res.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: 'Invalid response' };
  }
}

export async function fetchProspectiveLinesClient(): Promise<
  | { ok: true; lines: ProspectiveLineRecord[]; warned: boolean }
  | { ok: false; error: string; status: number }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch('/api/staff/prospective-lines', { headers: auth.headers });
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not load prospective lines',
      status: res.status,
    };
  }
  const lines = Array.isArray(payload.lines) ? (payload.lines as ProspectiveLineRecord[]) : [];
  return { ok: true, lines, warned: Boolean(payload.warned) };
}

export async function createProspectiveLineClient(input: {
  name: string;
  code?: string;
  acquisitionStage?: AcquisitionStage;
  legalName?: string | null;
}): Promise<
  | { ok: true; line: ProspectiveLineRecord; warned: boolean }
  | { ok: false; error: string; status: number }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch('/api/staff/prospective-lines', {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok || !payload.line) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not create line',
      status: res.status,
    };
  }
  return {
    ok: true,
    line: payload.line as ProspectiveLineRecord,
    warned: Boolean(payload.warned),
  };
}

export async function fetchProspectiveLineClient(
  code: string,
): Promise<
  | { ok: true; line: ProspectiveLineRecord; targets: ProspectiveTargetRecord[] }
  | { ok: false; error: string; status: number }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch(`/api/staff/prospective-lines/${encodeURIComponent(code)}`, {
    headers: auth.headers,
  });
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok || !payload.line) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Line not found',
      status: res.status,
    };
  }
  const targets = Array.isArray(payload.targets)
    ? (payload.targets as ProspectiveTargetRecord[])
    : [];
  return { ok: true, line: payload.line as ProspectiveLineRecord, targets };
}

export async function patchProspectiveLineClient(
  code: string,
  patch: {
    name?: string;
    acquisitionStage?: AcquisitionStage;
    legalName?: string | null;
    icp?: string;
    researchNotes?: string;
    geoInterest?: string;
  },
): Promise<
  { ok: true; line: ProspectiveLineRecord } | { ok: false; error: string; status: number }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch(`/api/staff/prospective-lines/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok || !payload.line) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not update line',
      status: res.status,
    };
  }
  return { ok: true, line: payload.line as ProspectiveLineRecord };
}

export async function deleteProspectiveLineClient(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch(`/api/staff/prospective-lines/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: auth.headers,
  });
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not delete line',
      status: res.status,
    };
  }
  return { ok: true };
}

export async function promoteProspectiveLineClient(
  code: string,
  status: ProspectivePromoteStatus,
): Promise<
  | { ok: true; line: { id: string; code: string; status: LineStatus } }
  | { ok: false; error: string; status: number }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch(`/api/staff/prospective-lines/${encodeURIComponent(code)}/promote`, {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok || !payload.line) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not update status',
      status: res.status,
    };
  }
  return { ok: true, line: payload.line as { id: string; code: string; status: LineStatus } };
}

export async function createProspectiveTargetClient(
  code: string,
  input: {
    retailerId: number;
    interest?: string | null;
    fitNotes?: string | null;
    suggestedGeo?: string | null;
    status?: RetailerLineTargetStatus;
  },
): Promise<
  { ok: true; target: ProspectiveTargetRecord } | { ok: false; error: string; status: number }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch(`/api/staff/prospective-lines/${encodeURIComponent(code)}/targets`, {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok || !payload.target) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not add target',
      status: res.status,
    };
  }
  return { ok: true, target: payload.target as ProspectiveTargetRecord };
}

export async function patchProspectiveTargetClient(
  code: string,
  targetId: string,
  patch: {
    interest?: string | null;
    fitNotes?: string | null;
    suggestedGeo?: string | null;
    status?: RetailerLineTargetStatus;
  },
): Promise<
  { ok: true; target: ProspectiveTargetRecord } | { ok: false; error: string; status: number }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch(
    `/api/staff/prospective-lines/${encodeURIComponent(code)}/targets/${encodeURIComponent(targetId)}`,
    {
      method: 'PATCH',
      headers: { ...auth.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok || !payload.target) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not update target',
      status: res.status,
    };
  }
  return { ok: true, target: payload.target as ProspectiveTargetRecord };
}

export async function deleteProspectiveTargetClient(
  code: string,
  targetId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return { ok: false, error: auth.error, status: 401 };
  const res = await fetch(
    `/api/staff/prospective-lines/${encodeURIComponent(code)}/targets/${encodeURIComponent(targetId)}`,
    {
      method: 'DELETE',
      headers: auth.headers,
    },
  );
  const payload = await parseClientJson(res);
  if (!res.ok || !payload.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : 'Could not remove target',
      status: res.status,
    };
  }
  return { ok: true };
}
