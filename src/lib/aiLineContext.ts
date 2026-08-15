/**
 * Staff AI line context resolver (Phase 4).
 * Flag-off callers skip this module. Flag-on: fail closed (400), never default to OGR.
 */

import type { AgentSupabase } from '@/lib/agentAuth';
import { isMultiLineAiEnabled } from '@/lib/staffFeatures';
import { isUuid } from '@/lib/resolveSalesLineQuery';
import {
  assertLineAllowsOperationalWrite,
  type OperationalWriteGate,
} from '@/lib/retailerLineAccounts';
import { mapSalesLineAiProfile, type SalesLineAiProfile } from '@/lib/salesLineAiProfiles';
import type { LineStatus } from '@/types/database';

export type StaffAiKind = 'account' | 'line_level';
export type StaffAiMode = 'full' | 'research_only';

export const STAFF_AI_ERRORS = {
  missingLine: 'sales_line_id is required',
  invalidLine: 'sales_line_id must be a valid UUID',
  unknownLine: 'Unknown sales line',
  lineNotAllowed: 'This sales line cannot be used for staff AI',
  missingRla: 'retailer_line_account_id is required for account AI',
  invalidRla: 'retailer_line_account_id must be a valid UUID',
  rlaMismatch: 'retailer_line_account_id does not match this sales line and account',
  territoryNotPermitted: 'Territory assignment is not permitted for this sales line',
} as const;

export type StaffAiContext = {
  salesLineId: string;
  code: string;
  name: string;
  status: LineStatus;
  defaultCurrency: string | null;
  aiProfile: SalesLineAiProfile;
  retailerLineAccountId: string | null;
  retailerId: number | null;
  permittedTerritoryIds: string[];
  mode: StaffAiMode;
  operationalWriteGate: OperationalWriteGate;
};

export type ResolveStaffAiContextInput = {
  client: AgentSupabase;
  salesLineId: string | null | undefined;
  retailerLineAccountId?: string | null;
  prospectId?: number | null;
  territoryAssignmentId?: string | null;
  kind: StaffAiKind;
};

export type ResolveStaffAiContextResult =
  { ok: true; ctx: StaffAiContext } | { ok: false; status: 400; error: string };

function fail(error: string): ResolveStaffAiContextResult {
  return { ok: false, status: 400, error };
}

function parseUuidOrNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Flag off → ctx null (legacy OGR/BC). Flag on → resolve or 400. */
export async function gateStaffAiContext(
  input: ResolveStaffAiContextInput,
): Promise<{ ok: true; ctx: StaffAiContext | null } | { ok: false; status: 400; error: string }> {
  if (!isMultiLineAiEnabled()) {
    return { ok: true, ctx: null };
  }
  return resolveStaffAiContext(input);
}

export async function resolveStaffAiContext(
  input: ResolveStaffAiContextInput,
): Promise<ResolveStaffAiContextResult> {
  const salesLineId = parseUuidOrNull(input.salesLineId);
  if (!salesLineId) {
    return fail(STAFF_AI_ERRORS.missingLine);
  }
  if (!isUuid(salesLineId)) {
    return fail(STAFF_AI_ERRORS.invalidLine);
  }

  const { data: line, error: lineError } = await input.client
    .from('lines')
    .select('id, code, name, status, default_currency, ai_profile')
    .eq('id', salesLineId)
    .maybeSingle();

  if (lineError) return fail(lineError.message);
  if (!line) return fail(STAFF_AI_ERRORS.unknownLine);

  const status = line.status as LineStatus;
  if (line.code === 'bkg' || status === 'declined' || status === 'terminated') {
    return fail(STAFF_AI_ERRORS.lineNotAllowed);
  }

  const operationalWriteGate = assertLineAllowsOperationalWrite({
    code: line.code,
    status,
  });
  const mode: StaffAiMode = status === 'prospective' ? 'research_only' : 'full';
  if (status === 'prospective' && operationalWriteGate === 'reject') {
    // prospective is research-only, not a hard 400
  }

  const { data: territoryRows, error: territoryError } = await input.client
    .from('sales_line_territories')
    .select('id')
    .eq('sales_line_id', line.id);

  if (territoryError) return fail(territoryError.message);
  const permittedTerritoryIds = (territoryRows ?? []).map((row) => row.id);

  const namedTerritory = parseUuidOrNull(input.territoryAssignmentId);
  if (namedTerritory) {
    if (!isUuid(namedTerritory) || !permittedTerritoryIds.includes(namedTerritory)) {
      return fail(STAFF_AI_ERRORS.territoryNotPermitted);
    }
  }

  let retailerLineAccountId: string | null = null;
  let retailerId: number | null = input.prospectId ?? null;

  if (input.kind === 'account') {
    const rlaId = parseUuidOrNull(input.retailerLineAccountId);
    if (!rlaId) return fail(STAFF_AI_ERRORS.missingRla);
    if (!isUuid(rlaId)) return fail(STAFF_AI_ERRORS.invalidRla);

    const { data: rla, error: rlaError } = await input.client
      .from('retailer_line_accounts')
      .select('id, retailer_id, sales_line_id, relationship_status')
      .eq('id', rlaId)
      .maybeSingle();

    if (rlaError) return fail(rlaError.message);
    if (!rla) return fail(STAFF_AI_ERRORS.rlaMismatch);
    if (rla.sales_line_id !== line.id) return fail(STAFF_AI_ERRORS.rlaMismatch);
    if (rla.relationship_status === 'terminated') return fail(STAFF_AI_ERRORS.rlaMismatch);
    if (input.prospectId != null && rla.retailer_id !== input.prospectId) {
      return fail(STAFF_AI_ERRORS.rlaMismatch);
    }

    retailerLineAccountId = rla.id;
    retailerId = rla.retailer_id;
  }

  return {
    ok: true,
    ctx: {
      salesLineId: line.id,
      code: line.code,
      name: line.name,
      status,
      defaultCurrency: line.default_currency,
      aiProfile: mapSalesLineAiProfile(line.ai_profile),
      retailerLineAccountId,
      retailerId,
      permittedTerritoryIds,
      mode,
      operationalWriteGate,
    },
  };
}

export function parseOptionalPositiveInt(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return null;
}

export function parseOptionalUuidField(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}
