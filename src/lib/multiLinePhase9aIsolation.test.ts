/**
 * Phase 9A — Messages/Calendar lineage + dynamic represented-line workspace.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  lineageVisibleOnSalesLine,
  partitionCrmRowsForSalesLine,
  resolveCrmLineage,
} from '@/lib/crmLineage';
import { isRepresentedLineStatus, REPRESENTED_LINE_STATUSES } from '@/lib/lines';
import { assertLineAllowsOperationalWrite } from '@/lib/retailerLineAccounts';

const root = process.cwd();
const OGR = 'ogr-line-id';
const EP = 'ep-line-id';

describe('Phase 9A CRM lineage precedence', () => {
  it('RLA wins over a null sales_line_id', () => {
    expect(resolveCrmLineage({ salesLineId: null, retailerLineAccountId: 'rla-ep' }, EP)).toEqual({
      kind: 'line',
      salesLineId: EP,
    });
  });

  it('both-null is legacy OGR-only', () => {
    expect(resolveCrmLineage({ salesLineId: null, retailerLineAccountId: null })).toEqual({
      kind: 'legacy_ogr',
    });
    expect(lineageVisibleOnSalesLine({ kind: 'legacy_ogr' }, OGR, OGR)).toBe(true);
    expect(lineageVisibleOnSalesLine({ kind: 'legacy_ogr' }, EP, OGR)).toBe(false);
  });

  it('EP/BF RLA with null sales_line_id is not visible in OGR', () => {
    const resolved = resolveCrmLineage({ salesLineId: null, retailerLineAccountId: 'rla-ep' }, EP);
    expect(lineageVisibleOnSalesLine(resolved, OGR, OGR)).toBe(false);
    expect(lineageVisibleOnSalesLine(resolved, EP, OGR)).toBe(true);
  });

  it('mismatched non-null lineage is omitted from every list', () => {
    const resolved = resolveCrmLineage({ salesLineId: OGR, retailerLineAccountId: 'rla-ep' }, EP);
    expect(resolved).toEqual({ kind: 'mismatch' });
    expect(lineageVisibleOnSalesLine(resolved, OGR, OGR)).toBe(false);
    expect(lineageVisibleOnSalesLine(resolved, EP, OGR)).toBe(false);

    const partitioned = partitionCrmRowsForSalesLine(
      [
        { id: 'mismatch', salesLineId: OGR, retailerLineAccountId: 'rla-ep' },
        { id: 'legacy', salesLineId: null, retailerLineAccountId: null },
      ],
      new Map([['rla-ep', EP]]),
      OGR,
      OGR,
    );
    expect(partitioned.mismatchIds).toEqual(['mismatch']);
    expect(partitioned.visible.map((r) => r.id)).toEqual(['legacy']);
  });
});

describe('Phase 9A list helpers use lineage', () => {
  it('message / Gmail / Calendar list helpers take salesLineId', () => {
    const messages = readFileSync(resolve(root, 'src/lib/messages.ts'), 'utf8');
    const threadList = messages.slice(
      messages.indexOf('export async function fetchMessageThreads'),
      messages.indexOf('export async function fetchMessagesForThread'),
    );
    expect(threadList).toMatch(/salesLineId/);
    expect(threadList).toMatch(
      /partitionCrmRowsForSalesLine|lineageVisibleOnSalesLine|retailer_line_account_id/,
    );

    const gmail = readFileSync(resolve(root, 'src/lib/google/gmailThreadLinks.ts'), 'utf8');
    const gmailList = gmail.slice(
      gmail.indexOf('export async function listConfirmedLinksForProspect'),
      gmail.indexOf('export async function upsertConfirmedGmailThreadLink'),
    );
    expect(gmailList).toMatch(/salesLineId/);
    expect(gmailList).toMatch(/partitionCrmRowsForSalesLine/);

    const calendar = readFileSync(resolve(root, 'src/lib/google/calendarEventLinks.ts'), 'utf8');
    const calList = calendar.slice(
      calendar.indexOf('export async function listConfirmedCalendarLinksForProspect'),
      calendar.indexOf('export async function upsertConfirmedCalendarEventLink'),
    );
    expect(calList).toMatch(/salesLineId/);
    expect(calList).toMatch(/partitionCrmRowsForSalesLine/);
  });
});

describe('Phase 9A represented workspace from status', () => {
  it('isRepresentedLineStatus allows confirmed/onboarding/active and excludes bkg/prospective', () => {
    expect(isRepresentedLineStatus('confirmed', 'north-cedar')).toBe(true);
    expect(isRepresentedLineStatus('onboarding', 'north-cedar')).toBe(true);
    expect(isRepresentedLineStatus('active', 'ogr')).toBe(true);
    expect(isRepresentedLineStatus('prospective', 'north-cedar')).toBe(false);
    expect(isRepresentedLineStatus('confirmed', 'bkg')).toBe(false);
    expect(isRepresentedLineStatus('declined', 'north-cedar')).toBe(false);
    expect([...REPRESENTED_LINE_STATUSES].sort()).toEqual(['active', 'confirmed', 'onboarding']);
  });

  it('fetchRepresentedLines queries status and does not pin three codes', () => {
    const src = readFileSync(resolve(root, 'src/lib/lines.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function fetchRepresentedLines'));
    const next = fn.indexOf('export async function fetchLineByCode');
    const body = next === -1 ? fn : fn.slice(0, next);
    expect(body).toMatch(/\.in\('status'/);
    expect(body).not.toMatch(/\.in\('code'/);
    expect(body).toMatch(/bkg/);
  });

  it('promoted represented line cannot sell, order, outreach, or show a catalog until configured', () => {
    expect(assertLineAllowsOperationalWrite({ code: 'north-cedar', status: 'confirmed' })).toBe(
      'reject',
    );
    expect(assertLineAllowsOperationalWrite({ code: 'north-cedar', status: 'onboarding' })).toBe(
      'reject',
    );

    const draft = readFileSync(
      resolve(root, 'src/pages/api/staff/ogr-product-email/generate-draft.ts'),
      'utf8',
    );
    expect(draft).toMatch(/assertRepresentedLineOutreachAllowed|SEED_OUTREACH_LINE_CODES/);

    const catalog = readFileSync(resolve(root, 'src/lib/catalog.ts'), 'utf8');
    expect(catalog).toMatch(/\.eq\('line_id', lineId\)/);
  });
});
