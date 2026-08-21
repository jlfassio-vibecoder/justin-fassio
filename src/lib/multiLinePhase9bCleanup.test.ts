/**
 * Phase 9B — application dual-write cutover, OGR overlay, integrity FKs.
 * Sync triggers remain until 9C.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ogrRlaParityFails, OGR_RLA_PARITY_SQL } from '@/lib/ogrCommercial';

const root = process.cwd();

describe('Phase 9B convert/demote do not write prospects commercial columns', () => {
  const convert = readFileSync(resolve(root, 'src/lib/convertToActiveAccount.ts'), 'utf8');

  it('convert and demote update RLA only', () => {
    expect(convert).toMatch(/relationshipStatus: 'opened'/);
    expect(convert).toMatch(/relationshipStatus: 'prospect'/);
    expect(convert).toMatch(/resolveWriteSalesLineId/);
    expect(convert).not.toMatch(/function convertLegacy/);
    expect(convert).not.toMatch(/function demoteLegacy/);
    expect(convert).not.toMatch(/account_status: 'active_account'/);
    expect(convert).not.toMatch(/account_status: 'prospect'/);
    expect(convert).not.toMatch(/from\('prospects'\)[\s\S]*account_status/);
    expect(convert).toMatch(
      /Does not write prospects.account_status \/ converted_at \/ initial_order_date/,
    );
  });
});

describe('Phase 9B directory overlay and OGR fallback writes', () => {
  it('fetchProspects overlays OGR RLA with flags off', () => {
    const src = readFileSync(resolve(root, 'src/lib/prospects.ts'), 'utf8');
    expect(src).toMatch(/overlayLineId = requestedLineId \?\? \(await resolveOgrLineId\(\)\)/);
    expect(src).toMatch(/overlayProspectCommercial/);
    expect(src).toMatch(/accountStatusFromRelationship/);
    expect(src).not.toMatch(/\.eq\('account_status', options\.accountStatus\)/);
  });

  it('contacts directory overlays RLA status; junction requires explicit salesLineId', () => {
    const src = readFileSync(resolve(root, 'src/lib/accountContacts.ts'), 'utf8');
    expect(src).toMatch(/overlayContactAccountStatus/);
    expect(src).toMatch(/resolveOgrLineId/);
    const junction = src.slice(src.indexOf('async function maybeUpsertLineContactJunction'));
    expect(junction).toMatch(/fetchOperationalLineAccount/);
    expect(junction).not.toMatch(/ensureRetailerLineAccount/);
    expect(junction).not.toMatch(/resolveWriteSalesLineId/);
    expect(junction).not.toMatch(/if \(.*writesEnabled/);
    expect(junction).not.toMatch(/options\?\.writesEnabled/);
  });

  it('flag-off new retailer, contact, order, call, notes, wholesale persist RLA without sync', () => {
    const createProspect = readFileSync(resolve(root, 'src/lib/createEnrichedProspect.ts'), 'utf8');
    expect(createProspect).toMatch(/stampLineAccountIfNeeded/);
    expect(createProspect).toMatch(/eq\('code', 'ogr'\)/);
    expect(createProspect).toMatch(/retailer_line_accounts/);
    expect(createProspect).toMatch(/retailer_line_contacts/);

    const createContact = readFileSync(resolve(root, 'src/lib/createEnrichedContact.ts'), 'utf8');
    expect(createContact).toMatch(/stampLineContactIfNeeded/);

    const wholesale = readFileSync(resolve(root, 'src/lib/wholesaleProspectMatch.ts'), 'utf8');
    expect(wholesale).toMatch(/retailer_line_accounts/);
    expect(wholesale).toMatch(/retailer_line_contacts/);
    expect(wholesale).not.toMatch(/account_status: 'active_account'/);

    const notes = readFileSync(resolve(root, 'src/lib/prospects.ts'), 'utf8');
    const notesFn = notes.slice(notes.indexOf('export async function updateProspectNotes'));
    expect(notesFn).toMatch(/resolveWriteSalesLineId/);
    expect(notesFn).not.toMatch(/if \(options\?\.writesEnabled\)/);

    const orders = readFileSync(resolve(root, 'src/lib/orders.ts'), 'utf8');
    expect(orders).toMatch(
      /if \(!options\.writesEnabled && !payload\.line_id && !payload\.retailer_line_account_id\)/,
    );
    expect(orders).toMatch(/resolveOgrLineId/);

    const logCall = readFileSync(resolve(root, 'src/lib/logCallForm.ts'), 'utf8');
    expect(logCall).toMatch(/input\.salesLineId \|\| \(await resolveOgrLineId\(\)\)/);
    expect(logCall).not.toMatch(/multiLineWrites && .*salesLineId/);

    const logCallForm = readFileSync(resolve(root, 'src/components/LogCallFormModal.tsx'), 'utf8');
    expect(logCallForm).not.toMatch(/line\.multiLineWrites && line\.salesLineId/);

    const orderModal = readFileSync(
      resolve(root, 'src/components/AccountOrderHistoryModal.tsx'),
      'utf8',
    );
    expect(orderModal).toMatch(/line\.salesLineId \|\| \(await resolveOgrLineId\(\)\)/);
    expect(orderModal).not.toMatch(/line\.multiLineWrites && line\.salesLineId/);
  });

  it('OGR outreach eligibility reads RLA status internally', () => {
    const select = readFileSync(resolve(root, 'src/lib/outreachSelectTargets.ts'), 'utf8');
    expect(select).toMatch(/relationship_status, line_account_markers/);
    expect(select).toMatch(/isRlaInOutreachPool/);
    expect(select).not.toMatch(/\.eq\('account_status', 'prospect'\)/);

    const briefing = readFileSync(resolve(root, 'src/lib/outreachBriefing.ts'), 'utf8');
    expect(briefing).toMatch(/relationship_status', 'opened'/);
    expect(briefing).not.toMatch(/\.eq\('account_status', 'active_account'\)/);

    const attribution = readFileSync(resolve(root, 'src/lib/outreachAttribution.ts'), 'utf8');
    expect(attribution).toMatch(/relationship_status', 'opened'/);
    expect(attribution).not.toMatch(/\.eq\('account_status', 'active_account'\)/);
  });
});

describe('Phase 9B integrity FKs and parity gate', () => {
  const migration = readFileSync(
    resolve(root, 'supabase/migrations/20260817120000_multi_line_phase9b_integrity_fks.sql'),
    'utf8',
  );
  const rollback = readFileSync(resolve(root, 'plan/multi-line-phase9b-rollback.sql'), 'utf8');
  const schema = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');

  it('adds NOT VALID FKs, queues orphans on reason, and does not drop columns', () => {
    expect(migration).toMatch(/orphan_call_fk/);
    expect(migration).toMatch(/orphan_prospect_update_fk/);
    expect(migration).toMatch(/reason/);
    expect(migration).not.toMatch(/insert into[\s\S]*issue_type/);
    expect(migration).toMatch(/not valid/i);
    expect(migration).toMatch(/on delete restrict/i);
    expect(migration).not.toMatch(/alter table[\s\S]{0,80}drop column/i);
    expect(migration).not.toMatch(/rename to/i);
    expect(migration).not.toMatch(/validate constraint calls_prospect_id_fkey/i);
    expect(migration).not.toMatch(/validate constraint prospect_updates_prospect_id_fkey/i);
    expect(schema).toMatch(/calls_prospect_id_fkey/);
    expect(schema).toMatch(/prospect_updates_prospect_id_fkey/);
    expect(schema).toMatch(/not valid/i);
  });

  it('rollback SQL matches constraint and reason names', () => {
    expect(rollback).toMatch(/calls_prospect_id_fkey/);
    expect(rollback).toMatch(/prospect_updates_prospect_id_fkey/);
    expect(rollback).toMatch(/orphan_call_fk/);
    expect(rollback).toMatch(/orphan_prospect_update_fk/);
    expect(rollback).not.toMatch(/insert into[\s\S]*issue_type/);
  });

  it('parity SQL is documented and fail-closed on missing/duplicate/unexpected mapping', () => {
    expect(OGR_RLA_PARITY_SQL).toMatch(/missing_ogr_rla/);
    expect(OGR_RLA_PARITY_SQL).toMatch(/duplicate_ogr_rla/);
    expect(OGR_RLA_PARITY_SQL).toMatch(/unexpected_status_pairs/);
    expect(OGR_RLA_PARITY_SQL).toMatch(/date_mismatches/);
    expect(
      ogrRlaParityFails({
        prospectCount: 1,
        ogrRlaCount: 1,
        missingOgrRla: 1,
        duplicateOgrRla: 0,
        unexpectedStatusPairs: 0,
        dateMismatches: 0,
      }),
    ).toBe(true);
    expect(
      ogrRlaParityFails({
        prospectCount: 1,
        ogrRlaCount: 2,
        missingOgrRla: 0,
        duplicateOgrRla: 1,
        unexpectedStatusPairs: 0,
        dateMismatches: 0,
      }),
    ).toBe(true);
    expect(
      ogrRlaParityFails({
        prospectCount: 1,
        ogrRlaCount: 1,
        missingOgrRla: 0,
        duplicateOgrRla: 0,
        unexpectedStatusPairs: 1,
        dateMismatches: 0,
      }),
    ).toBe(true);
    expect(
      ogrRlaParityFails({
        prospectCount: 1,
        ogrRlaCount: 1,
        missingOgrRla: 0,
        duplicateOgrRla: 0,
        unexpectedStatusPairs: 0,
        dateMismatches: 1,
      }),
    ).toBe(true);
    expect(
      ogrRlaParityFails({
        prospectCount: 1,
        ogrRlaCount: 1,
        missingOgrRla: 0,
        duplicateOgrRla: 0,
        unexpectedStatusPairs: 0,
        dateMismatches: 0,
      }),
    ).toBe(false);
  });

  it('does not drop 1C sync triggers in 9B', () => {
    expect(migration).not.toMatch(/sync_ogr_retailer_line_account_from_prospect/);
    expect(migration).not.toMatch(/drop trigger/i);
    expect(schema).toMatch(/sync_ogr_retailer_line_account_from_prospect/);
    expect(schema).toMatch(/fill_ogr_retailer_line_account_on_order/);
  });
});
