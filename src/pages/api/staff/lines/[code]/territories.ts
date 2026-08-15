import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  assertTerritoryAdminWrite,
  canReadTerritoryAdmin,
  createSalesLineTerritory,
  fetchSalesLineTerritories,
  parseTerritoryAdminLineCode,
  TERRITORY_ADMIN_ERRORS,
  type SalesLineTerritoryWriteInput,
  type TerritoryAdminLine,
} from '@/lib/salesLineTerritories';
import { isLineTerritoryAdminEnabled } from '@/lib/staffFeatures';
import type { SalesLineTerritoryRightsType, SalesLineTerritoryStatus } from '@/types/database';

export const prerender = false;

const RIGHTS: readonly SalesLineTerritoryRightsType[] = [
  'exclusive',
  'limited_exclusive',
  'non_exclusive',
  'unconfirmed',
];
const STATUSES: readonly SalesLineTerritoryStatus[] = ['proposed', 'active', 'expired', 'disputed'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadLine(
  client: Parameters<typeof fetchSalesLineTerritories>[0],
  code: string | undefined,
): Promise<{ ok: true; line: TerritoryAdminLine } | { ok: false; status: number; error: string }> {
  const parsed = parseTerritoryAdminLineCode(code);
  if (!parsed.ok) return parsed;
  const normalized = parsed.code;
  const { data, error } = await client
    .from('lines')
    .select('id, code, status')
    .eq('code', normalized)
    .maybeSingle();
  if (error) return { ok: false, status: 400, error: error.message };
  if (!data) return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.lineNotAllowed };
  if (!canReadTerritoryAdmin(data)) {
    return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.lineNotAllowed };
  }
  return { ok: true, line: { id: data.id, code: data.code, status: data.status } };
}

function parseWriteBody(body: Record<string, unknown>): SalesLineTerritoryWriteInput {
  const rightsType =
    typeof body.rightsType === 'string' &&
    RIGHTS.includes(body.rightsType as SalesLineTerritoryRightsType)
      ? (body.rightsType as SalesLineTerritoryRightsType)
      : undefined;
  const status =
    typeof body.status === 'string' && STATUSES.includes(body.status as SalesLineTerritoryStatus)
      ? (body.status as SalesLineTerritoryStatus)
      : undefined;
  return {
    territoryId: typeof body.territoryId === 'string' ? body.territoryId : undefined,
    territoryCode: typeof body.territoryCode === 'string' ? body.territoryCode : undefined,
    rightsType,
    status,
    effectiveDate:
      typeof body.effectiveDate === 'string' || body.effectiveDate === null
        ? body.effectiveDate
        : undefined,
    expirationDate:
      typeof body.expirationDate === 'string' || body.expirationDate === null
        ? body.expirationDate
        : undefined,
    contractSource:
      typeof body.contractSource === 'string' || body.contractSource === null
        ? body.contractSource
        : undefined,
    restrictions:
      body.restrictions &&
      typeof body.restrictions === 'object' &&
      !Array.isArray(body.restrictions)
        ? (body.restrictions as Record<string, unknown>)
        : undefined,
    notes: typeof body.notes === 'string' || body.notes === null ? body.notes : undefined,
  };
}

export const GET: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const loaded = await loadLine(gate.supabase, params.code);
  if (!loaded.ok) return json({ ok: false, error: loaded.error }, loaded.status);

  const result = await fetchSalesLineTerritories(gate.supabase, loaded.line.id);
  if (result.error) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, assignments: result.data });
};

export const POST: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;
  if (!isLineTerritoryAdminEnabled()) {
    return json({ ok: false, error: 'Territory admin is not enabled' }, 403);
  }

  const loaded = await loadLine(gate.supabase, params.code);
  if (!loaded.ok) return json({ ok: false, error: loaded.error }, loaded.status);
  const writeGate = assertTerritoryAdminWrite(loaded.line);
  if (!writeGate.ok) return json({ ok: false, error: writeGate.error }, writeGate.status);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await createSalesLineTerritory(gate.supabase, loaded.line, parseWriteBody(body));
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, assignment: result.assignment });
};
