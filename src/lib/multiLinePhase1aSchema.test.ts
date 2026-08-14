import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tablesMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814100000_multi_line_phase1_tables.sql'),
  'utf8',
);
const seedsMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814110000_multi_line_phase1_line_seeds.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');

describe('Phase 1A multi-line schema foundation', () => {
  it('creates required new tables and preserves prospects', () => {
    for (const table of [
      'principals',
      'sales_line_territories',
      'retailer_line_accounts',
      'retailer_line_contacts',
      'retailer_field_changes',
      'retailer_line_targets',
      'migration_review_queue',
    ]) {
      expect(tablesMigration).toMatch(new RegExp(`create table if not exists ${table}`, 'i'));
      expect(schemaSql).toMatch(new RegExp(`create table if not exists ${table}`, 'i'));
    }
    expect(tablesMigration).not.toMatch(/drop table.*prospects/i);
    expect(tablesMigration).not.toMatch(/rename.*prospects/i);
    expect(tablesMigration).not.toMatch(/insert into retailer_line_accounts/i);
  });

  it('extends lines with approved status and acquisition_stage enums', () => {
    for (const status of [
      'prospective',
      'confirmed',
      'onboarding',
      'active',
      'paused',
      'declined',
      'terminated',
    ]) {
      expect(tablesMigration).toContain(`'${status}'`);
    }
    for (const stage of [
      'identified',
      'researching',
      'contact_requested',
      'conversation',
      'evaluating',
      'negotiating',
      'decision_pending',
    ]) {
      expect(tablesMigration).toContain(`'${stage}'`);
    }
    expect(tablesMigration).toMatch(/add column if not exists status/i);
    // active boolean must remain — never dropped in Phase 1A
    expect(tablesMigration).not.toMatch(/drop column.*\bactive\b/i);
  });

  it('supports unconfirmed rights_type and does not invent non_exclusive for unknown', () => {
    expect(tablesMigration).toContain("'unconfirmed'");
    expect(tablesMigration).toContain("'exclusive'");
    expect(tablesMigration).toContain("'limited_exclusive'");
    expect(tablesMigration).toContain("'non_exclusive'");
    expect(seedsMigration).toMatch(/rights_type[\s\S]*'unconfirmed'/);
    expect(seedsMigration).not.toMatch(/rights_type[\s\S]*'non_exclusive'/);
  });

  it('enforces same-line territory via composite foreign key', () => {
    expect(tablesMigration).toMatch(
      /constraint retailer_line_accounts_territory_same_line_fkey[\s\S]*foreign key \(sales_line_territory_id, sales_line_id\)[\s\S]*references sales_line_territories \(id, sales_line_id\)/i,
    );
  });

  it('enforces one operational account per retailer and line', () => {
    expect(tablesMigration).toMatch(
      /retailer_line_accounts_retailer_line_operational_uidx[\s\S]*\(retailer_id, sales_line_id\)[\s\S]*where relationship_status <> 'terminated'/i,
    );
  });

  it('enforces one primary contact per line account', () => {
    expect(tablesMigration).toMatch(
      /retailer_line_contacts_one_primary_uidx[\s\S]*\(retailer_line_account_id\)[\s\S]*where is_primary/i,
    );
  });

  it('rejects non-prospective retailer_line_targets via trigger', () => {
    expect(tablesMigration).toMatch(/enforce_retailer_line_target_prospective/i);
    expect(tablesMigration).toMatch(/retailer_line_targets may only reference prospective lines/i);
    expect(tablesMigration).toMatch(/create trigger retailer_line_targets_prospective_only/i);
  });

  it('rejects operational accounts on prospective lines via trigger', () => {
    expect(tablesMigration).toMatch(/enforce_retailer_line_account_not_prospective/i);
    expect(tablesMigration).toMatch(
      /retailer_line_accounts cannot be created for prospective lines/i,
    );
  });

  it('rejects orders and outreach against prospective lines via triggers', () => {
    expect(tablesMigration).toMatch(/enforce_order_not_prospective_line/i);
    expect(tablesMigration).toMatch(/enforce_system_message_not_prospective_line/i);
  });

  it('adds RLS to every new table with is_approved_staff', () => {
    for (const table of [
      'principals',
      'sales_line_territories',
      'retailer_line_accounts',
      'retailer_line_contacts',
      'retailer_field_changes',
      'retailer_line_targets',
      'migration_review_queue',
    ]) {
      expect(tablesMigration).toMatch(
        new RegExp(`alter table ${table} enable row level security`, 'i'),
      );
      expect(tablesMigration).toMatch(
        new RegExp(
          `create policy "approved staff full access" on ${table}[\\s\\S]*is_approved_staff\\(\\)`,
          'i',
        ),
      );
    }
  });

  it('seeds OGR/BKG/Eagle Peak/Big Fish without line accounts', () => {
    expect(seedsMigration).toMatch(/code = 'ogr'/);
    expect(seedsMigration).toMatch(/status = 'active'/);
    expect(seedsMigration).toMatch(/code = 'bkg'/);
    expect(seedsMigration).toMatch(/status = 'paused'/);
    expect(seedsMigration).toContain("'eagle-peak'");
    expect(seedsMigration).toContain("'onboarding'");
    expect(seedsMigration).toContain("'big-fish'");
    expect(seedsMigration).toContain("'confirmed'");
    expect(seedsMigration).toContain('Global Shade Co.');
    expect(seedsMigration).toMatch(/commission_rate[\s\S]*0\.1000/);
    expect(seedsMigration).not.toMatch(/insert into retailer_line_accounts/i);
    expect(seedsMigration).not.toMatch(/insert into retailer_line_targets/i);
  });

  it('seeds OGR BC/OR/WA active and Eagle Peak assignments as proposed only', () => {
    expect(seedsMigration).toMatch(/t\.code in \('bc', 'or', 'wa'\)/);
    expect(seedsMigration).toMatch(/l\.code = 'ogr'/);
    expect(seedsMigration).toMatch(/l\.code = 'eagle-peak'/);
    expect(seedsMigration).toMatch(/t\.code in \('or', 'wa', 'norcal'\)/);
    expect(seedsMigration).toMatch(/'proposed'/);
    expect(seedsMigration).toMatch(/boundary_status', 'unresolved'/);
    // No active Eagle Peak grant in Phase 1A
    expect(seedsMigration).toMatch(/Phase 1A: proposed only — active Eagle Peak grants deferred/);
  });

  it('adds multi-currency order columns without rewriting CAD', () => {
    for (const col of [
      'original_amount',
      'original_currency',
      'exchange_rate',
      'exchange_rate_date',
      'converted_amount',
      'converted_currency',
      'conversion_source',
    ]) {
      expect(tablesMigration).toContain(col);
    }
    expect(tablesMigration).not.toMatch(/drop column.*total_amount_cad/i);
    expect(tablesMigration).not.toMatch(/update orders set total_amount_cad/i);
  });

  it('keeps activity and productivity as views, not stored columns', () => {
    expect(tablesMigration).toMatch(/create or replace view retailer_line_account_activity/i);
    expect(tablesMigration).toMatch(/create or replace view retailer_line_account_productivity/i);
    expect(tablesMigration).not.toMatch(
      /alter table retailer_line_accounts[\s\S]*add column.*activity_status/i,
    );
    expect(tablesMigration).not.toMatch(
      /alter table retailer_line_accounts[\s\S]*add column.*productivity_class/i,
    );
  });

  it('does not include Phase 1B backfill or dual-write', () => {
    expect(tablesMigration).not.toMatch(/create trigger.*dual_write/i);
    expect(tablesMigration).not.toMatch(
      /insert into retailer_line_accounts[\s\S]*select[\s\S]*from prospects/i,
    );
    expect(seedsMigration).not.toMatch(/insert into retailer_line_accounts/i);
    expect(seedsMigration).toMatch(
      /Does NOT backfill|Zero retailer_line_accounts|zero retailer_line_accounts/i,
    );
  });

  it('schema.sql mirrors Phase 1A objects and public active-lines still filters active', () => {
    expect(schemaSql).toMatch(/create table if not exists principals/i);
    expect(schemaSql).toMatch(/create table if not exists sales_line_territories/i);
    expect(schemaSql).toMatch(/get_public_active_lines[\s\S]*where l\.active = true/i);
    expect(schemaSql).toMatch(/enforce_retailer_line_target_prospective/i);
  });
});
