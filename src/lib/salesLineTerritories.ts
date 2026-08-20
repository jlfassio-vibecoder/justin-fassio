/**
 * Line-rights assignments (sales_line_territories). Location stays on prospects.territory_id.
 */

import type { AgentSupabase } from '@/lib/agentAuth';
import { insertRetailerFieldChange } from '@/lib/retailerFieldChanges';
import { supabase } from '@/lib/supabase';
import type { SalesLineTerritoryRightsType, SalesLineTerritoryStatus } from '@/types/database';

export const TERRITORY_ADMIN_ERRORS = {
  missingLine: 'sales_line_id is required',
  lineNotAllowed: 'This sales line cannot be used for territory admin',
  bigFishNotConfigured: 'Territories are not configured for this line',
  geoNotAllowed: 'This geography cannot be assigned to this sales line',
  assignmentInUse: 'Cannot delete an assignment that is still referenced by line accounts',
  inactiveAssignment: 'Only active territory assignments can be attached to a line account',
  rlaMismatch: 'Territory assignment does not match this sales line',
  unknownAssignment: 'Unknown territory assignment',
  unknownGeo: 'Unknown geography',
} as const;

export const OGR_ALLOWED_GEO = ['bc', 'or', 'wa'] as const;
export const EP_ALLOWED_GEO = ['or', 'wa', 'norcal'] as const;
export const ASSIGNABLE_SLT_STATUSES: readonly SalesLineTerritoryStatus[] = ['active'];

export type TerritoryAdminLine = {
  id: string;
  code: string;
  status: string;
};

export type SalesLineTerritoryAssignment = {
  id: string;
  salesLineId: string;
  territoryId: string;
  territoryCode: string;
  territoryName: string;
  countryCode: string | null;
  parentTerritoryCode: string | null;
  parentTerritoryName: string | null;
  geoLevel: string;
  geoStatus: string;
  rightsType: SalesLineTerritoryRightsType;
  status: SalesLineTerritoryStatus;
  effectiveDate: string | null;
  expirationDate: string | null;
  contractSource: string | null;
  restrictions: Record<string, unknown>;
  notes: string | null;
};

export type SalesLineTerritoryWriteInput = {
  territoryId?: string;
  territoryCode?: string;
  rightsType?: SalesLineTerritoryRightsType;
  status?: SalesLineTerritoryStatus;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  contractSource?: string | null;
  restrictions?: Record<string, unknown>;
  notes?: string | null;
};

export function parseTerritoryAdminLineCode(
  code: string | undefined,
): { ok: true; code: string } | { ok: false; status: 400; error: string } {
  const normalized = code?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.missingLine };
  }
  return { ok: true, code: normalized };
}

export function allowedGeoCodesForLine(code: string): readonly string[] | null {
  if (code === 'ogr') return OGR_ALLOWED_GEO;
  if (code === 'eagle-peak') return EP_ALLOWED_GEO;
  return null;
}

export function suggestedAssignmentForLocation(
  assignments: SalesLineTerritoryAssignment[],
  locationCode: string | null | undefined,
): SalesLineTerritoryAssignment | null {
  const code = locationCode?.trim().toLowerCase();
  if (!code) return null;
  return (
    assignments.find(
      (row) => row.territoryCode === code && ASSIGNABLE_SLT_STATUSES.includes(row.status),
    ) ?? null
  );
}

export function canReadTerritoryAdmin(line: { code: string; status: string }): boolean {
  if (line.code === 'bkg') return false;
  return (
    line.status !== 'prospective' && line.status !== 'declined' && line.status !== 'terminated'
  );
}

export function assertTerritoryAdminWrite(line: {
  code: string;
  status: string;
}): { ok: true } | { ok: false; status: 400 | 403; error: string } {
  if (!canReadTerritoryAdmin(line)) {
    return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.lineNotAllowed };
  }
  if (line.code === 'big-fish') {
    return { ok: false, status: 403, error: TERRITORY_ADMIN_ERRORS.bigFishNotConfigured };
  }
  if (line.code === 'ogr' || line.code === 'eagle-peak') return { ok: true };
  return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.lineNotAllowed };
}

