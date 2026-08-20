/**
 * Phase 7 Big Fish configuration readiness — flags, selling gate, currency reject,
 * directory split, outreach generate-draft, and unchanged public / prep surfaces.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertOrder } from '@/lib/orders';
import {
  assertBigFishGenerateDraftAllowed,
  assertEaglePeakCatalogReadyForDraft,
  BIG_FISH_OUTREACH_DISABLED,
  EAGLE_PEAK_CATALOG_EMPTY,
} from '@/pages/api/staff/ogr-product-email/generate-draft';
import {
  assertLineAllowsOperationalWrite,
  isStaffSellingUiBlocked,
  usesLineRelationshipDirectorySplit,
} from '@/lib/retailerLineAccounts';
import { TERRITORY_ADMIN_ERRORS } from '@/lib/salesLineTerritories';
import {
  getStaffFeatureFlags,
  isBigFishOutreachEnabled,
  isBigFishPublicCatalogEnabled,
  isBigFishSellingEnabled,
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

describe('Phase 7 Big Fish flags', () => {
  it('all three flags default off; no PUBLIC_ names; selling snapshot ANDs UI and writes', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    const prevSelling = process.env.FEATURE_BIG_FISH_SELLING;
    const prevOutreach = process.env.FEATURE_BIG_FISH_OUTREACH;
    const prevPublic = process.env.FEATURE_BIG_FISH_PUBLIC_CATALOG;
    const prevUi = process.env.FEATURE_MULTI_LINE_UI;
    const prevWrites = process.env.FEATURE_MULTI_LINE_WRITES;
    delete process.env.FEATURE_BIG_FISH_SELLING;
    delete process.env.FEATURE_BIG_FISH_OUTREACH;
    delete process.env.FEATURE_BIG_FISH_PUBLIC_CATALOG;
    delete process.env.FEATURE_MULTI_LINE_UI;
    delete process.env.FEATURE_MULTI_LINE_WRITES;

    expect(isBigFishSellingEnabled()).toBe(false);
    expect(isBigFishOutreachEnabled()).toBe(false);
    expect(isBigFishPublicCatalogEnabled()).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_SELLING).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_OUTREACH).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_PUBLIC_CATALOG).toBe(false);

    process.env.FEATURE_BIG_FISH_SELLING = '1';
    process.env.FEATURE_BIG_FISH_OUTREACH = '1';
    process.env.FEATURE_BIG_FISH_PUBLIC_CATALOG = '1';
    expect(isBigFishSellingEnabled()).toBe(true);
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_SELLING).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_OUTREACH).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_PUBLIC_CATALOG).toBe(true);

    process.env.FEATURE_MULTI_LINE_UI = '1';
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_SELLING).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_OUTREACH).toBe(true);

    process.env.FEATURE_MULTI_LINE_WRITES = '1';
    expect(getStaffFeatureFlags().FEATURE_BIG_FISH_SELLING).toBe(true);

    restoreEnv('FEATURE_BIG_FISH_SELLING', prevSelling);
    restoreEnv('FEATURE_BIG_FISH_OUTREACH', prevOutreach);
    restoreEnv('FEATURE_BIG_FISH_PUBLIC_CATALOG', prevPublic);
    restoreEnv('FEATURE_MULTI_LINE_UI', prevUi);
    restoreEnv('FEATURE_MULTI_LINE_WRITES', prevWrites);

    const staff = readFileSync(resolve(root, 'src/lib/staffFeatures.ts'), 'utf8');
    expect(staff).toMatch(/FEATURE_BIG_FISH_SELLING/);
    expect(staff).toMatch(/FEATURE_BIG_FISH_OUTREACH/);
    expect(staff).toMatch(/FEATURE_BIG_FISH_PUBLIC_CATALOG/);
    expect(staff).not.toMatch(/PUBLIC_FEATURE_BIG_FISH/);
    expect(staff).toMatch(
      /Omit<[\s\S]*FEATURE_EAGLE_PEAK_PUBLIC_CATALOG[\s\S]*FEATURE_BIG_FISH_PUBLIC_CATALOG/,
    );

    const gate = readFileSync(resolve(root, 'src/components/auth/AuthGate.tsx'), 'utf8');
    expect(gate).toMatch(/FEATURE_BIG_FISH_SELLING/);
    expect(gate).toMatch(/FEATURE_BIG_FISH_OUTREACH/);
    expect(gate).toMatch(/bigFishSelling/);
    expect(gate).toMatch(/bigFishOutreach/);
    expect(gate).not.toMatch(/FEATURE_BIG_FISH_PUBLIC_CATALOG/);
    expect(gate).not.toMatch(/bigFishPublic/);
    expect(gate).not.toMatch(/import\.meta\.env\.FEATURE_BIG_FISH/);

    const ctx = readFileSync(resolve(root, 'src/lib/lineContext.tsx'), 'utf8');
    expect(ctx).toMatch(/bigFishSelling/);
    expect(ctx).toMatch(/bigFishOutreach/);
    expect(ctx).toMatch(/defaultCurrency/);
    expect(ctx).not.toMatch(/FEATURE_BIG_FISH_PUBLIC_CATALOG/);
    expect(ctx).not.toMatch(/import\.meta\.env\.FEATURE_BIG_FISH/);
  });
});

describe('Phase 7 selling gate', () => {
  it('flag on + current seed (confirmed, null currency) stays ui_blocked', () => {
    expect(assertLineAllowsOperationalWrite({ code: 'big-fish', status: 'confirmed' })).toBe(
      'ui_blocked',
    );
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'big-fish', status: 'confirmed' },
        { bigFishSellingEnabled: true },
      ),
    ).toBe('ui_blocked');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'big-fish', status: 'confirmed' },
        { bigFishSellingEnabled: true, defaultCurrency: null },
      ),
    ).toBe('ui_blocked');
    expect(
      isStaffSellingUiBlocked({ code: 'big-fish', status: 'confirmed' }, true, {
        bigFishSellingEnabled: true,
      }),
    ).toBe(true);
  });

  it('selling on + currency + confirmed/onboarding/active: BF allow; OGR/EP/bkg unchanged', () => {
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'big-fish', status: 'confirmed' },
        { bigFishSellingEnabled: true, defaultCurrency: 'USD' },
      ),
    ).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'big-fish', status: 'onboarding' },
        { bigFishSellingEnabled: true, defaultCurrency: 'CAD' },
      ),
    ).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'big-fish', status: 'active' },
        { bigFishSellingEnabled: true, defaultCurrency: 'USD' },
      ),
    ).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'eagle-peak', status: 'onboarding' },
        { bigFishSellingEnabled: true, defaultCurrency: 'USD' },
      ),
    ).toBe('ui_blocked');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'eagle-peak', status: 'onboarding' },
        { eaglePeakSellingEnabled: true },
      ),
    ).toBe('allow');
    expect(assertLineAllowsOperationalWrite({ code: 'ogr', status: 'active' })).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'bkg', status: 'paused' },
        { bigFishSellingEnabled: true, defaultCurrency: 'USD' },
      ),
    ).toBe('reject');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'big-fish', status: 'terminated' },
        { bigFishSellingEnabled: true, defaultCurrency: 'USD' },
      ),
    ).toBe('reject');
    expect(
      isStaffSellingUiBlocked(
        { code: 'big-fish', status: 'confirmed', defaultCurrency: 'USD' },
        true,
        { bigFishSellingEnabled: true, defaultCurrency: 'USD' },
      ),
    ).toBe(false);
  });

  it('BF convert updates RLA only and never flips prospects.account_status', () => {
    const convert = readFileSync(resolve(root, 'src/lib/convertToActiveAccount.ts'), 'utf8');
    expect(convert).toMatch(
      /if \(line\.data\.code === 'big-fish' && !input\.bigFishSellingEnabled\)/,
    );
    expect(convert).toMatch(/Big Fish selling is not configured/);
    expect(convert).toMatch(/const isOgr = line\.data\.code === 'ogr'/);
    expect(convert).not.toMatch(
      /if \(isOgr\) \{[\s\S]*account_status: 'active_account'[\s\S]*\.eq\('id', input\.accountId\)/,
    );
    expect(convert).toMatch(/if \(!isOgr\) \{[\s\S]*return \{ ok: true, alreadyActive: false/);
    expect(convert).toMatch(
      /if \(!isOgr\) \{[\s\S]*alreadyActive: false[\s\S]*upsertAccountReorderSettings/,
    );
  });
});

describe('Phase 7 insertOrder currency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { id: 'ord-bf' }, error: null });
  });

  it('rejects current seed (null currency) before CAD fallback', async () => {
    const missing = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        total_amount_cad: 200,
        line_id: 'line-bf',
        retailer_line_account_id: 'rla-bf',
      },
      {
        writesEnabled: true,
        lineCode: 'big-fish',
        lineDefaultCurrency: null,
        bigFishSellingEnabled: true,
      },
    );
    expect(missing.error).toMatch(/default_currency to be configured/);
    expect(insertMock).not.toHaveBeenCalled();

    const blank = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        total_amount_cad: 200,
        line_id: 'line-bf',
        retailer_line_account_id: 'rla-bf',
      },
      {
        writesEnabled: true,
        lineCode: 'big-fish',
        lineDefaultCurrency: '  ',
        bigFishSellingEnabled: true,
      },
    );
    expect(blank.error).toMatch(/default_currency to be configured/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects when selling is off even if currency is set', async () => {
    const blocked = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        original_amount: 200,
        original_currency: 'USD',
        exchange_rate: 1.38,
        exchange_rate_date: '2026-08-15',
        line_id: 'line-bf',
        retailer_line_account_id: 'rla-bf',
      },
      {
        writesEnabled: true,
        lineCode: 'big-fish',
        lineDefaultCurrency: 'USD',
        bigFishSellingEnabled: false,
      },
    );
    expect(blocked.error).toMatch(/Big Fish selling is not enabled/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('USD fixture stamps staff_usd_cad and ignores caller conversion_source', async () => {
    const overridden = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        original_amount: 200,
        original_currency: 'USD',
        exchange_rate: 1.38,
        exchange_rate_date: '2026-08-15',
        conversion_source: 'legacy_cad_column',
        line_id: 'line-bf',
        retailer_line_account_id: 'rla-bf',
      },
      {
        writesEnabled: true,
        lineCode: 'big-fish',
        lineDefaultCurrency: 'USD',
        bigFishSellingEnabled: true,
      },
    );
    expect(overridden.error).toBeNull();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_id: 'line-bf',
        original_currency: 'USD',
        conversion_source: 'staff_usd_cad',
        total_amount_cad: 276,
      }),
    );

    insertMock.mockClear();
    const cadLabeled = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        original_amount: 200,
        original_currency: 'CAD',
        exchange_rate: 1.38,
        exchange_rate_date: '2026-08-15',
        line_id: 'line-bf',
        retailer_line_account_id: 'rla-bf',
      },
      {
        writesEnabled: true,
        lineCode: 'big-fish',
        lineDefaultCurrency: 'USD',
        bigFishSellingEnabled: true,
      },
    );
    expect(cadLabeled.error).toMatch(/original_currency = USD/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects unknown default_currency; OGR USD requires FX', async () => {
    const eur = await insertOrder(
      {
        account_id: 9,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        total_amount_cad: 200,
        line_id: 'line-bf',
        retailer_line_account_id: 'rla-bf',
      },
      {
        writesEnabled: true,
        lineCode: 'big-fish',
        lineDefaultCurrency: 'EUR',
        bigFishSellingEnabled: true,
      },
    );
    expect(eur.error).toMatch(/USD or CAD/);
    expect(insertMock).not.toHaveBeenCalled();

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
      { writesEnabled: true, lineCode: 'ogr', lineDefaultCurrency: 'USD' },
    );
    expect(usd.error).toMatch(/exchange_rate/);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('Phase 7 directory split', () => {
  it('uses RLA relationship_status when the BF selling snapshot is on', () => {
    expect(
      usesLineRelationshipDirectorySplit({
        eaglePeakSelling: false,
        bigFishSelling: true,
        lineCode: 'big-fish',
      }),
    ).toBe(true);
    expect(
      usesLineRelationshipDirectorySplit({
        eaglePeakSelling: true,
        bigFishSelling: true,
        lineCode: 'ogr',
      }),
    ).toBe(false);
    expect(
      usesLineRelationshipDirectorySplit({
        eaglePeakSelling: false,
        bigFishSelling: false,
        lineCode: 'big-fish',
      }),
    ).toBe(false);

    const rcc = readFileSync(resolve(root, 'src/components/RepCommandCenter.tsx'), 'utf8');
    expect(rcc).toMatch(/bigFishSelling: lineCtx\.bigFishSelling/);
  });
});

describe('Phase 7 outreach + public catalog inert', () => {
  it('generate-draft is blocked for BF when outreach is off; empty catalog fails closed', () => {
    expect(
      assertBigFishGenerateDraftAllowed({ lineCode: 'big-fish', outreachEnabled: false }),
    ).toEqual({ ok: false, status: 403, error: BIG_FISH_OUTREACH_DISABLED });
    expect(
      assertBigFishGenerateDraftAllowed({ lineCode: 'big-fish', outreachEnabled: true }),
    ).toEqual({ ok: true });
    expect(assertBigFishGenerateDraftAllowed({ lineCode: 'ogr', outreachEnabled: false })).toEqual({
      ok: true,
    });
    expect(assertEaglePeakCatalogReadyForDraft(0)).toEqual({
      ok: false,
      status: 400,
      error: EAGLE_PEAK_CATALOG_EMPTY,
    });

    const draft = readFileSync(
      resolve(root, 'src/pages/api/staff/ogr-product-email/generate-draft.ts'),
      'utf8',
    );
    expect(draft).toMatch(/FEATURE_BIG_FISH_OUTREACH/);
    expect(draft).toMatch(/assertBigFishGenerateDraftAllowed/);
    expect(draft).toMatch(/code === 'big-fish'/);
    expect(draft).not.toMatch(/import\.meta\.env\.FEATURE_BIG_FISH/);
  });

  it('prep / send / cron still have no BF writes or FEATURE_BIG_FISH_*', () => {
    const nightly = readFileSync(resolve(root, 'src/lib/outreachNightlyPrep.ts'), 'utf8');
    expect(nightly).not.toMatch(/FEATURE_BIG_FISH/);
    expect(nightly).not.toMatch(/salesLineId/);
    expect(nightly).not.toMatch(/big-fish/);

    const prep = readFileSync(resolve(root, 'src/pages/api/staff/outreach/prep.ts'), 'utf8');
    expect(prep).not.toMatch(/FEATURE_BIG_FISH/);
    expect(prep).not.toMatch(/salesLineId/);

    const send = readFileSync(
      resolve(root, 'src/pages/api/staff/ogr-product-email/drafts/[id]/send.ts'),
      'utf8',
    );
    expect(send).not.toMatch(/FEATURE_BIG_FISH/);
    expect(send).not.toMatch(/big-fish/);

    const cron = readFileSync(resolve(root, 'src/pages/api/cron/outreach-nightly-prep.ts'), 'utf8');
    expect(cron).not.toMatch(/FEATURE_BIG_FISH/);
    expect(cron).not.toMatch(/salesLineId/);
  });

  it('public flag on or off: no new RPC; get_public_ogr_* still ogr; BF active stays false', () => {
    const publicSql = readFileSync(
      resolve(root, 'supabase/migrations/20260806190000_retailer_pricing_and_buyer_account.sql'),
      'utf8',
    );
    expect(publicSql).toMatch(/get_public_ogr_products/);
    expect(publicSql).toMatch(/where l\.code = 'ogr'/);
    expect(publicSql).not.toMatch(/get_public_big_fish/);

    const types = readFileSync(resolve(root, 'src/types/database.ts'), 'utf8');
    expect(types).toMatch(/get_public_ogr_products/);
    expect(types).not.toMatch(/get_public_big_fish/);

    const productUrls = readFileSync(resolve(root, 'src/lib/productUrls.ts'), 'utf8');
    expect(productUrls).not.toMatch(/big-fish/);
    expect(productUrls).not.toMatch(/FEATURE_BIG_FISH_PUBLIC_CATALOG/);

    const seeds = readFileSync(
      resolve(root, 'supabase/migrations/20260814110000_multi_line_phase1_line_seeds.sql'),
      'utf8',
    );
    expect(seeds).toMatch(/'big-fish'/);
    expect(seeds).toMatch(/default_currency = null/);
    expect(seeds).toMatch(/commission_rate = null/);
    expect(seeds).toMatch(/active = false/);

    const chat = readFileSync(resolve(root, 'src/pages/api/chat/ai-reply.ts'), 'utf8');
    expect(chat).not.toMatch(/FEATURE_BIG_FISH/);
    expect(chat).not.toMatch(/get_public_big_fish/);
  });

  it('territory admin stays bigFishNotConfigured with no BF allowlist', () => {
    const terr = readFileSync(resolve(root, 'src/lib/salesLineTerritories.ts'), 'utf8');
    expect(terr).toMatch(/bigFishNotConfigured/);
    expect(terr).toMatch(/TERRITORY_ADMIN_ERRORS\.bigFishNotConfigured/);
    expect(terr).not.toMatch(/BF_ALLOWED_GEO/);
    expect(TERRITORY_ADMIN_ERRORS.bigFishNotConfigured).toMatch(/not configured/);
  });
});
