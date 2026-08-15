import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backfillMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814120000_multi_line_phase1_ogr_backfill.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');

describe('Phase 1B OGR backfill migration', () => {
  it('inserts OGR retailer_line_accounts from prospects', () => {
    expect(backfillMigration).toMatch(/insert into retailer_line_accounts[\s\S]*from prospects p/i);
    expect(backfillMigration).toMatch(/join lines ogr on ogr\.code = 'ogr'/i);
    expect(backfillMigration).toMatch(/retailer_id = p\.id|p\.id as retailer_id/i);
  });

  it('never inserts Eagle Peak, Big Fish, BKG, or prospective accounts', () => {
    // The only INSERT into retailer_line_accounts must target ogr.
    expect(backfillMigration).toMatch(
      /insert into retailer_line_accounts \([\s\S]*?join lines ogr on ogr\.code = 'ogr'/i,
    );
    expect(backfillMigration).not.toMatch(
      /insert into retailer_line_accounts[\s\S]*?join lines[\s\S]*?code = 'eagle-peak'/i,
    );
    expect(backfillMigration).not.toMatch(
      /insert into retailer_line_accounts[\s\S]*?join lines[\s\S]*?code = 'big-fish'/i,
    );
    expect(backfillMigration).not.toMatch(
      /insert into retailer_line_accounts[\s\S]*?join lines[\s\S]*?code = 'bkg'/i,
    );
    expect(backfillMigration).toMatch(
      /hard stop: % retailer_line_accounts exist for eagle-peak\/big-fish\/bkg\/prospective/i,
    );
  });

  it('maps the three account_status values only', () => {
    expect(backfillMigration).toMatch(/when 'prospect' then 'prospect'/i);
    expect(backfillMigration).toMatch(/when 'active_account' then 'opened'/i);
    expect(backfillMigration).toMatch(/when 'inactive' then 'inactive'/i);
    expect(backfillMigration).not.toMatch(/then 'qualified'/i);
    expect(backfillMigration).not.toMatch(/then 'terminated'/i);
  });

  it('assigns territory only when territories.code = bc', () => {
    expect(backfillMigration).toMatch(/when t\.code = 'bc' then ogr_bc\.id/i);
    expect(backfillMigration).toMatch(/'non_bc_territory'/);
    expect(backfillMigration).toMatch(/'ambiguous_territory'/);
    expect(backfillMigration).toMatch(/t\.code in \('or', 'wa', 'ca', 'ab', 'norcal'\)/);
  });

  it('queues non-BC / ambiguous / orphans and never deletes operational rows', () => {
    expect(backfillMigration).toMatch(/insert into migration_review_queue/i);
    expect(backfillMigration).toMatch(/'orphan_call'/);
    expect(backfillMigration).toMatch(/'orphan_prospect_update'/);
    expect(backfillMigration).not.toMatch(/delete from orders/i);
    expect(backfillMigration).not.toMatch(/delete from calls/i);
    expect(backfillMigration).not.toMatch(/delete from prospects/i);
    expect(backfillMigration).not.toMatch(/delete from account_contacts/i);
  });

  it('hard-stops on non-OGR orders.line_id and calls.line_id', () => {
    expect(backfillMigration).toMatch(/orders\.line_id reference non-OGR lines/i);
    expect(backfillMigration).toMatch(/calls\.line_id reference non-OGR lines/i);
    expect(backfillMigration).toMatch(/l\.code <> 'ogr'/);
  });

  it('fills CAD legacy_cad_column only without inventing USD on orders', () => {
    expect(backfillMigration).toMatch(/conversion_source = 'legacy_cad_column'/);
    expect(backfillMigration).toMatch(/original_currency = 'CAD'/);
    expect(backfillMigration).toMatch(/converted_currency = 'CAD'/);
    expect(backfillMigration).toMatch(/exchange_rate = 1/);
    expect(backfillMigration).not.toMatch(/update orders[\s\S]*original_currency = 'USD'/i);
    expect(backfillMigration).not.toMatch(/drop column.*total_amount_cad/i);
  });

  it('uses idempotent WHERE NOT EXISTS / IS NULL predicates', () => {
    expect(backfillMigration).toMatch(/where not exists \(/i);
    expect(backfillMigration).toMatch(/retailer_line_account_id is null/i);
    expect(backfillMigration).toMatch(/relationship_status <> 'terminated'/i);
    expect(backfillMigration).toMatch(
      /on conflict \(retailer_line_account_id, account_contact_id\) do nothing/i,
    );
  });

  it('contains end-of-migration count assertions', () => {
    expect(backfillMigration).toMatch(/Phase 1B assert failed/i);
    expect(backfillMigration).toMatch(/OGR retailer_line_accounts \(%\) <> prospects \(%\)/i);
    expect(backfillMigration).toMatch(/retailer_line_targets count is %/i);
  });

  it('adds review-queue unique index mirrored in schema.sql', () => {
    expect(backfillMigration).toMatch(/migration_review_queue_unresolved_entity_uidx/i);
    expect(backfillMigration).toMatch(
      /on migration_review_queue \(entity_type, entity_id, reason\)/i,
    );
    expect(schemaSql).toMatch(/migration_review_queue_unresolved_entity_uidx/i);
  });

  it('does not create dual-write triggers', () => {
    expect(backfillMigration).not.toMatch(/after insert or update on prospects/i);
    expect(backfillMigration).not.toMatch(/after insert on account_contacts/i);
    expect(backfillMigration).not.toMatch(/dual_write/i);
    expect(backfillMigration).not.toMatch(/20260814130000_multi_line_phase1_dual_write/i);
  });
});