export function isGeoAllowedForLine(lineCode: string, geoCode: string): boolean {
  const allowed = allowedGeoCodesForLine(lineCode);
  return Boolean(allowed?.includes(geoCode));
}

type GeoRow = {
  id: string;
  code: string;
  name: string;
  level: string;
  status: string;
  parent_territory_id: string | null;
  country_code: string | null;
};

function mapAssignment(
  row: {
    id: string;
    sales_line_id: string;
    territory_id: string;
    rights_type: SalesLineTerritoryRightsType;
    status: SalesLineTerritoryStatus;
    effective_date: string | null;
    expiration_date: string | null;
    contract_source: string | null;
    restrictions: Record<string, unknown> | null;
    notes: string | null;
  },
  geo: GeoRow,
  parent: { code: string; name: string } | null,
): SalesLineTerritoryAssignment {
  return {
    id: row.id,
    salesLineId: row.sales_line_id,
    territoryId: row.territory_id,
    territoryCode: geo.code,
    territoryName: geo.name,
    countryCode: geo.country_code,
    parentTerritoryCode: parent?.code ?? null,
    parentTerritoryName: parent?.name ?? null,
    geoLevel: geo.level,
    geoStatus: geo.status,
    rightsType: row.rights_type,
    status: row.status,
    effectiveDate: row.effective_date,
    expirationDate: row.expiration_date,
    contractSource: row.contract_source,
    restrictions: row.restrictions ?? {},
    notes: row.notes,
  };
}

async function loadGeoMap(
  client: AgentSupabase,
  ids: string[],
): Promise<{ ok: true; geos: Map<string, GeoRow> } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true, geos: new Map() };
  const { data, error } = await client
    .from('territories')
    .select('id, code, name, level, status, parent_territory_id, country_code')
    .in('id', ids);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    geos: new Map((data ?? []).map((row) => [row.id, row as GeoRow])),
  };
}

export async function fetchSalesLineTerritories(
  client: AgentSupabase,
  salesLineId: string,
): Promise<{ data: SalesLineTerritoryAssignment[]; error: string | null }> {
  const { data, error } = await client
    .from('sales_line_territories')
    .select(
      'id, sales_line_id, territory_id, rights_type, status, effective_date, expiration_date, contract_source, restrictions, notes',
    )
    .eq('sales_line_id', salesLineId)
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: error.message };

  const rows = data ?? [];
  const geoIds = [...new Set(rows.map((row) => row.territory_id))];
  const geos = await loadGeoMap(client, geoIds);
  if (!geos.ok) return { data: [], error: geos.error };

  const parentIds = [
    ...new Set(
      [...geos.geos.values()]
        .map((geo) => geo.parent_territory_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const parents = await loadGeoMap(client, parentIds);
  if (!parents.ok) return { data: [], error: parents.error };

  return {
    data: rows.map((row) => {
      const geo = geos.geos.get(row.territory_id);
      const parent = geo?.parent_territory_id
        ? (parents.geos.get(geo.parent_territory_id) ?? null)
        : null;
      return mapAssignment(
        {
          ...row,
          rights_type: row.rights_type as SalesLineTerritoryRightsType,
          status: row.status as SalesLineTerritoryStatus,
          restrictions: (row.restrictions ?? {}) as Record<string, unknown>,
        },
        geo ?? {
          id: row.territory_id,
          code: 'unknown',
          name: 'Unknown',
          level: 'province_state',
          status: 'active',
          parent_territory_id: null,
          country_code: null,
        },
        parent ? { code: parent.code, name: parent.name } : null,
      );
    }),
    error: null,
  };
}

async function resolveGeo(
  client: AgentSupabase,
  input: { territoryId?: string; territoryCode?: string },
): Promise<{ ok: true; geo: GeoRow } | { ok: false; error: string }> {
  if (input.territoryId?.trim()) {
    const { data, error } = await client
      .from('territories')
      .select('id, code, name, level, status, parent_territory_id, country_code')
      .eq('id', input.territoryId.trim())
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: TERRITORY_ADMIN_ERRORS.unknownGeo };
    return { ok: true, geo: data as GeoRow };
  }
  const code = input.territoryCode?.trim().toLowerCase();
  if (!code) return { ok: false, error: TERRITORY_ADMIN_ERRORS.unknownGeo };
  const { data, error } = await client
    .from('territories')
    .select('id, code, name, level, status, parent_territory_id, country_code')
    .eq('code', code)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: TERRITORY_ADMIN_ERRORS.unknownGeo };
  return { ok: true, geo: data as GeoRow };
}

