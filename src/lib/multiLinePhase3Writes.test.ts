/**
 * Phase 3 writes on line accounts — flag, dual-write, isolation, guards, currency,
 * badge payload, and unscoped Gmail/Calendar lists.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertLineAllowsOperationalWrite,
  isCrossLineBadgePayload,
  type CrossLineBadge,
} from '@/lib/retailerLineAccounts';
import {
  getStaffFeatureFlags,
  isMultiLineWritesEnabled,
  parseFeatureFlag,
} from '@/lib/staffFeatures';
import { insertOrder } from '@/lib/orders';

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

describe('Phase 3 FEATURE_MULTI_LINE_WRITES flag', () => {
  it('staff snapshot includes FEATURE_MULTI_LINE_WRITES default false', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    const prev = process.env.FEATURE_MULTI_LINE_WRITES;
    delete process.env.FEATURE_MULTI_LINE_WRITES;
    expect(isMultiLineWritesEnabled()).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_WRITES).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_UI).toBe(
      parseFeatureFlag(process.env.FEATURE_MULTI_LINE_UI),
    );
    if (prev !== undefined) process.env.FEATURE_MULTI_LINE_WRITES = prev;
  });

  it('staff snapshot does not enable writes without the UI flag', () => {
    const prevWrites = process.env.FEATURE_MULTI_LINE_WRITES;
    const prevUi = process.env.FEATURE_MULTI_LINE_UI;
    process.env.FEATURE_MULTI_LINE_WRITES = '1';
    delete process.env.FEATURE_MULTI_LINE_UI;
    expect(isMultiLineWritesEnabled()).toBe(true);
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_WRITES).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_UI).toBe(false);
    if (prevWrites !== undefined) process.env.FEATURE_MULTI_LINE_WRITES = prevWrites;
    else delete process.env.FEATURE_MULTI_LINE_WRITES;
    if (prevUi !== undefined) process.env.FEATURE_MULTI_LINE_UI = prevUi;
    else delete process.env.FEATURE_MULTI_LINE_UI;
  });

  it('features API and AuthGate snapshot the writes flag without PUBLIC_', () => {
    const api = readFileSync(resolve(root, 'src/pages/api/staff/features.ts'), 'utf8');
    expect(api).toMatch(/getStaffFeatureFlags/);
    expect(api).not.toMatch(/PUBLIC_FEATURE_MULTI_LINE_WRITES/);

    const staff = readFileSync(resolve(root, 'src/lib/staffFeatures.ts'), 'utf8');
    expect(staff).toMatch(/FEATURE_MULTI_LINE_WRITES/);
    expect(staff).toMatch(/isMultiLineWritesEnabled/);
    expect(staff).not.toMatch(/PUBLIC_FEATURE_MULTI_LINE_WRITES/);

    const gate = readFileSync(resolve(root, 'src/components/auth/AuthGate.tsx'), 'utf8');
    expect(gate).toMatch(/FEATURE_MULTI_LINE_WRITES/);
    expect(gate).toMatch(/multiLineWrites/);
  });
});

describe('Phase 3 convert dual-write + isolation (source)', () => {
  const convert = readFileSync(resolve(root, 'src/lib/convertToActiveAccount.ts'), 'utf8');
  const dualWrite = readFileSync(
    resolve(root, 'supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql'),
    'utf8',
  );

  it('convert uses OGR fallback and never writes prospects commercial columns', () => {
    expect(convert).toMatch(/resolveWriteSalesLineId/);
    expect(convert).not.toMatch(/function convertLegacy/);
    expect(convert).not.toMatch(/account_status: 'active_account'/);
    expect(convert).not.toMatch(/account_status: 'prospect'/);
    expect(convert).toMatch(/Does not write prospects.account_status/);
    expect(dualWrite).toMatch(/assert_line_id_is_ogr_or_null/);
  });

  it('OGR convert updates RLA opened without dual-writing prospects', () => {
    expect(convert).toMatch(/relationshipStatus: 'opened'/);
    expect(convert).toMatch(/const isOgr = line\.data\.code === 'ogr'/);
    expect(convert).not.toMatch(
      /if \(isOgr\) \{[\s\S]*account_status: 'active_account'[\s\S]*\.eq\('id', input\.accountId\)/,
    );
  });

  it('flag on + Eagle Peak convert writes RLA only and does not flip prospects', () => {
    expect(convert).toMatch(/if \(!isOgr\) \{[\s\S]*return \{ ok: true, alreadyActive: false/);
    expect(convert).toMatch(
      /if \(!isOgr\) \{[\s\S]*alreadyActive: false[\s\S]*upsertAccountReorderSettings/,
    );
  });
});

describe('Phase 3 write guards', () => {
  const phase3 = readFileSync(
    resolve(root, 'supabase/migrations/20260815120000_multi_line_phase3_write_guards.sql'),
    'utf8',
  );

  it('assertLineAllowsOperationalWrite rejects prospective / bkg and blocks EP/BF UI', () => {
    expect(assertLineAllowsOperationalWrite({ code: 'ogr', status: 'active' })).toBe('allow');
    expect(assertLineAllowsOperationalWrite({ code: 'eagle-peak', status: 'onboarding' })).toBe(
      'ui_blocked',
    );
    expect(assertLineAllowsOperationalWrite({ code: 'big-fish', status: 'confirmed' })).toBe(
      'ui_blocked',
    );
    expect(assertLineAllowsOperationalWrite({ code: 'bkg', status: 'paused' })).toBe('reject');
    expect(assertLineAllowsOperationalWrite({ code: 'ogr', status: 'prospective' })).toBe('reject');
    expect(assertLineAllowsOperationalWrite({ code: 'eagle-peak', status: 'declined' })).toBe(
      'reject',
    );
    expect(assertLineAllowsOperationalWrite({ code: 'big-fish', status: 'terminated' })).toBe(
      'reject',
    );
  });

  it('migration rejects bkg / prospective operational writes and mismatched line_id / RLA', () => {
    expect(phase3).toMatch(/assert_line_allows_operational_write/);
    expect(phase3).toMatch(/v_code = 'bkg'/);
    expect(phase3).toMatch(/'prospective', 'declined', 'terminated'/);
    expect(phase3).toMatch(/enforce_order_call_line_matches_rla/);
    expect(phase3).toMatch(/does not match retailer_line_account sales_line_id/);
    expect(phase3).not.toMatch(/assert_line_id_is_ogr_or_null/);
  });
});

describe('Phase 3 insertOrder currency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    singleMock.mockResolvedValue({ data: { id: 'ord-1' }, error: null });
  });

  it('OGR insert does not set original_currency = USD', async () => {
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

    const cad = await insertOrder(
      {
        account_id: 1,
        order_type: 'initial',
        season: 'fathers_day',
        order_date: '2026-08-15',
        total_amount_cad: 100,
        line_id: 'line-ogr',
        retailer_line_account_id: 'rla-ogr',
      },
      { writesEnabled: true, lineCode: 'ogr' },
    );
    expect(cad.error).toBeNull();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        original_currency: 'CAD',
        conversion_source: 'legacy_cad_column',
      }),
    );
    const payload = insertMock.mock.calls[0]?.[0] as { original_currency?: string };
    expect(payload.original_currency).not.toBe('USD');
  });
});

describe('Phase 3 badge payload + unscoped lists', () => {
  it('cross-line badge helper still name + status only', () => {
    const ok: CrossLineBadge = {
      lineCode: 'eagle-peak',
      lineName: 'Eagle Peak',
      relationshipStatus: 'prospect',
    };
    expect(isCrossLineBadgePayload(ok)).toBe(true);
    expect(isCrossLineBadgePayload({ ...ok, orders: 1 })).toBe(false);
  });

  it('Gmail / Calendar / message list helpers are line-scoped', () => {
    const gmail = readFileSync(resolve(root, 'src/lib/google/gmailThreadLinks.ts'), 'utf8');
    const gmailList = gmail.slice(
      gmail.indexOf('export async function listConfirmedLinksForProspect'),
      gmail.indexOf('export async function upsertConfirmedGmailThreadLink'),
    );
    expect(gmailList).toMatch(/eq\('prospect_id'/);
    expect(gmailList).toMatch(/salesLineId/);
    expect(gmailList).toMatch(/partitionCrmRowsForSalesLine/);

    const calendar = readFileSync(resolve(root, 'src/lib/google/calendarEventLinks.ts'), 'utf8');
    const calList = calendar.slice(
      calendar.indexOf('export async function listConfirmedCalendarLinksForProspect'),
      calendar.indexOf('export async function upsertConfirmedCalendarEventLink'),
    );
    expect(calList).toMatch(/eq\('prospect_id'/);
    expect(calList).toMatch(/salesLineId/);
    expect(calList).toMatch(/partitionCrmRowsForSalesLine/);

    const messages = readFileSync(resolve(root, 'src/lib/messages.ts'), 'utf8');
    const threadList = messages.slice(
      messages.indexOf('export async function fetchMessageThreads'),
      messages.indexOf('export async function fetchMessagesForThread'),
    );
    expect(threadList).toMatch(/salesLineId/);
    expect(threadList).toMatch(/partitionCrmRowsForSalesLine/);
  });

  it('prep / send / nightly prep signatures stay unchanged', () => {
    const prep = readFileSync(resolve(root, 'src/pages/api/staff/outreach/prep.ts'), 'utf8');
    expect(prep).toMatch(/getOutreachGoalSettings\(gate\.supabase\)/);
    expect(prep).not.toMatch(/sales_line_id/);

    const nightly = readFileSync(resolve(root, 'src/lib/outreachNightlyPrep.ts'), 'utf8');
    expect(nightly).not.toMatch(/FEATURE_MULTI_LINE_WRITES/);
    expect(nightly).not.toMatch(/salesLineId/);
  });
});
