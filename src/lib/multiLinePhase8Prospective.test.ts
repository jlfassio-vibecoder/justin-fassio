/**
 * Phase 8 Prospective Lines — flag, owner APIs, research workspace, promote-without-RLA,
 * and unchanged picker / prep / public surfaces.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';
import { insertOrder } from '@/lib/orders';
import {
  assertProspectiveOperationalWriteForbidden,
  createProspectiveLine,
  createProspectiveTarget,
  getProspectiveLineByCode,
  isReservedLineCode,
  parseLineCode,
  PROSPECTIVE_FLAG_OFF,
  PROSPECTIVE_LINE_SOFT_CAP,
  PROSPECTIVE_OPERATIONAL_FORBIDDEN,
  PROSPECTIVE_TARGETS_BLOCK_PROMOTE,
  promoteProspectiveLine,
  RESERVED_LINE_CODES,
  warnedAtSoftCap,
} from '@/lib/prospectiveLines';
import { isRepresentedLineCode, REPRESENTED_LINE_CODES } from '@/lib/lines';
import {
  getStaffFeatureFlags,
  isProspectiveLinesEnabled,
  parseFeatureFlag,
} from '@/lib/staffFeatures';

const root = process.cwd();

const insertMock = vi.fn();
const singleMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => {
        insertMock(row);
        return {
          select: () => ({
            single: () => singleMock(),
          }),
        };
      },
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    },
  },
}));

function restoreEnv(name: string, prev: string | undefined): void {
  if (prev !== undefined) process.env[name] = prev;
  else delete process.env[name];
}

const PROSPECTIVE_LINE = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: 'north-cedar',
  name: 'North Cedar',
  active: false,
  status: 'prospective',
  acquisition_stage: 'identified',
  default_currency: null,
  commission_rate: null,
  principal_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ai_profile: { icp: '', researchNotes: '', geoInterest: '' },
};

type MockState = {
  prospectiveCount?: number;
  lineRow?: typeof PROSPECTIVE_LINE | { status: string; code: string; id: string } | null;
  targetCount?: number;
  prospect?: { id: number; name: string } | null;
  triggerError?: string | null;
};

function mockClient(state: MockState = {}) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const updates: { table: string; row: Record<string, unknown> }[] = [];

  const from = (table: string) => {
    const api: Record<string, unknown> = {};
    const next = () => api;
    const result = () => {
      if (table === 'lines') {
        return {
          data: state.lineRow === undefined ? PROSPECTIVE_LINE : state.lineRow,
          error: null,
          count: state.prospectiveCount ?? 0,
        };
      }
      if (table === 'principals') {
        return {
          data: {
            id: PROSPECTIVE_LINE.principal_id,
            legal_name: null,
            dba_name: 'North Cedar',
          },
          error: null,
        };
      }
      if (table === 'retailer_line_targets') {
        return {
          data: [],
          error: state.triggerError ? { message: state.triggerError } : null,
          count: state.targetCount ?? 0,
        };
      }
      if (table === 'prospects') {
        return { data: state.prospect ?? { id: 42, name: 'Harbor Shop' }, error: null };
      }
      if (table === 'retailer_line_accounts') {
        return { data: null, error: { message: 'RLA insert should not run' } };
      }
      return { data: null, error: null, count: 0 };
    };

    api.select = next;
    api.insert = (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return api;
    };
    api.update = (row: Record<string, unknown>) => {
      updates.push({ table, row });
      return api;
    };
    api.delete = next;
    api.eq = next;
    api.in = next;
    api.order = next;
    api.maybeSingle = async () => {
      if (table === 'lines') {
        const lastUpdate = updates.filter((item) => item.table === 'lines').at(-1);
        if (lastUpdate) {
          return {
            data: {
              ...PROSPECTIVE_LINE,
              ...lastUpdate.row,
              id: PROSPECTIVE_LINE.id,
              code: PROSPECTIVE_LINE.code,
            },
            error: null,
          };
        }
      }
      if (table === 'retailer_line_targets' && state.triggerError) {
        return { data: null, error: { message: state.triggerError } };
      }
      return result();
    };
    api.single = async () => {
      if (table === 'principals') {
        return { data: { id: PROSPECTIVE_LINE.principal_id }, error: null };
      }
      if (table === 'lines') {
        const last = inserts.filter((item) => item.table === 'lines').at(-1);
        return {
          data: {
            ...PROSPECTIVE_LINE,
            ...(last?.row ?? {}),
          },
          error: null,
        };
      }
      if (table === 'retailer_line_targets') {
        const last = inserts.filter((item) => item.table === 'retailer_line_targets').at(-1);
        const now = '2026-08-15T00:00:00.000Z';
        return {
          data: {
            id: 'target-1',
            retailer_id: last?.row.retailer_id ?? 42,
            sales_line_id: last?.row.sales_line_id ?? PROSPECTIVE_LINE.id,
            interest: last?.row.interest ?? null,
            fit_notes: last?.row.fit_notes ?? null,
            suggested_geo: last?.row.suggested_geo ?? null,
            status: last?.row.status ?? 'watching',
            created_at: now,
            updated_at: now,
          },
          error: null,
        };
      }
      return result();
    };
    api.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(onFulfilled);
    return api;
  };

  return {
    client: { from } as unknown as AgentSupabase,
    inserts,
    updates,
  };
}

describe('Phase 8 FEATURE_PROSPECTIVE_LINES flag', () => {
  it('defaults off, is not PUBLIC_, and snapshot ANDs UI without writes', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    const prevFlag = process.env.FEATURE_PROSPECTIVE_LINES;
    const prevUi = process.env.FEATURE_MULTI_LINE_UI;
    const prevWrites = process.env.FEATURE_MULTI_LINE_WRITES;
    delete process.env.FEATURE_PROSPECTIVE_LINES;
    delete process.env.FEATURE_MULTI_LINE_UI;
    delete process.env.FEATURE_MULTI_LINE_WRITES;

    expect(isProspectiveLinesEnabled()).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_PROSPECTIVE_LINES).toBe(false);

    process.env.FEATURE_PROSPECTIVE_LINES = '1';
    expect(isProspectiveLinesEnabled()).toBe(true);
    expect(getStaffFeatureFlags().FEATURE_PROSPECTIVE_LINES).toBe(false);

    process.env.FEATURE_MULTI_LINE_UI = '1';
    expect(getStaffFeatureFlags().FEATURE_PROSPECTIVE_LINES).toBe(true);

    process.env.FEATURE_MULTI_LINE_WRITES = '1';
    expect(getStaffFeatureFlags().FEATURE_PROSPECTIVE_LINES).toBe(true);

    restoreEnv('FEATURE_PROSPECTIVE_LINES', prevFlag);
    restoreEnv('FEATURE_MULTI_LINE_UI', prevUi);
    restoreEnv('FEATURE_MULTI_LINE_WRITES', prevWrites);

    const staff = readFileSync(resolve(root, 'src/lib/staffFeatures.ts'), 'utf8');
    expect(staff).toMatch(/FEATURE_PROSPECTIVE_LINES/);
    expect(staff).not.toMatch(/PUBLIC_FEATURE_PROSPECTIVE/);
    expect(staff).toMatch(/isProspectiveLinesEnabled\(\) && ui/);
    expect(staff).toMatch(
      /Omit<[\s\S]*FEATURE_EAGLE_PEAK_PUBLIC_CATALOG[\s\S]*FEATURE_BIG_FISH_PUBLIC_CATALOG/,
    );

    const gate = readFileSync(resolve(root, 'src/components/auth/AuthGate.tsx'), 'utf8');
    expect(gate).toMatch(/FEATURE_PROSPECTIVE_LINES/);
    expect(gate).toMatch(/page === 'prospective'/);
    expect(gate).toMatch(/ProspectiveLinesWorkspace/);
    expect(gate).not.toMatch(/import\.meta\.env\.FEATURE_PROSPECTIVE/);
    expect(gate).toMatch(/window\.location\.replace\('\/app'\)/);

    const ctx = readFileSync(resolve(root, 'src/lib/lineContext.tsx'), 'utf8');
    expect(ctx).not.toMatch(/FEATURE_PROSPECTIVE_LINES/);
    expect(ctx).not.toMatch(/prospectiveLines/);
  });
});

describe('Phase 8 owner routes and APIs', () => {
  it('flag-off APIs 403; AuthGate redirects; non-owner 403', () => {
    const indexApi = readFileSync(
      resolve(root, 'src/pages/api/staff/prospective-lines/index.ts'),
      'utf8',
    );
    expect(indexApi).toMatch(/prerender = false/);
    expect(indexApi).toMatch(/requireProspectiveLinesOwnerApi/);

    const codeApi = readFileSync(
      resolve(root, 'src/pages/api/staff/prospective-lines/[code].ts'),
      'utf8',
    );
    expect(codeApi).toMatch(/requireProspectiveLinesOwnerApi/);

    const promoteApi = readFileSync(
      resolve(root, 'src/pages/api/staff/prospective-lines/[code]/promote.ts'),
      'utf8',
    );
    expect(promoteApi).toMatch(/requireProspectiveLinesOwnerApi/);
    expect(promoteApi).not.toMatch(/retailer_line_accounts/);

    const targetsApi = readFileSync(
      resolve(root, 'src/pages/api/staff/prospective-lines/[code]/targets/index.ts'),
      'utf8',
    );
    expect(targetsApi).toMatch(/requireProspectiveLinesOwnerApi/);
    expect(targetsApi).toMatch(/getProspectiveLineByCode/);
    expect(targetsApi).not.toMatch(/ensureRetailerLineAccount/);

    const helpers = readFileSync(resolve(root, 'src/lib/prospectiveLines.ts'), 'utf8');
    expect(helpers).toMatch(/requireApprovedOwnerClient/);
    expect(helpers).toMatch(/isProspectiveLinesEnabled/);
    expect(helpers).toMatch(PROSPECTIVE_FLAG_OFF);
    expect(helpers).toMatch(/jsonProspective\(\{ ok: false, error: PROSPECTIVE_FLAG_OFF \}, 403\)/);

    const auth = readFileSync(resolve(root, 'src/lib/agentAuth.ts'), 'utf8');
    expect(auth).toMatch(/requireApprovedOwnerClient/);
    expect(auth).toMatch(/is_approved_owner/);

    const pages = readFileSync(
      resolve(root, 'src/pages/app/prospective-lines/index.astro'),
      'utf8',
    );
    expect(pages).toMatch(/prerender = false/);
    expect(pages).toMatch(/page="prospective"/);

    const detail = readFileSync(
      resolve(root, 'src/pages/app/prospective-lines/[lineSlug].astro'),
      'utf8',
    );
    expect(detail).toMatch(/prerender = false/);
    expect(detail).toMatch(/page="prospective"/);
    expect(detail).toMatch(/lineSlug/);

    const linesPages = readFileSync(
      resolve(root, 'src/pages/app/lines/[lineSlug]/index.astro'),
      'utf8',
    );
    expect(linesPages).not.toMatch(/prospective-lines/);
  });

  it('create requires stage; reserved codes rejected; 13th create warns', async () => {
    expect([...RESERVED_LINE_CODES].sort()).toEqual(['big-fish', 'bkg', 'eagle-peak', 'ogr']);
    expect(isReservedLineCode('ogr')).toBe(true);
    expect(isReservedLineCode('bkg')).toBe(true);
    expect(parseLineCode('ogr')).toEqual({ ok: false, error: 'This line code is reserved' });
    expect(parseLineCode('North Cedar').ok).toBe(true);
    expect(warnedAtSoftCap(11)).toBe(false);
    expect(warnedAtSoftCap(PROSPECTIVE_LINE_SOFT_CAP)).toBe(true);

    const reserved = await createProspectiveLine(mockClient().client, {
      name: 'OGR',
      code: 'ogr',
      acquisitionStage: 'identified',
    });
    expect(reserved.error).toMatch(/reserved/);
    expect(reserved.data).toBeNull();

    const missingStage = await createProspectiveLine(mockClient().client, {
      name: 'North Cedar',
      acquisitionStage: null,
    });
    expect(missingStage.error).toMatch(/acquisition_stage/);

    const { client, inserts } = mockClient({ prospectiveCount: 12 });
    const thirteenth = await createProspectiveLine(client, {
      name: 'North Cedar',
      acquisitionStage: 'identified',
    });
    expect(thirteenth.warned).toBe(true);
    expect(thirteenth.error).toBeNull();
    expect(thirteenth.data?.status).toBe('prospective');
    expect(thirteenth.data?.active).toBe(false);
    expect(inserts.some((row) => row.table === 'retailer_line_accounts')).toBe(false);
    const lineInsert = inserts.find((row) => row.table === 'lines');
    expect(lineInsert?.row.status).toBe('prospective');
    expect(lineInsert?.row.active).toBe(false);
    expect(lineInsert?.row.default_currency).toBeNull();
    expect(lineInsert?.row.commission_rate).toBeNull();
  });
});

describe('Phase 8 targets, promote, and selling refuse', () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    singleMock.mockResolvedValue({ data: { id: 'ord' }, error: null });
  });

  it('target on ogr / EP / BF fails; prospective fixture succeeds', async () => {
    for (const row of [
      { id: 'ogr-id', code: 'ogr', status: 'active' },
      { id: 'ep-id', code: 'eagle-peak', status: 'onboarding' },
      { id: 'bf-id', code: 'big-fish', status: 'confirmed' },
    ]) {
      const loaded = await getProspectiveLineByCode(
        mockClient({ lineRow: { ...PROSPECTIVE_LINE, ...row } }).client,
        row.code,
      );
      expect(loaded.data).toBeNull();
      expect(loaded.error).toMatch(/not prospective/);
    }

    const { client, inserts } = mockClient({
      lineRow: PROSPECTIVE_LINE,
      prospect: { id: 42, name: 'Harbor Shop' },
    });
    const ok = await createProspectiveTarget(client, {
      salesLineId: PROSPECTIVE_LINE.id,
      retailerId: 42,
    });
    expect(ok.error).toBeNull();
    expect(ok.data?.retailerId).toBe(42);
    expect(inserts.some((row) => row.table === 'retailer_line_accounts')).toBe(false);
    expect(inserts.some((row) => row.table === 'retailer_line_targets')).toBe(true);

    const targetsApi = readFileSync(
      resolve(root, 'src/pages/api/staff/prospective-lines/[code]/targets/index.ts'),
      'utf8',
    );
    expect(targetsApi).toMatch(/getProspectiveLineByCode/);
    const phase1 = readFileSync(
      resolve(root, 'supabase/migrations/20260814100000_multi_line_phase1_tables.sql'),
      'utf8',
    );
    expect(phase1).toMatch(/retailer_line_targets may only reference prospective lines/i);
  });

  it('convert / insertOrder / generate-draft against prospective reject / 403; no RLA insert', async () => {
    expect(assertProspectiveOperationalWriteForbidden('prospective')).toBe(
      PROSPECTIVE_OPERATIONAL_FORBIDDEN,
    );
    expect(assertProspectiveOperationalWriteForbidden('active')).toBeNull();

    const refused = await insertOrder(
      {
        account_id: 1,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        total_amount_cad: 10,
        status: 'submitted',
      },
      { writesEnabled: true, lineCode: 'north-cedar', lineStatus: 'prospective' },
    );
    expect(refused.error).toBe(PROSPECTIVE_OPERATIONAL_FORBIDDEN);
    expect(insertMock).not.toHaveBeenCalled();

    const convert = readFileSync(resolve(root, 'src/lib/convertToActiveAccount.ts'), 'utf8');
    expect(convert).toMatch(/assertProspectiveOperationalWriteForbidden/);
    expect(convert).toMatch(/lineStatus: line\.data\.status/);

    const draft = readFileSync(
      resolve(root, 'src/pages/api/staff/ogr-product-email/generate-draft.ts'),
      'utf8',
    );
    expect(draft).toMatch(/mode === 'research_only'/);
    expect(draft).toMatch(/403/);
    expect(draft).not.toMatch(/research_only[\s\S]{0,80}400/);
  });

  it('promote with targets → 409; zero targets updates status, nulls stage, no RLA', async () => {
    const blocked = await promoteProspectiveLine(
      mockClient({ targetCount: 2 }).client,
      'north-cedar',
      'confirmed',
    );
    expect(blocked.status).toBe(409);
    expect(blocked.error).toBe(PROSPECTIVE_TARGETS_BLOCK_PROMOTE);
    expect(blocked.data).toBeNull();

    const { client, inserts, updates } = mockClient({ targetCount: 0 });
    const ok = await promoteProspectiveLine(client, 'north-cedar', 'confirmed');
    expect(ok.error).toBeNull();
    expect(ok.data?.status).toBe('confirmed');
    expect(inserts.some((row) => row.table === 'retailer_line_accounts')).toBe(false);
    expect(updates.some((row) => row.table === 'lines')).toBe(true);
    const lineUpdate = updates.find((row) => row.table === 'lines');
    expect(lineUpdate?.row.status).toBe('confirmed');
    expect(lineUpdate?.row.acquisition_stage).toBeNull();
    expect(lineUpdate?.row).not.toHaveProperty('active');

    const promoteFix = readFileSync(
      resolve(
        root,
        'supabase/migrations/20260814115000_multi_line_phase1a_block_promote_with_targets.sql',
      ),
      'utf8',
    );
    expect(promoteFix).toMatch(/enforce_lines_leave_prospective_without_targets/);
  });
});

describe('Phase 8 picker, prep, and public surfaces stay unchanged', () => {
  it('fetchRepresentedLines / REPRESENTED_LINE_CODES still three codes', () => {
    expect([...REPRESENTED_LINE_CODES].sort()).toEqual(['big-fish', 'eagle-peak', 'ogr']);
    expect(isRepresentedLineCode('north-cedar')).toBe(false);
    expect(isRepresentedLineCode('bkg')).toBe(false);
    const lines = readFileSync(resolve(root, 'src/lib/lines.ts'), 'utf8');
    expect(lines).toMatch(/REPRESENTED_LINE_CODES/);
    expect(lines).not.toMatch(/FEATURE_PROSPECTIVE_LINES/);
  });

  it('prep / send / cron / public RPCs have no FEATURE_PROSPECTIVE_*', () => {
    const nightly = readFileSync(resolve(root, 'src/lib/outreachNightlyPrep.ts'), 'utf8');
    expect(nightly).not.toMatch(/FEATURE_PROSPECTIVE/);
    expect(nightly).not.toMatch(/salesLineId/);

    const prep = readFileSync(resolve(root, 'src/pages/api/staff/outreach/prep.ts'), 'utf8');
    expect(prep).not.toMatch(/FEATURE_PROSPECTIVE/);
    expect(prep).not.toMatch(/salesLineId/);

    const send = readFileSync(
      resolve(root, 'src/pages/api/staff/ogr-product-email/drafts/[id]/send.ts'),
      'utf8',
    );
    expect(send).not.toMatch(/FEATURE_PROSPECTIVE/);

    const cron = readFileSync(resolve(root, 'src/pages/api/cron/outreach-nightly-prep.ts'), 'utf8');
    expect(cron).not.toMatch(/FEATURE_PROSPECTIVE/);
    expect(cron).not.toMatch(/salesLineId/);

    const chat = readFileSync(resolve(root, 'src/pages/api/chat/ai-reply.ts'), 'utf8');
    expect(chat).not.toMatch(/FEATURE_PROSPECTIVE/);

    const types = readFileSync(resolve(root, 'src/types/database.ts'), 'utf8');
    expect(types).toMatch(/get_public_ogr_products/);
    expect(types).not.toMatch(/get_public_prospective/);

    const workspace = readFileSync(
      resolve(root, 'src/components/ProspectiveLinesWorkspace.tsx'),
      'utf8',
    );
    expect(workspace).not.toMatch(/from\('retailer_line_targets'\)\.insert/);
    expect(workspace).not.toMatch(/from\('lines'\)\.insert/);
    expect(workspace).not.toMatch(/ensureRetailerLineAccount/);
    expect(workspace).not.toMatch(/import\.meta\.env\.FEATURE_PROSPECTIVE/);
    expect(workspace).toMatch(/strokeWidth=\{2\.75\}/);
  });
});