export async function createSalesLineTerritory(
  client: AgentSupabase,
  line: TerritoryAdminLine,
  input: SalesLineTerritoryWriteInput,
): Promise<
  | { ok: true; assignment: SalesLineTerritoryAssignment }
  | { ok: false; status: number; error: string }
> {
  const gate = assertTerritoryAdminWrite(line);
  if (!gate.ok) return gate;
  const geo = await resolveGeo(client, input);
  if (!geo.ok) return { ok: false, status: 400, error: geo.error };
  if (!isGeoAllowedForLine(line.code, geo.geo.code)) {
    return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.geoNotAllowed };
  }

  const { data, error } = await client
    .from('sales_line_territories')
    .insert({
      sales_line_id: line.id,
      territory_id: geo.geo.id,
      rights_type: input.rightsType ?? 'unconfirmed',
      status: input.status ?? 'proposed',
      effective_date: input.effectiveDate ?? null,
      expiration_date: input.expirationDate ?? null,
      contract_source: input.contractSource ?? null,
      restrictions: input.restrictions ?? {},
      notes: input.notes ?? null,
    })
    .select(
      'id, sales_line_id, territory_id, rights_type, status, effective_date, expiration_date, contract_source, restrictions, notes',
    )
    .single();
  if (error) return { ok: false, status: 400, error: error.message };
  return {
    ok: true,
    assignment: mapAssignment(
      {
        ...data,
        rights_type: data.rights_type as SalesLineTerritoryRightsType,
        status: data.status as SalesLineTerritoryStatus,
        restrictions: (data.restrictions ?? {}) as Record<string, unknown>,
      },
      geo.geo,
      null,
    ),
  };
}

export async function updateSalesLineTerritory(
  client: AgentSupabase,
  line: TerritoryAdminLine,
  assignmentId: string,
  input: SalesLineTerritoryWriteInput,
): Promise<
  | { ok: true; assignment: SalesLineTerritoryAssignment }
  | { ok: false; status: number; error: string }
> {
  const gate = assertTerritoryAdminWrite(line);
  if (!gate.ok) return gate;

  const { data: existing, error: existingError } = await client
    .from('sales_line_territories')
    .select(
      'id, sales_line_id, territory_id, rights_type, status, effective_date, expiration_date, contract_source, restrictions, notes',
    )
    .eq('id', assignmentId)
    .eq('sales_line_id', line.id)
    .maybeSingle();
  if (existingError) return { ok: false, status: 400, error: existingError.message };
  if (!existing) return { ok: false, status: 404, error: TERRITORY_ADMIN_ERRORS.unknownAssignment };

  let nextTerritoryId = existing.territory_id;
  let geo: GeoRow | null = null;
  if (input.territoryId || input.territoryCode) {
    const resolved = await resolveGeo(client, input);
    if (!resolved.ok) return { ok: false, status: 400, error: resolved.error };
    if (!isGeoAllowedForLine(line.code, resolved.geo.code)) {
      return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.geoNotAllowed };
    }
    nextTerritoryId = resolved.geo.id;
    geo = resolved.geo;
  }

  const { data, error } = await client
    .from('sales_line_territories')
    .update({
      territory_id: nextTerritoryId,
      rights_type: input.rightsType ?? existing.rights_type,
      status: input.status ?? existing.status,
      effective_date:
        input.effectiveDate === undefined ? existing.effective_date : input.effectiveDate,
      expiration_date:
        input.expirationDate === undefined ? existing.expiration_date : input.expirationDate,
      contract_source:
        input.contractSource === undefined ? existing.contract_source : input.contractSource,
      restrictions: input.restrictions ?? existing.restrictions ?? {},
      notes: input.notes === undefined ? existing.notes : input.notes,
    })
    .eq('id', assignmentId)
    .eq('sales_line_id', line.id)
    .select(
      'id, sales_line_id, territory_id, rights_type, status, effective_date, expiration_date, contract_source, restrictions, notes',
    )
    .single();
  if (error) return { ok: false, status: 400, error: error.message };

  if (!geo) {
    const loaded = await resolveGeo(client, { territoryId: data.territory_id });
    if (!loaded.ok) return { ok: false, status: 400, error: loaded.error };
    geo = loaded.geo;
  }

  return {
    ok: true,
    assignment: mapAssignment(
      {
        ...data,
        rights_type: data.rights_type as SalesLineTerritoryRightsType,
        status: data.status as SalesLineTerritoryStatus,
        restrictions: (data.restrictions ?? {}) as Record<string, unknown>,
      },
      geo,
      null,
    ),
  };
}

