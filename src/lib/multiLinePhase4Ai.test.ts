/**
 * Phase 4 staff AI isolation — flag, fail-closed context, catalog/calls filters,
 * provenance, and unchanged nightly prep.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateStaffAiContext, resolveStaffAiContext, STAFF_AI_ERRORS } from '@/lib/aiLineContext';
import { createAgentCrmTools } from '@/lib/agentCrmTools';
import type { AgentSupabase } from '@/lib/agentAuth';
import { isVerifiedIdentityStatus } from '@/lib/retailerFieldChanges';
import { getStaffFeatureFlags, isMultiLineAiEnabled, parseFeatureFlag } from '@/lib/staffFeatures';
import type { StaffAiContext } from '@/lib/aiLineContext';

const root = process.cwd();
const toolOpts = { toolCallId: 'test', messages: [], context: {} };

function epCtx(overrides: Partial<StaffAiContext> = {}): StaffAiContext {
  return {
    salesLineId: '11111111-1111-4111-8111-111111111111',
    code: 'eagle-peak',
    name: 'Eagle Peak',
    status: 'onboarding',
    defaultCurrency: 'USD',
    aiProfile: {
      persona: 'Eagle Peak research',
      systemPrompt: '',
      apfPrompt: '',
      fillBlanksPrompt: '',
      catalogFilter: 'empty',
      currency: 'USD',
      icp: '',
      rubric: '',
      researchNotes: '',
      geoInterest: '',
    },
    retailerLineAccountId: '22222222-2222-4222-8222-222222222222',
    retailerId: 1,
    permittedTerritoryIds: [],
    mode: 'full',
    operationalWriteGate: 'ui_blocked',
    ...overrides,
  };
}

describe('Phase 4 FEATURE_MULTI_LINE_AI flag', () => {
  it('defaults off; snapshot is false without UI; no PUBLIC_ flag', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    const prevAi = process.env.FEATURE_MULTI_LINE_AI;
    const prevUi = process.env.FEATURE_MULTI_LINE_UI;
    delete process.env.FEATURE_MULTI_LINE_AI;
    delete process.env.FEATURE_MULTI_LINE_UI;
    expect(isMultiLineAiEnabled()).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_AI).toBe(false);

    process.env.FEATURE_MULTI_LINE_AI = '1';
    expect(isMultiLineAiEnabled()).toBe(true);
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_AI).toBe(false);

    process.env.FEATURE_MULTI_LINE_UI = '1';
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_AI).toBe(true);

    if (prevAi !== undefined) process.env.FEATURE_MULTI_LINE_AI = prevAi;
    else delete process.env.FEATURE_MULTI_LINE_AI;
    if (prevUi !== undefined) process.env.FEATURE_MULTI_LINE_UI = prevUi;
    else delete process.env.FEATURE_MULTI_LINE_UI;

    const staff = readFileSync(resolve(root, 'src/lib/staffFeatures.ts'), 'utf8');
    expect(staff).toMatch(/FEATURE_MULTI_LINE_AI/);
    expect(staff).not.toMatch(/PUBLIC_FEATURE_MULTI_LINE_AI/);
    const gate = readFileSync(resolve(root, 'src/components/auth/AuthGate.tsx'), 'utf8');
    expect(gate).toMatch(/FEATURE_MULTI_LINE_AI/);
    expect(gate).toMatch(/multiLineAi/);
  });
});

describe('Phase 4 flag-off OGR defaults remain', () => {
  it('agent / enrich / APF still default ogr in source', () => {
    const agent = readFileSync(resolve(root, 'src/pages/api/agent.ts'), 'utf8');
    expect(agent).toMatch(/SYSTEM_PROMPT/);
    expect(agent).toMatch(/Old Guys Rule/);
    expect(agent).toMatch(/gated\.ctx \?/);

    const tools = readFileSync(resolve(root, 'src/lib/agentCrmTools.ts'), 'utf8');
    expect(tools).toMatch(/const DEFAULT_LINE_CODE = 'ogr'/);
    expect(tools).toMatch(/lineCode\?\.trim\(\) \|\| DEFAULT_LINE_CODE/);

    const enrich = readFileSync(resolve(root, 'src/pages/api/prospects/enrich.ts'), 'utf8');
    expect(enrich).toMatch(/gateStaffAiContext/);
  });
});

describe('Phase 4 fail-closed context', () => {
  it('flag off skips resolver', async () => {
    const prev = process.env.FEATURE_MULTI_LINE_AI;
    delete process.env.FEATURE_MULTI_LINE_AI;
    const result = await gateStaffAiContext({
      client: { from: () => ({}) } as unknown as AgentSupabase,
      salesLineId: null,
      kind: 'line_level',
    });
    expect(result).toEqual({ ok: true, ctx: null });
    if (prev !== undefined) process.env.FEATURE_MULTI_LINE_AI = prev;
  });

  it('flag on + missing salesLineId → 400', async () => {
    const prev = process.env.FEATURE_MULTI_LINE_AI;
    process.env.FEATURE_MULTI_LINE_AI = '1';
    const result = await gateStaffAiContext({
      client: { from: () => ({}) } as unknown as AgentSupabase,
      salesLineId: null,
      kind: 'line_level',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe(STAFF_AI_ERRORS.missingLine);
    }
    if (prev !== undefined) process.env.FEATURE_MULTI_LINE_AI = prev;
    else delete process.env.FEATURE_MULTI_LINE_AI;

    const agent = readFileSync(resolve(root, 'src/pages/api/agent.ts'), 'utf8');
    expect(agent).toMatch(/gateStaffAiContext/);
    const enrich = readFileSync(resolve(root, 'src/pages/api/prospects/enrich.ts'), 'utf8');
    expect(enrich).toMatch(/gateStaffAiContext/);
  });

  it('rejects bkg / missing RLA for account kind', async () => {
    const maybeSingle = { maybeSingle: async () => ({ data: null, error: null }) };
    const from = () => ({
      select: () => ({ eq: () => maybeSingle }),
    });
    const missing = await resolveStaffAiContext({
      client: { from } as unknown as AgentSupabase,
      salesLineId: 'not-a-uuid',
      kind: 'line_level',
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe(STAFF_AI_ERRORS.invalidLine);

    const lineMaybe = {
      maybeSingle: async () => ({
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          code: 'bkg',
          name: 'BKG',
          status: 'paused',
          default_currency: null,
          ai_profile: null,
        },
        error: null,
      }),
    };
    const bkgFrom = () => ({
      select: () => ({ eq: () => lineMaybe }),
    });
    const bkg = await resolveStaffAiContext({
      client: { from: bkgFrom } as unknown as AgentSupabase,
      salesLineId: '11111111-1111-4111-8111-111111111111',
      kind: 'line_level',
    });
    expect(bkg.ok).toBe(false);
    if (!bkg.ok) expect(bkg.error).toBe(STAFF_AI_ERRORS.lineNotAllowed);

    const ogrLine = {
      maybeSingle: async () => ({
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          code: 'ogr',
          name: 'Old Guys Rule',
          status: 'active',
          default_currency: 'CAD',
          ai_profile: {},
        },
        error: null,
      }),
    };
    const ogrFrom = (table: string) => {
      if (table === 'lines') return { select: () => ({ eq: () => ogrLine }) };
      if (table === 'sales_line_territories') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(table);
    };
    const noRla = await resolveStaffAiContext({
      client: { from: ogrFrom } as unknown as AgentSupabase,
      salesLineId: '11111111-1111-4111-8111-111111111111',
      kind: 'account',
    });
    expect(noRla.ok).toBe(false);
    if (!noRla.ok) expect(noRla.error).toBe(STAFF_AI_ERRORS.missingRla);
  });
});

describe('Phase 4 tool isolation', () => {
  it('APF Eagle Peak context returns empty catalogAnchors and no OGR SKU fields', async () => {
    const prospect = {
      id: 1,
      name: 'Test Store',
      category: 'golf_retail',
      region: 'Okanagan',
      city: 'Kelowna',
      fit: '',
    };
    const from = (table: string) => {
      if (table === 'prospects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: prospect, error: null }) }),
          }),
        };
      }
      if (table === 'catalog_items') {
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              expect(col).toBe('line_id');
              expect(val).toBe(epCtx().salesLineId);
              return {
                order: () => ({
                  order: () => ({
                    order: () => ({
                      limit: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    };
    const tools = createAgentCrmTools({ from } as unknown as AgentSupabase, epCtx());
    const result = await tools.getAccountProductFit.execute!({ prospectId: 1 }, toolOpts);
    expect(result).toMatchObject({
      catalogAnchors: [],
      line: { code: 'eagle-peak' },
    });
    expect(JSON.stringify(result)).not.toMatch(/OGR-/);
    expect(JSON.stringify(result)).not.toMatch(/msrp_cad/);
  });

  it('listRecentCalls / orders fetch use line_id when ctx is bound', () => {
    const toolsSrc = readFileSync(resolve(root, 'src/lib/agentCrmTools.ts'), 'utf8');
    expect(toolsSrc).toMatch(/query = query\.eq\('line_id', ctx\.salesLineId\)/);
    expect(toolsSrc).toMatch(/orderQuery = orderQuery\.eq\('line_id', ctx\.salesLineId\)/);
    expect(toolsSrc).toMatch(/\.eq\('line_id', ctx\.salesLineId\)/);
  });

  it('research_only and EP/BF reorder writes are rejected', async () => {
    const tools = createAgentCrmTools({ from: () => ({}) } as unknown as AgentSupabase, {
      ...epCtx(),
      mode: 'research_only',
    });
    const catalog = await tools.getAccountProductFit.execute!({ prospectId: 1 }, toolOpts);
    expect(catalog).toEqual({ error: 'Catalog tools are not available for this sales line' });
    const reorder = await tools.getReorderSuggestions.execute!({ accountId: 1 }, toolOpts);
    expect(reorder).toEqual({ error: 'Reorder writes are not available for this sales line' });
  });
});

describe('Phase 4 provenance and prep untouched', () => {
  it('apply research writes retailer_field_changes and skips verified identity', () => {
    const apply = readFileSync(resolve(root, 'src/lib/updateProspectResearch.ts'), 'utf8');
    expect(apply).toMatch(/insertRetailerFieldChanges/);
    expect(apply).toMatch(/shouldSkipVerifiedIdentity/);
    expect(apply).toMatch(/buyerVerified/);
    expect(isVerifiedIdentityStatus({ buyerVerified: true, verificationStatus: null })).toBe(true);
    expect(isVerifiedIdentityStatus({ buyerVerified: false, verificationStatus: 'Verified' })).toBe(
      true,
    );
    expect(
      isVerifiedIdentityStatus({ buyerVerified: false, verificationStatus: 'unverified' }),
    ).toBe(false);
  });

  it('nightly prep still has no salesLineId signature', () => {
    const nightly = readFileSync(resolve(root, 'src/lib/outreachNightlyPrep.ts'), 'utf8');
    expect(nightly).not.toMatch(/salesLineId/);
    const prep = readFileSync(resolve(root, 'src/pages/api/staff/outreach/prep.ts'), 'utf8');
    expect(prep).not.toMatch(/salesLineId/);
    const cron = readFileSync(resolve(root, 'src/pages/api/cron/outreach-nightly-prep.ts'), 'utf8');
    expect(cron).not.toMatch(/salesLineId/);
  });
});
