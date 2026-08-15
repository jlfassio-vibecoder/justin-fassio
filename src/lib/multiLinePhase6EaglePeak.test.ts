/**
 * Phase 6 Eagle Peak onboarding — flags, selling gate, USD stamp, directory split,
 * outreach generate-draft, and unchanged public / prep surfaces.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEaglePeakOrderConversion, insertOrder } from '@/lib/orders';
import {
  assertEaglePeakCatalogReadyForDraft,
  assertEaglePeakGenerateDraftAllowed,
  EAGLE_PEAK_CATALOG_EMPTY,
  EAGLE_PEAK_OUTREACH_DISABLED,
} from '@/pages/api/staff/ogr-product-email/generate-draft';
import {
  assertLineAllowsOperationalWrite,
  isStaffSellingUiBlocked,
  splitDirectoryByAccountOrLineRelationship,
  usesLineRelationshipDirectorySplit,
} from '@/lib/retailerLineAccounts';
import {
  getStaffFeatureFlags,
  isEaglePeakOutreachEnabled,
  isEaglePeakPublicCatalogEnabled,
  isEaglePeakSellingEnabled,
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
  },
}));

function restoreEnv(name: string, prev: string | undefined): void {
  if (prev !== undefined) process.env[name] = prev;
  else delete process.env[name];
}

describe('Phase 6 Eagle Peak flags', () => {
  it('all three flags default off; no PUBLIC_ names; selling snapshot ANDs UI and writes', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    const prevSelling = process.env.FEATURE_EAGLE_PEAK_SELLING;
    const prevOutreach = process.env.FEATURE_EAGLE_PEAK_OUTREACH;
    const prevPublic = process.env.FEATURE_EAGLE_PEAK_PUBLIC_CATALOG;
    const prevUi = process.env.FEATURE_MULTI_LINE_UI;
    const prevWrites = process.env.FEATURE_MULTI_LINE_WRITES;
    delete process.env.FEATURE_EAGLE_PEAK_SELLING;
    delete process.env.FEATURE_EAGLE_PEAK_OUTREACH;
    delete process.env.FEATURE_EAGLE_PEAK_PUBLIC_CATALOG;
    delete process.env.FEATURE_MULTI_LINE_UI;
    delete process.env.FEATURE_MULTI_LINE_WRITES;

    expect(isEaglePeakSellingEnabled()).toBe(false);
    expect(isEaglePeakOutreachEnabled()).toBe(false);
    expect(isEaglePeakPublicCatalogEnabled()).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_SELLING).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_OUTREACH).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_PUBLIC_CATALOG).toBe(false);

    process.env.FEATURE_EAGLE_PEAK_SELLING = '1';
    process.env.FEATURE_EAGLE_PEAK_OUTREACH = '1';
    process.env.FEATURE_EAGLE_PEAK_PUBLIC_CATALOG = '1';
    expect(isEaglePeakSellingEnabled()).toBe(true);
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_SELLING).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_OUTREACH).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_PUBLIC_CATALOG).toBe(true);

    process.env.FEATURE_MULTI_LINE_UI = '1';
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_SELLING).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_OUTREACH).toBe(true);

    process.env.FEATURE_MULTI_LINE_WRITES = '1';
    expect(getStaffFeatureFlags().FEATURE_EAGLE_PEAK_SELLING).toBe(true);

    restoreEnv('FEATURE_EAGLE_PEAK_SELLING', prevSelling);
    restoreEnv('FEATURE_EAGLE_PEAK_OUTREACH', prevOutreach);
    restoreEnv('FEATURE_EAGLE_PEAK_PUBLIC_CATALOG', prevPublic);
    restoreEnv('FEATURE_MULTI_LINE_UI', prevUi);
    restoreEnv('FEATURE_MULTI_LINE_WRITES', prevWrites);

    const staff = readFileSync(resolve(root, 'src/lib/staffFeatures.ts'), 'utf8');
    expect(staff).toMatch(/FEATURE_EAGLE_PEAK_SELLING/);
    expect(staff).toMatch(/FEATURE_EAGLE_PEAK_OUTREACH/);
    expect(staff).toMatch(/FEATURE_EAGLE_PEAK_PUBLIC_CATALOG/);
    expect(staff).not.toMatch(/PUBLIC_FEATURE_EAGLE_PEAK/);

    const gate = readFileSync(resolve(root, 'src/components/auth/AuthGate.tsx'), 'utf8');
    expect(gate).toMatch(/FEATURE_EAGLE_PEAK_SELLING/);
    expect(gate).toMatch(/FEATURE_EAGLE_PEAK_OUTREACH/);
    expect(gate).toMatch(/eaglePeakSelling/);
    expect(gate).toMatch(/eaglePeakOutreach/);
    expect(gate).not.toMatch(/FEATURE_EAGLE_PEAK_PUBLIC_CATALOG/);
    expect(gate).not.toMatch(/eaglePeakPublic/);

    const ctx = readFileSync(resolve(root, 'src/lib/lineContext.tsx'), 'utf8');
    expect(ctx).toMatch(/eaglePeakSelling/);
    expect(ctx).toMatch(/eaglePeakOutreach/);
    expect(ctx).not.toMatch(/FEATURE_EAGLE_PEAK_PUBLIC_CATALOG/);
  });
});

describe('Phase 6 selling gate', () => {
  it('flag off: EP stays ui_blocked; Big Fish stays ui_blocked', () => {
    expect(assertLineAllowsOperationalWrite({ code: 'eagle-peak', status: 'onboarding' })).toBe(
      'ui_blocked',
    );
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'eagle-peak', status: 'onboarding' },
        { eaglePeakSellingEnabled: false },
      ),
    ).toBe('ui_blocked');
    expect(assertLineAllowsOperationalWrite({ code: 'big-fish', status: 'confirmed' })).toBe(
      'ui_blocked',
    );
    expect(isStaffSellingUiBlocked({ code: 'eagle-peak', status: 'onboarding' }, true, false)).toBe(
      true,
    );
  });

  it('selling on + onboarding/active: EP allow; Big Fish still ui_blocked', () => {
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'eagle-peak', status: 'onboarding' },
        { eaglePeakSellingEnabled: true },
      ),
    ).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'eagle-peak', status: 'active' },
        { eaglePeakSellingEnabled: true },
      ),
    ).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'big-fish', status: 'confirmed' },
        { eaglePeakSellingEnabled: true },
      ),
    ).toBe('ui_blocked');
    expect(assertLineAllowsOperationalWrite({ code: 'bkg', status: 'paused' })).toBe('reject');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'eagle-peak', status: 'declined' },
        { eaglePeakSellingEnabled: true },
      ),
    ).toBe('reject');
    expect(isStaffSellingUiBlocked({ code: 'eagle-peak', status: 'onboarding' }, true, true)).toBe(
      false,
    );
  });

  it('EP convert updates RLA only and never flips prospects.account_status', () => {
    const convert = readFileSync(resolve(root, 'src/lib/convertToActiveAccount.ts'), 'utf8');
    expect(convert).toMatch(
      /if \(line\.data\.code === 'eagle-peak' && !input\.eaglePeakSellingEnabled\)/,
    );
    expect(convert).toMatch(/const isOgr = line\.data\.code === 'ogr'/);
    expect(convert).toMatch(
      /if \(isOgr\) \{[\s\S]*account_status: 'active_account'[\s\S]*\.eq\('id', input\.accountId\)/,
    );
    expect(convert).toMatch(/if \(!isOgr\) \{[\s\S]*return \{ ok: true, alreadyActive: false/);
    expect(convert).toMatch(
      /if \(!isOgr\) \{[\s\S]*alreadyActive: false[\s\S]*upsertAccountReorderSettings/,
    );
  });
});

describe('Phase 6 insertOrder USD conversion', () => {
  it('buildEaglePeakOrderConversion requires USD original + FX and computes CAD reporting', () => {
    expect(
      buildEaglePeakOrderConversion({
        originalAmountUsd: 250,
        exchangeRate: undefined,
        exchangeRateDate: '2026-08-15',
      }).ok,
    ).toBe(false);
    const built = buildEaglePeakOrderConversion({
      originalAmountUsd: 200,
      exchangeRate: 1.38,
      exchangeRateDate: '2026-08-15',
    });
    expect(built).toEqual({
      ok: true,
      stamp: {
        original_amount: 200,
        original_currency: 'USD',
        total_amount_cad: 276,
        exchange_rate: 1.38,
        exchange_rate_date: '2026-08-15',
        conversion_source: 'staff_usd_cad',
        converted_amount: 276,
        converted_currency: 'CAD',
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { id: 'ord-ep' }, error: null });
  });

  it('rejects CAD-only EP payloads that would relabel CAD as USD', async () => {
    const cadOnly = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        total_amount_cad: 250,
        line_id: 'line-ep',
        retailer_line_account_id: 'rla-ep',
      },
      {
        writesEnabled: true,
        lineCode: 'eagle-peak',
        lineDefaultCurrency: 'USD',
        eaglePeakSellingEnabled: true,
      },
    );
    expect(cadOnly.error).toMatch(/original_amount in USD/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('stamps original USD + CAD reporting + FX fields and does not insert an OGR row', async () => {
    const blocked = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        total_amount_cad: 250,
        original_amount: 200,
        original_currency: 'USD',
        exchange_rate: 1.38,
        exchange_rate_date: '2026-08-15',
        line_id: 'line-ep',
        retailer_line_account_id: 'rla-ep',
      },
      {
        writesEnabled: true,
        lineCode: 'eagle-peak',
        lineDefaultCurrency: 'USD',
        eaglePeakSellingEnabled: false,
      },
    );
    expect(blocked.error).toMatch(/Eagle Peak selling is not enabled/);
    expect(insertMock).not.toHaveBeenCalled();

    const ok = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        original_amount: 200,
        original_currency: 'USD',
        exchange_rate: 1.38,
        exchange_rate_date: '2026-08-15',
        line_id: 'line-ep',
        retailer_line_account_id: 'rla-ep',
      },
      {
        writesEnabled: true,
        lineCode: 'eagle-peak',
        lineDefaultCurrency: 'USD',
        eaglePeakSellingEnabled: true,
      },
    );
    expect(ok.error).toBeNull();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_id: 'line-ep',
        original_amount: 200,
        original_currency: 'USD',
        total_amount_cad: 276,
        exchange_rate: 1.38,
        exchange_rate_date: '2026-08-15',
        conversion_source: 'staff_usd_cad',
        converted_amount: 276,
        converted_currency: 'CAD',
      }),
    );
    const payload = insertMock.mock.calls[0]?.[0] as { line_id?: string };
    expect(payload.line_id).not.toBe('line-ogr');
  });

  it('OGR still rejects USD original_currency', async () => {
    const usd = await insertOrder(
      {
        account_id: 1,
        order_type: 'initial',
        season: 'fathers_day',
        total_amount_cad: 100,
        original_currency: 'USD',
        line_id: 'line-ogr',
        retailer_line_account_id: 'rla-ogr',
      },
      { writesEnabled: true, lineCode: 'ogr' },
    );
    expect(usd.error).toMatch(/cannot use USD/);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('Phase 6 directory split', () => {
  it('uses RLA relationship_status when the EP selling snapshot is on', () => {
    expect(
      usesLineRelationshipDirectorySplit({ eaglePeakSelling: true, lineCode: 'eagle-peak' }),
    ).toBe(true);
    expect(usesLineRelationshipDirectorySplit({ eaglePeakSelling: true, lineCode: 'ogr' })).toBe(
      false,
    );
    expect(
      usesLineRelationshipDirectorySplit({ eaglePeakSelling: false, lineCode: 'eagle-peak' }),
    ).toBe(false);

    const rows = [
      { id: 1, accountStatus: 'prospect', lineRelationshipStatus: 'prospect' as const },
      { id: 2, accountStatus: 'prospect', lineRelationshipStatus: 'opened' as const },
      { id: 3, accountStatus: 'active_account', lineRelationshipStatus: 'prospect' as const },
    ];
    const ep = splitDirectoryByAccountOrLineRelationship(rows, true);
    expect(ep.pipeline.map((r) => r.id)).toEqual([1, 3]);
    expect(ep.active.map((r) => r.id)).toEqual([2]);

    const ogr = splitDirectoryByAccountOrLineRelationship(rows, false);
    expect(ogr.pipeline.map((r) => r.id)).toEqual([1, 2]);
    expect(ogr.active.map((r) => r.id)).toEqual([3]);

    const rcc = readFileSync(resolve(root, 'src/components/RepCommandCenter.tsx'), 'utf8');
    expect(rcc).toMatch(/usesLineRelationshipDirectorySplit/);
    expect(rcc).toMatch(/splitDirectoryByAccountOrLineRelationship/);
    const prospects = readFileSync(resolve(root, 'src/lib/prospects.ts'), 'utf8');
    expect(prospects).toMatch(/lineRelationshipStatus/);
    expect(prospects).toMatch(/relationship_status/);
  });
});

describe('Phase 6 outreach + public catalog inert', () => {
  it('generate-draft is blocked for EP when outreach is off; empty catalog fails closed', () => {
    expect(
      assertEaglePeakGenerateDraftAllowed({ lineCode: 'eagle-peak', outreachEnabled: false }),
    ).toEqual({ ok: false, status: 403, error: EAGLE_PEAK_OUTREACH_DISABLED });
    expect(
      assertEaglePeakGenerateDraftAllowed({ lineCode: 'eagle-peak', outreachEnabled: true }),
    ).toEqual({ ok: true });
    expect(
      assertEaglePeakGenerateDraftAllowed({ lineCode: 'ogr', outreachEnabled: false }),
    ).toEqual({ ok: true });
    expect(assertEaglePeakCatalogReadyForDraft(0)).toEqual({
      ok: false,
      status: 400,
      error: EAGLE_PEAK_CATALOG_EMPTY,
    });
    expect(assertEaglePeakCatalogReadyForDraft(1)).toEqual({ ok: true });

    const draft = readFileSync(
      resolve(root, 'src/pages/api/staff/ogr-product-email/generate-draft.ts'),
      'utf8',
    );
    expect(draft).toMatch(/FEATURE_EAGLE_PEAK_OUTREACH/);
    expect(draft).toMatch(/assertEaglePeakGenerateDraftAllowed/);
    expect(draft).toMatch(/assertEaglePeakCatalogReadyForDraft/);
    expect(draft).not.toMatch(/import\.meta\.env\.FEATURE_EAGLE_PEAK/);
  });

  it('prep / send / cron still have no EP writes or FEATURE_EAGLE_PEAK_*', () => {
    const nightly = readFileSync(resolve(root, 'src/lib/outreachNightlyPrep.ts'), 'utf8');
    expect(nightly).not.toMatch(/FEATURE_EAGLE_PEAK/);
    expect(nightly).not.toMatch(/salesLineId/);
    expect(nightly).not.toMatch(/eagle-peak/);

    const prep = readFileSync(resolve(root, 'src/pages/api/staff/outreach/prep.ts'), 'utf8');
    expect(prep).not.toMatch(/FEATURE_EAGLE_PEAK/);
    expect(prep).not.toMatch(/salesLineId/);

    const send = readFileSync(
      resolve(root, 'src/pages/api/staff/ogr-product-email/drafts/[id]/send.ts'),
      'utf8',
    );
    expect(send).not.toMatch(/FEATURE_EAGLE_PEAK/);
    expect(send).not.toMatch(/eagle-peak/);

    const cron = readFileSync(resolve(root, 'src/pages/api/cron/outreach-nightly-prep.ts'), 'utf8');
    expect(cron).not.toMatch(/FEATURE_EAGLE_PEAK/);
    expect(cron).not.toMatch(/salesLineId/);
  });

  it('public flag on or off: no new RPC; get_public_ogr_* still ogr; EP active stays false', () => {
    const publicSql = readFileSync(
      resolve(root, 'supabase/migrations/20260806190000_retailer_pricing_and_buyer_account.sql'),
      'utf8',
    );
    expect(publicSql).toMatch(/get_public_ogr_products/);
    expect(publicSql).toMatch(/where l\.code = 'ogr'/);
    expect(publicSql).not.toMatch(/get_public_eagle_peak/);

    const types = readFileSync(resolve(root, 'src/types/database.ts'), 'utf8');
    expect(types).toMatch(/get_public_ogr_products/);
    expect(types).not.toMatch(/get_public_eagle_peak/);

    const productUrls = readFileSync(resolve(root, 'src/lib/productUrls.ts'), 'utf8');
    expect(productUrls).not.toMatch(/eagle-peak/);
    expect(productUrls).not.toMatch(/FEATURE_EAGLE_PEAK_PUBLIC_CATALOG/);

    const seeds = readFileSync(
      resolve(root, 'supabase/migrations/20260814110000_multi_line_phase1_line_seeds.sql'),
      'utf8',
    );
    expect(seeds).toMatch(/'eagle-peak'/);
    expect(seeds).toMatch(/active = false/);

    const chat = readFileSync(resolve(root, 'src/pages/api/chat/ai-reply.ts'), 'utf8');
    expect(chat).not.toMatch(/FEATURE_EAGLE_PEAK/);
    expect(chat).not.toMatch(/get_public_eagle_peak/);
  });

  it('AI / import / territoryCodeFromProvince still do not write sales_line_territory_id', () => {
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
      'src/lib/convertToActiveAccount.ts',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(root, file), 'utf8');
      expect(src).not.toMatch(/sales_line_territory_id/);
    }
  });
});