export async function deleteSalesLineTerritory(
  client: AgentSupabase,
  line: TerritoryAdminLine,
  assignmentId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const gate = assertTerritoryAdminWrite(line);
  if (!gate.ok) return gate;

  const { data: existing, error: existingError } = await client
    .from('sales_line_territories')
    .select('id')
    .eq('id', assignmentId)
    .eq('sales_line_id', line.id)
    .maybeSingle();
  if (existingError) return { ok: false, status: 400, error: existingError.message };
  if (!existing) return { ok: false, status: 404, error: TERRITORY_ADMIN_ERRORS.unknownAssignment };

  const { count, error: countError } = await client
    .from('retailer_line_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('sales_line_territory_id', assignmentId);
  if (countError) return { ok: false, status: 400, error: countError.message };
  if ((count ?? 0) > 0) {
    return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.assignmentInUse };
  }

  const { error } = await client
    .from('sales_line_territories')
    .delete()
    .eq('id', assignmentId)
    .eq('sales_line_id', line.id);
  if (error) return { ok: false, status: 400, error: error.message };
  return { ok: true };
}

export async function assignRetailerLineTerritory(
  client: AgentSupabase,
  input: {
    retailerLineAccountId: string;
    salesLineTerritoryId: string | null;
    actorId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: rla, error: rlaError } = await client
    .from('retailer_line_accounts')
    .select('id, retailer_id, sales_line_id, sales_line_territory_id, relationship_status')
    .eq('id', input.retailerLineAccountId)
    .maybeSingle();
  if (rlaError) return { ok: false, status: 400, error: rlaError.message };
  if (!rla) return { ok: false, status: 404, error: 'Line account not found' };

  const { data: line, error: lineError } = await client
    .from('lines')
    .select('id, code, status')
    .eq('id', rla.sales_line_id)
    .maybeSingle();
  if (lineError) return { ok: false, status: 400, error: lineError.message };
  if (!line) return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.lineNotAllowed };
  const writeGate = assertTerritoryAdminWrite(line);
  if (!writeGate.ok) return writeGate;

  const nextId: string | null = input.salesLineTerritoryId;
  if (nextId) {
    const { data: slt, error: sltError } = await client
      .from('sales_line_territories')
      .select('id, sales_line_id, status')
      .eq('id', nextId)
      .maybeSingle();
    if (sltError) return { ok: false, status: 400, error: sltError.message };
    if (!slt || slt.sales_line_id !== rla.sales_line_id) {
      return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.rlaMismatch };
    }
    if (!ASSIGNABLE_SLT_STATUSES.includes(slt.status as SalesLineTerritoryStatus)) {
      return { ok: false, status: 400, error: TERRITORY_ADMIN_ERRORS.inactiveAssignment };
    }
  }

  const { error } = await client
    .from('retailer_line_accounts')
    .update({ sales_line_territory_id: nextId })
    .eq('id', rla.id)
    .eq('sales_line_id', rla.sales_line_id);
  if (error) return { ok: false, status: 400, error: error.message };

  const audit = await insertRetailerFieldChange(client, {
    retailerId: rla.retailer_id,
    fieldPath: 'sales_line_territory_id',
    oldValue: rla.sales_line_territory_id,
    newValue: nextId,
    source: 'user',
    actorId: input.actorId ?? null,
    salesLineId: rla.sales_line_id,
    retailerLineAccountId: rla.id,
  });
  if (!audit.ok) return { ok: false, status: 400, error: audit.error };
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

