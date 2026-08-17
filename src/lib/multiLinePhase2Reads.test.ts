/**
 * Phase 2 line-context reads — flag, picker exclusions, scoped empty books,
 * badge payload shape, wrong-line account resolve, write-path untouched.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getStaffFeatureFlags, isMultiLineUiEnabled, parseFeatureFlag } from '@/lib/staffFeatures';
import {
  isRepresentedLineCode,
  isRepresentedLineStatus,
  REPRESENTED_LINE_STATUSES,
} from '@/lib/lines';
import { isCrossLineBadgePayload, type CrossLineBadge } from '@/lib/retailerLineAccounts';

const root = process.cwd();

describe('Phase 2 FEATURE_MULTI_LINE_UI flag', () => {
  it('defaults off and parses truthy values only', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    expect(parseFeatureFlag('')).toBe(false);
    expect(parseFeatureFlag('0')).toBe(false);
    expect(parseFeatureFlag('false')).toBe(false);
    expect(parseFeatureFlag('1')).toBe(true);
    expect(parseFeatureFlag('TRUE')).toBe(true);
    expect(parseFeatureFlag('yes')).toBe(true);
    expect(parseFeatureFlag('on')).toBe(true);
  });

  it('isMultiLineUiEnabled is false when env unset (flag-off path)', () => {
    const prev = process.env.FEATURE_MULTI_LINE_UI;
    delete process.env.FEATURE_MULTI_LINE_UI;
    expect(isMultiLineUiEnabled()).toBe(false);
    expect(getStaffFeatureFlags().FEATURE_MULTI_LINE_UI).toBe(false);
    if (prev !== undefined) process.env.FEATURE_MULTI_LINE_UI = prev;
  });

  it('staff features API uses requireApprovedStaffClient and no PUBLIC_ flag', () => {
    const src = readFileSync(resolve(root, 'src/pages/api/staff/features.ts'), 'utf8');
    expect(src).toMatch(/requireApprovedStaffClient/);
    expect(src).toMatch(/getStaffFeatureFlags/);
    expect(src).not.toMatch(/PUBLIC_FEATURE_MULTI_LINE_UI/);
    expect(src).toMatch(/prerender = false/);
  });
});

describe('Phase 2 represented picker membership', () => {
  it('membership is status-based; seed codes are not the picker union', () => {
    expect(isRepresentedLineStatus('active', 'ogr')).toBe(true);
    expect(isRepresentedLineStatus('onboarding', 'eagle-peak')).toBe(true);
    expect(isRepresentedLineStatus('confirmed', 'north-cedar')).toBe(true);
    expect(isRepresentedLineStatus('confirmed', 'bkg')).toBe(false);
    expect(isRepresentedLineStatus('prospective', 'north-cedar')).toBe(false);
    expect(isRepresentedLineCode('bkg')).toBe(false);
    expect(isRepresentedLineCode('typo-line')).toBe(false);
  });

  it('fetchRepresentedLines filters status and excludes bkg (source)', () => {
    const src = readFileSync(resolve(root, 'src/lib/lines.ts'), 'utf8');
    expect(src).toMatch(/fetchRepresentedLines/);
    expect(src).toMatch(/REPRESENTED_LINE_STATUSES/);
    expect(src).toMatch(/\.neq\('code', 'bkg'\)/);
    expect(src).toMatch(/\.in\('status'/);
    const fetchFn = src.slice(src.indexOf('export async function fetchRepresentedLines'));
    const nextExport = fetchFn.indexOf('export async function fetchLineByCode');
    const body = nextExport === -1 ? fetchFn : fetchFn.slice(0, nextExport);
    expect(body).not.toMatch(/\.in\('code'/);
    expect([...REPRESENTED_LINE_STATUSES].sort()).toEqual(['active', 'confirmed', 'onboarding']);
  });
});

describe('Phase 2 scoped reads + empty books', () => {
  it('prospects / catalog / contacts accept salesLineId or lineId scoping', () => {
    const prospects = readFileSync(resolve(root, 'src/lib/prospects.ts'), 'utf8');
    expect(prospects).toMatch(/salesLineId\?:/);
    expect(prospects).toMatch(/retailer_line_accounts/);

    const catalog = readFileSync(resolve(root, 'src/lib/catalog.ts'), 'utf8');
    expect(catalog).toMatch(/FetchCatalogItemsOptions/);
    expect(catalog).toMatch(/lineId\?:/);
    expect(catalog).toMatch(/lineCode\?:/);

    const contacts = readFileSync(resolve(root, 'src/lib/accountContacts.ts'), 'utf8');
    expect(contacts).toMatch(/salesLineId\?:/);
    expect(contacts).toMatch(/retailer_line_contacts/);

    const calls = readFileSync(resolve(root, 'src/lib/calls.ts'), 'utf8');
    expect(calls).toMatch(/line_id, retailer_line_account_id/);
    expect(calls).toMatch(/salesLineId/);

    const orders = readFileSync(resolve(root, 'src/lib/orders.ts'), 'utf8');
    expect(orders).toMatch(/FetchOrdersOptions/);
    expect(orders).toMatch(/salesLineId/);
    // insertOrder write path unchanged signature area
    expect(orders).toMatch(/export async function insertOrder/);
  });

  it('outreach GET briefing/leads accept sales_line_id and empty non-OGR books', () => {
    const briefing = readFileSync(
      resolve(root, 'src/pages/api/staff/outreach/briefing.ts'),
      'utf8',
    );
    expect(briefing).toMatch(/resolveSalesLineQuery/);
    expect(briefing).toMatch(/sales_line_id/);

    const leads = readFileSync(resolve(root, 'src/pages/api/staff/outreach/leads.ts'), 'utf8');
    expect(leads).toMatch(/resolveSalesLineQuery/);
    expect(leads).toMatch(/leads: \[\]/);

    const assemble = readFileSync(resolve(root, 'src/lib/outreachBriefing.ts'), 'utf8');
    expect(assemble).toMatch(/salesLineCode/);
    expect(assemble).toMatch(/lineCode !== 'ogr'/);
  });
});

describe('Phase 2 cross-line badges + wrong-line account', () => {
  it('badge helper payload is name + relationship status only', () => {
    const ok: CrossLineBadge = {
      lineCode: 'eagle-peak',
      lineName: 'Eagle Peak',
      relationshipStatus: 'prospect',
    };
    expect(isCrossLineBadgePayload(ok)).toBe(true);
    expect(
      isCrossLineBadgePayload({
        ...ok,
        orders: 1,
      }),
    ).toBe(false);
    expect(
      isCrossLineBadgePayload({
        lineCode: 'x',
        lineName: 'Y',
        relationshipStatus: 'opened',
        revenue: 100,
      }),
    ).toBe(false);

    const src = readFileSync(resolve(root, 'src/lib/retailerLineAccounts.ts'), 'utf8');
    expect(src).toMatch(/fetchCrossLineBadges/);
    expect(src).toMatch(/resolveLineAccountForSlug/);
    expect(src).toMatch(/wrong_line/);
  });

  it('invalid slug treated as unknown (AuthGate / isRepresentedLineStatus)', () => {
    expect(isRepresentedLineStatus('confirmed', 'bkg')).toBe(false);
    expect(isRepresentedLineCode('not-a-line')).toBe(false);
    const gate = readFileSync(resolve(root, 'src/components/auth/AuthGate.tsx'), 'utf8');
    expect(gate).toMatch(/Unknown line/);
    expect(gate).toMatch(/FEATURE_MULTI_LINE_UI/);
  });
});

describe('Phase 2 write-path files untouched', () => {
  it('does not modify convert / LogCallModal / insertOrder call sites as Phase 2 edits', () => {
    // Snapshot: these files must still exist with their write entrypoints.
    const convert = readFileSync(resolve(root, 'src/lib/convertToActiveAccount.ts'), 'utf8');
    expect(convert).toMatch(/export async function convert/);

    const logCall = readFileSync(resolve(root, 'src/components/LogCallModal.tsx'), 'utf8');
    expect(logCall).toMatch(/from\('calls'\)/);

    const dualWrite = readFileSync(
      resolve(root, 'supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql'),
      'utf8',
    );
    expect(dualWrite).toMatch(/sync_ogr_retailer_line_account_from_prospect/);
  });
});
