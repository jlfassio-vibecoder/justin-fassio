/**
 * Phase 5 territory administration — flag, geo allowlists, same-line RLA confirm,
 * and unchanged AI / enrich / prep writers.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';
import {
  assertTerritoryAdminWrite,
  assignRetailerLineTerritory,
  canReadTerritoryAdmin,
  createSalesLineTerritory,
  deleteSalesLineTerritory,
  isGeoAllowedForLine,
  parseTerritoryAdminLineCode,
  suggestedAssignmentForLocation,
  TERRITORY_ADMIN_ERRORS,
  updateSalesLineTerritory,
  type SalesLineTerritoryAssignment,
  type TerritoryAdminLine,
} from '@/lib/salesLineTerritories';
import {
  getStaffFeatureFlags,
  isLineTerritoryAdminEnabled,
  parseFeatureFlag,
} from '@/lib/staffFeatures';

const root = process.cwd();

const EP_LINE: TerritoryAdminLine = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'eagle-peak',
  status: 'onboarding',
};
const OGR_LINE: TerritoryAdminLine = {
  id: '00000000-0000-4000-8000-0000000000aa',
  code: 'ogr',
  status: 'active',
};
const BF_LINE: TerritoryAdminLine = {
  id: '22222222-2222-4222-8222-222222222222',
  code: 'big-fish',
  status: 'confirmed',
};
const BKG_LINE: TerritoryAdminLine = {
  id: '33333333-3333-4333-8333-333333333333',
  code: 'bkg',
  status: 'paused',
};

const OR_GEO = {
  id: 'or-geo',
  code: 'or',
  name: 'Oregon',
  level: 'province_state',
  status: 'active',
  parent_territory_id: null,
  country_code: 'US',
};

type MockOpts = {
  geo?: typeof OR_GEO | null;
  existingSlt?: {
    id: string;
    sales_line_id: string;
    territory_id: string;
    rights_type: string;
    status: string;
    effective_date: string | null;
    expiration_date: string | null;
    contract_source: string | null;
    restrictions: Record<string, unknown>;
    notes: string | null;
  } | null;
  rla?: {
    id: string;
    retailer_id: number;
    sales_line_id: string;
    sales_line_territory_id: string | null;
    relationship_status: string;
  } | null;
  sltForAssign?: { id: string; sales_line_id: string; status: string } | null;
  rlaCount?: number;
  line?: TerritoryAdminLine | null;
};

function mockClient(opts: MockOpts = {}) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const updates: { table: string; row: Record<string, unknown> }[] = [];
  const deletes: string[] = [];

  const from = (table: string) => {
    const resultForSelect = () => {
      if (table === 'territories')
        return { data: opts.geo === undefined ? OR_GEO : opts.geo, error: null };
      if (table === 'sales_line_territories') {
        return { data: opts.existingSlt ?? opts.sltForAssign ?? null, error: null };
      }
      if (table === 'retailer_line_accounts') {
        return { data: opts.rla ?? null, error: null, count: opts.rlaCount ?? 0 };
      }
      if (table === 'lines') {
        return { data: opts.line === undefined ? OGR_LINE : opts.line, error: null };
      }
      return { data: null, error: null };
    };

    const api: Record<string, unknown> = {};
    const next = () => api;
    api.select = next;
    api.insert = (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return api;
    };
    api.update = (row: Record<string, unknown>) => {
      updates.push({ table, row });
      return api;
    };
    api.delete = () => {
      deletes.push(table);
      return api;
    };
    api.eq = next;
    api.neq = next;
    api.in = next;
    api.order = next;
    api.maybeSingle = async () => resultForSelect();
    api.single = async () => {
      if (table === 'sales_line_territories') {
        const last = [...inserts, ...updates].reverse().find((item) => item.table === table);
        const row = last?.row ?? {};
        return {
          data: {
            id: opts.existingSlt?.id ?? 'new-slt',
            sales_line_id: row.sales_line_id ?? EP_LINE.id,
            territory_id: row.territory_id ?? OR_GEO.id,
            rights_type: row.rights_type ?? 'unconfirmed',
            status: row.status ?? 'proposed',
            effective_date: row.effective_date ?? null,
            expiration_date: row.expiration_date ?? null,
            contract_source: row.contract_source ?? null,
            restrictions: row.restrictions ?? {},
            notes: row.notes ?? null,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };
    api.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resultForSelect()).then(resolve);
    return api;
  };

  return { client: { from } as unknown as AgentSupabase, inserts, updates, deletes };
}

describe('Phase 5 FEATURE_LINE_TERRITORY_ADMIN flag', () => {
  it('defaults off; snapshot is false without UI; no PUBLIC_ flag', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    const prevAdmin = process.env.FEATURE_LINE_TERRITORY_ADMIN;
    const prevUi = process.env.FEATURE_MULTI_LINE_UI;
    delete process.env.FEATURE_LINE_TERRITORY_ADMIN;
    delete process.env.FEATURE_MULTI_LINE_UI;
    expect(isLineTerritoryAdminEnabled()).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_LINE_TERRITORY_ADMIN).toBe(false);

    process.env.FEATURE_LINE_TERRITORY_ADMIN = '1';
    expect(isLineTerritoryAdminEnabled()).toBe(true);
    expect(getStaffFeatureFlags().FEATURE_LINE_TERRITORY_ADMIN).toBe(false);

    process.env.FEATURE_MULTI_LINE_UI = '1';
    expect(getStaffFeatureFlags().FEATURE_LINE_TERRITORY_ADMIN).toBe(true);

    if (prevAdmin !== undefined) process.env.FEATURE_LINE_TERRITORY_ADMIN = prevAdmin;
    else delete process.env.FEATURE_LINE_TERRITORY_ADMIN;
    if (prevUi !== undefined) process.env.FEATURE_MULTI_LINE_UI = prevUi;
    else delete process.env.FEATURE_MULTI_LINE_UI;

    const staff = readFileSync(resolve(root, 'src/lib/staffFeatures.ts'), 'utf8');
    expect(staff).toMatch(/FEATURE_LINE_TERRITORY_ADMIN/);
    expect(staff).toMatch(/isLineTerritoryAdminEnabled/);
    expect(staff).not.toMatch(/PUBLIC_FEATURE_LINE_TERRITORY_ADMIN/);
    const gate = readFileSync(resolve(root, 'src/components/auth/AuthGate.tsx'), 'utf8');
    expect(gate).toMatch(/FEATURE_LINE_TERRITORY_ADMIN/);
    expect(gate).toMatch(/multiLineTerritoryAdmin/);
    const api = readFileSync(resolve(root, 'src/pages/api/staff/features.ts'), 'utf8');
    expect(api).toMatch(/getStaffFeatureFlags/);
    expect(api).not.toMatch(/PUBLIC_FEATURE_LINE_TERRITORY_ADMIN/);
  });
});

describe('Phase 5 flag-off client write path', () => {
  it('panel and drawer only write when the admin snapshot is on', () => {
    const panel = readFileSync(
      resolve(root, 'src/components/tabs/LineTerritoriesPanel.tsx'),
      'utf8',
    );
    expect(panel).toMatch(/multiLineTerritoryAdmin/);
    expect(panel).toMatch(/saveSalesLineTerritoryClient/);
    expect(panel).toMatch(/canWrite/);
    expect(panel).not.toMatch(/import\.meta\.env\.FEATURE_LINE_TERRITORY_ADMIN/);

    const drawer = readFileSync(resolve(root, 'src/components/AccountDetailDrawer.tsx'), 'utf8');
    expect(drawer).toMatch(/multiLineTerritoryAdmin/);
    expect(drawer).toMatch(/assignRetailerLineTerritoryClient/);
    expect(drawer).toMatch(/Unassigned/);
    expect(drawer).toMatch(/Suggested from store location/);

    const tabNav = readFileSync(resolve(root, 'src/components/TabNav.tsx'), 'utf8');
    expect(tabNav).not.toMatch(/territories/);

    const header = readFileSync(resolve(root, 'src/components/Header.tsx'), 'utf8');
    expect(header).toMatch(/territoriesHref/);
    expect(header).toMatch(/Territories/);
  });
});

describe('Phase 5 line + geo allowlists', () => {
  it('flag on + missing line → 400', () => {
    const missing = parseTerritoryAdminLineCode(undefined);
    expect(missing).toEqual({
      ok: false,
      status: 400,
      error: TERRITORY_ADMIN_ERRORS.missingLine,
    });
    const listApi = readFileSync(
      resolve(root, 'src/pages/api/staff/lines/[code]/territories.ts'),
      'utf8',
    );
    expect(listApi).toMatch(/parseTerritoryAdminLineCode/);
    expect(listApi).toMatch(/isLineTerritoryAdminEnabled/);
    expect(listApi).toMatch(/requireApprovedStaffClient/);
    expect(listApi).toMatch(/export const prerender = false/);
    expect(listApi).not.toMatch(/SERVICE_ROLE/);
  });

  it('EP create OR inserts only Eagle Peak SLT', async () => {
    const { client, inserts, updates } = mockClient({ geo: OR_GEO });
    const result = await createSalesLineTerritory(client, EP_LINE, { territoryCode: 'or' });
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe('sales_line_territories');
    expect(inserts[0]?.row.sales_line_id).toBe(EP_LINE.id);
    expect(inserts[0]?.row.territory_id).toBe(OR_GEO.id);
    expect(inserts[0]?.row.rights_type).toBe('unconfirmed');
    expect(inserts[0]?.row.status).toBe('proposed');
    expect(updates).toHaveLength(0);
    expect(inserts.some((row) => row.row.sales_line_id === OGR_LINE.id)).toBe(false);
  });

  it('rejects OGR CA/AB/norcal and EP ca/bc', async () => {
    expect(isGeoAllowedForLine('ogr', 'bc')).toBe(true);
    expect(isGeoAllowedForLine('ogr', 'or')).toBe(true);
    expect(isGeoAllowedForLine('ogr', 'wa')).toBe(true);
    expect(isGeoAllowedForLine('ogr', 'ca')).toBe(false);
    expect(isGeoAllowedForLine('ogr', 'ab')).toBe(false);
    expect(isGeoAllowedForLine('ogr', 'norcal')).toBe(false);
    expect(isGeoAllowedForLine('eagle-peak', 'or')).toBe(true);
    expect(isGeoAllowedForLine('eagle-peak', 'wa')).toBe(true);
    expect(isGeoAllowedForLine('eagle-peak', 'norcal')).toBe(true);
    expect(isGeoAllowedForLine('eagle-peak', 'ca')).toBe(false);
    expect(isGeoAllowedForLine('eagle-peak', 'bc')).toBe(false);

    const ogrCa = await createSalesLineTerritory(
      mockClient({ geo: { ...OR_GEO, code: 'ca' } }).client,
      OGR_LINE,
      {
        territoryCode: 'ca',
      },
    );
    expect(ogrCa.ok).toBe(false);
    if (!ogrCa.ok) expect(ogrCa.error).toBe(TERRITORY_ADMIN_ERRORS.geoNotAllowed);

    const epCa = await createSalesLineTerritory(
      mockClient({ geo: { ...OR_GEO, code: 'ca' } }).client,
      EP_LINE,
      {
        territoryCode: 'ca',
      },
    );
    expect(epCa.ok).toBe(false);
    if (!epCa.ok) expect(epCa.error).toBe(TERRITORY_ADMIN_ERRORS.geoNotAllowed);
  });

  it('rejects Big Fish and bkg writes', () => {
    expect(canReadTerritoryAdmin(BKG_LINE)).toBe(false);
    expect(assertTerritoryAdminWrite(BKG_LINE)).toEqual({
      ok: false,
      status: 400,
      error: TERRITORY_ADMIN_ERRORS.lineNotAllowed,
    });
    expect(assertTerritoryAdminWrite(BF_LINE)).toEqual({
      ok: false,
      status: 403,
      error: TERRITORY_ADMIN_ERRORS.bigFishNotConfigured,
    });
    expect(assertTerritoryAdminWrite({ code: 'ogr', status: 'prospective' })).toEqual({
      ok: false,
      status: 400,
      error: TERRITORY_ADMIN_ERRORS.lineNotAllowed,
    });
  });

  it('rejects RLA assign to another line’s SLT', async () => {
    const { client, updates } = mockClient({
      rla: {
        id: 'rla-1',
        retailer_id: 1,
        sales_line_id: OGR_LINE.id,
        sales_line_territory_id: null,
        relationship_status: 'opened',
      },
      sltForAssign: { id: 'slt-ep', sales_line_id: EP_LINE.id, status: 'active' },
    });
    const result = await assignRetailerLineTerritory(client, {
      retailerLineAccountId: 'rla-1',
      salesLineTerritoryId: 'slt-ep',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(TERRITORY_ADMIN_ERRORS.rlaMismatch);
    expect(updates).toHaveLength(0);
  });

  it('rejects RLA assign on Big Fish / bkg even if an SLT row exists', async () => {
    const { client, updates } = mockClient({
      line: BF_LINE,
      rla: {
        id: 'rla-bf',
        retailer_id: 1,
        sales_line_id: BF_LINE.id,
        sales_line_territory_id: null,
        relationship_status: 'opened',
      },
      sltForAssign: { id: 'slt-bf', sales_line_id: BF_LINE.id, status: 'active' },
    });
    const result = await assignRetailerLineTerritory(client, {
      retailerLineAccountId: 'rla-bf',
      salesLineTerritoryId: 'slt-bf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(TERRITORY_ADMIN_ERRORS.bigFishNotConfigured);
    expect(updates).toHaveLength(0);
  });

  it('rejects new RLA assigns unless the assignment is active', async () => {
    for (const status of ['proposed', 'disputed', 'expired'] as const) {
      const { client, updates } = mockClient({
        rla: {
          id: 'rla-1',
          retailer_id: 1,
          sales_line_id: OGR_LINE.id,
          sales_line_territory_id: null,
          relationship_status: 'opened',
        },
        sltForAssign: { id: 'slt-or', sales_line_id: OGR_LINE.id, status },
      });
      const result = await assignRetailerLineTerritory(client, {
        retailerLineAccountId: 'rla-1',
        salesLineTerritoryId: 'slt-or',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(TERRITORY_ADMIN_ERRORS.inactiveAssignment);
      expect(updates).toHaveLength(0);
    }
  });

  it('expires a referenced assignment and blocks hard delete', async () => {
    const existingSlt = {
      id: 'slt-or',
      sales_line_id: OGR_LINE.id,
      territory_id: OR_GEO.id,
      rights_type: 'unconfirmed' as const,
      status: 'active',
      effective_date: null,
      expiration_date: null,
      contract_source: null,
      restrictions: {},
      notes: null,
    };
    const expireMock = mockClient({ existingSlt, geo: OR_GEO, rlaCount: 2 });
    const expired = await updateSalesLineTerritory(expireMock.client, OGR_LINE, 'slt-or', {
      status: 'expired',
    });
    expect(expired.ok).toBe(true);
    expect(
      expireMock.updates.some(
        (row) => row.table === 'sales_line_territories' && row.row.status === 'expired',
      ),
    ).toBe(true);

    const deleteMock = mockClient({ existingSlt, rlaCount: 2 });
    const blocked = await deleteSalesLineTerritory(deleteMock.client, OGR_LINE, 'slt-or');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe(TERRITORY_ADMIN_ERRORS.assignmentInUse);
    expect(deleteMock.deletes).toHaveLength(0);

    const free = mockClient({ existingSlt, rlaCount: 0 });
    const removed = await deleteSalesLineTerritory(free.client, OGR_LINE, 'slt-or');
    expect(removed.ok).toBe(true);
    expect(free.deletes).toContain('sales_line_territories');
  });

  it('suggests a same-geo assignment from retailer location only', () => {
    const orRow: SalesLineTerritoryAssignment = {
      id: 'slt-or',
      salesLineId: OGR_LINE.id,
      territoryId: OR_GEO.id,
      territoryCode: 'or',
      territoryName: 'Oregon',
      countryCode: 'US',
      parentTerritoryCode: null,
      parentTerritoryName: null,
      geoLevel: 'province_state',
      geoStatus: 'active',
      rightsType: 'unconfirmed',
      status: 'active',
      effectiveDate: null,
      expirationDate: null,
      contractSource: null,
      restrictions: {},
      notes: null,
    };
    expect(suggestedAssignmentForLocation([orRow], 'or')?.id).toBe('slt-or');
    expect(suggestedAssignmentForLocation([orRow], 'ca')).toBeNull();
    expect(suggestedAssignmentForLocation([{ ...orRow, status: 'proposed' }], 'or')).toBeNull();
    expect(suggestedAssignmentForLocation([{ ...orRow, status: 'expired' }], 'or')).toBeNull();
  });
});

describe('Phase 5 isolation: AI / enrich / prep do not write SLT', () => {
  it('enrich / AI / territoryCodeFromProvince still do not write sales_line_territory_id', () => {
    const files = [
      'src/lib/createEnrichedProspect.ts',
      'src/lib/createEnrichedContact.ts',
      'src/lib/enrichProspect.ts',
      'src/lib/enrichContact.ts',
      'src/lib/fillBlankProspectFields.ts',
      'src/lib/updateProspectResearch.ts',
      'src/lib/aiLineContext.ts',
      'src/lib/territories.ts',
      'src/lib/agentCrmTools.ts',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(root, file), 'utf8');
      expect(src).not.toMatch(/sales_line_territory_id/);
    }
    const stamp = readFileSync(resolve(root, 'src/lib/createEnrichedProspect.ts'), 'utf8');
    expect(stamp).toMatch(/relationship_status: 'prospect'/);
    expect(stamp).not.toMatch(/sales_line_territory_id/);
    const ensure = readFileSync(resolve(root, 'src/lib/retailerLineAccounts.ts'), 'utf8');
    expect(ensure).toMatch(
      /insert\(\{\s*retailer_id: input\.retailerId,\s*sales_line_id: input\.salesLineId,\s*relationship_status: 'prospect',\s*\}\)/,
    );
  });

  it('nightly prep / public chat still have no territory-admin writes', () => {
    const nightly = readFileSync(resolve(root, 'src/lib/outreachNightlyPrep.ts'), 'utf8');
    const prep = readFileSync(resolve(root, 'src/pages/api/staff/outreach/prep.ts'), 'utf8');
    const cron = readFileSync(resolve(root, 'src/pages/api/cron/outreach-nightly-prep.ts'), 'utf8');
    const chat = readFileSync(resolve(root, 'src/pages/api/chat/ai-reply.ts'), 'utf8');
    for (const src of [nightly, prep, cron, chat]) {
      expect(src).not.toMatch(/FEATURE_LINE_TERRITORY_ADMIN/);
      expect(src).not.toMatch(/createSalesLineTerritory/);
      expect(src).not.toMatch(/assignRetailerLineTerritory/);
      expect(src).not.toMatch(/sales_line_territory_id/);
    }
  });

  it('Phase 1–4 migrations and 1C filler are untouched', () => {
    const dual = readFileSync(
      resolve(root, 'supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql'),
      'utf8',
    );
    expect(dual).toMatch(/Do not touch sales_line_territory_id/i);
    const phase4 = readFileSync(
      resolve(root, 'supabase/migrations/20260816090000_multi_line_phase4_ai_profiles.sql'),
      'utf8',
    );
    expect(phase4).toMatch(/ai_profile/);
    const astro = readFileSync(
      resolve(root, 'src/pages/app/lines/[lineSlug]/territories.astro'),
      'utf8',
    );
    expect(astro).toMatch(/pathTab="territories"/);
    expect(astro).not.toMatch(/pathTab="dashboard"/);
    const pathTabs = readFileSync(resolve(root, 'src/lib/linePathTabs.ts'), 'utf8');
    expect(pathTabs).toMatch(/territories: 'territories'/);
  });
});