export type AssignableGeo = {
  id: string;
  code: string;
  name: string;
  parentCode: string | null;
  parentName: string | null;
};

export async function fetchAssignableGeosClient(
  lineCode: string,
): Promise<{ ok: true; geos: AssignableGeo[] } | { ok: false; error: string }> {
  const allowed = allowedGeoCodesForLine(lineCode);
  if (!allowed) return { ok: true, geos: [] };
  const { data, error } = await supabase
    .from('territories')
    .select('id, code, name, parent_territory_id')
    .in('code', [...allowed]);
  if (error) return { ok: false, error: error.message };
  const rows = data ?? [];
  const parentIds = [
    ...new Set(
      rows.map((row) => row.parent_territory_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  let parents: Array<{ id: string; code: string; name: string }> = [];
  if (parentIds.length > 0) {
    const parentResult = await supabase
      .from('territories')
      .select('id, code, name')
      .in('id', parentIds);
    if (parentResult.error) return { ok: false, error: parentResult.error.message };
    parents = parentResult.data ?? [];
  }
  const parentById = new Map(parents.map((row) => [row.id, row]));
  return {
    ok: true,
    geos: rows.map((row) => {
      const parent = row.parent_territory_id
        ? (parentById.get(row.parent_territory_id) ?? null)
        : null;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        parentCode: parent?.code ?? null,
        parentName: parent?.name ?? null,
      };
    }),
  };
}

export async function fetchSalesLineTerritoriesClient(
  lineCode: string,
): Promise<
  { ok: true; assignments: SalesLineTerritoryAssignment[] } | { ok: false; error: string }
> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return auth;
  const res = await fetch(`/api/staff/lines/${encodeURIComponent(lineCode)}/territories`, {
    headers: auth.headers,
  });
  const payload = (await res.json()) as {
    ok?: boolean;
    assignments?: SalesLineTerritoryAssignment[];
    error?: string;
  };
  if (!res.ok || !payload.ok) {
    return { ok: false, error: payload.error ?? `Request failed (${res.status})` };
  }
  return { ok: true, assignments: payload.assignments ?? [] };
}

export async function saveSalesLineTerritoryClient(
  lineCode: string,
  input: SalesLineTerritoryWriteInput & { assignmentId?: string },
): Promise<{ ok: true; assignment: SalesLineTerritoryAssignment } | { ok: false; error: string }> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return auth;
  const assignmentId = input.assignmentId;
  const url = assignmentId
    ? `/api/staff/lines/${encodeURIComponent(lineCode)}/territories/${encodeURIComponent(assignmentId)}`
    : `/api/staff/lines/${encodeURIComponent(lineCode)}/territories`;
  const res = await fetch(url, {
    method: assignmentId ? 'PATCH' : 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = (await res.json()) as {
    ok?: boolean;
    assignment?: SalesLineTerritoryAssignment;
    error?: string;
  };
  if (!res.ok || !payload.ok || !payload.assignment) {
    return { ok: false, error: payload.error ?? `Request failed (${res.status})` };
  }
  return { ok: true, assignment: payload.assignment };
}

export async function assignRetailerLineTerritoryClient(input: {
  retailerLineAccountId: string;
  salesLineTerritoryId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await staffAuthHeaders();
  if (!auth.ok) return auth;
  const res = await fetch(
    `/api/staff/line-accounts/${encodeURIComponent(input.retailerLineAccountId)}/territory`,
    {
      method: 'PATCH',
      headers: { ...auth.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ salesLineTerritoryId: input.salesLineTerritoryId }),
    },
  );
  const payload = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !payload.ok) {
    return { ok: false, error: payload.error ?? `Request failed (${res.status})` };
  }
  return { ok: true };
}
