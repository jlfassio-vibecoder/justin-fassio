import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dualWriteMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');

describe('Phase 1C OGR dual-write migration', () => {
  it('adds AFTER INSERT OR UPDATE prospect sync to OGR retailer_line_accounts', () => {
    expect(dualWriteMigration).toMatch(/sync_ogr_retailer_line_account_from_prospect/i);
    expect(dualWriteMigration).toMatch(/after insert on prospects/i);
    expect(dualWriteMigration).toMatch(/after update on prospects/i);
    expect(dualWriteMigration).toMatch(/ensure_ogr_retailer_line_account_from_prospect/i);
    expect(dualWriteMigration).toMatch(/code = 'ogr'/);
  });

  it('adds AFTER INSERT OR UPDATE account_contacts sync', () => {
    expect(dualWriteMigration).toMatch(/sync_ogr_retailer_line_contact_from_account_contact/i);
    expect(dualWriteMigration).toMatch(/after insert or update on account_contacts/i);
    expect(dualWriteMigration).toMatch(
      /on conflict \(retailer_line_account_id, account_contact_id\) do nothing/i,
    );
    expect(dualWriteMigration).toMatch(/is_primary is distinct from/i);
    expect(dualWriteMigration).toMatch(/role is distinct from/i);
    expect(dualWriteMigration).toMatch(/notes is distinct from/i);
  });

  it('adds BEFORE INSERT fillers for orders, calls, and peers', () => {
    expect(dualWriteMigration).toMatch(/fill_ogr_retailer_line_account_on_order/i);
    expect(dualWriteMigration).toMatch(/fill_ogr_retailer_line_account_on_call/i);
    expect(dualWriteMigration).toMatch(/before insert on orders/i);
    expect(dualWriteMigration).toMatch(/before insert on calls/i);
    expect(dualWriteMigration).toMatch(/before insert on system_messages/i);
    expect(dualWriteMigration).toMatch(/before insert on account_reorder_settings/i);
    expect(dualWriteMigration).toMatch(/before insert on gmail_thread_links/i);
    expect(dualWriteMigration).toMatch(/before insert on calendar_event_links/i);
    expect(dualWriteMigration).toMatch(/before insert on message_threads/i);
    expect(dualWriteMigration).toMatch(/before insert on wholesale_order_requests/i);
    expect(dualWriteMigration).toMatch(/before insert on account_conversion_attribution/i);
    expect(dualWriteMigration).toMatch(/before insert on prospect_updates/i);
  });

  it('maps the three account_status values only and is OGR-only', () => {
    expect(dualWriteMigration).toMatch(/when 'prospect' then 'prospect'/i);
    expect(dualWriteMigration).toMatch(/when 'active_account' then 'opened'/i);
    expect(dualWriteMigration).toMatch(/when 'inactive' then 'inactive'/i);
    expect(dualWriteMigration).not.toMatch(/then 'qualified'/i);
    expect(dualWriteMigration).not.toMatch(
      /insert into retailer_line_accounts[\s\S]*?code = 'eagle-peak'/i,
    );
    expect(dualWriteMigration).not.toMatch(
      /insert into retailer_line_accounts[\s\S]*?code = 'big-fish'/i,
    );
    expect(dualWriteMigration).not.toMatch(
      /insert into retailer_line_accounts[\s\S]*?code = 'bkg'/i,
    );
  });

  it('assigns territory only on insert when territories.code = bc', () => {
    expect(dualWriteMigration).toMatch(/v_terr_code = 'bc'/);
    expect(dualWriteMigration).toMatch(/'non_bc_territory'/);
    expect(dualWriteMigration).toMatch(/'ambiguous_territory'/);
    expect(dualWriteMigration).toMatch(/in \('or', 'wa', 'ca', 'ab', 'norcal'\)/);
    expect(dualWriteMigration).toMatch(/Do not touch sales_line_territory_id/i);
  });

  it('guards recursion and update-only-if-changed', () => {
    expect(dualWriteMigration).toMatch(/pg_trigger_depth\(\) > 1/i);
    expect(dualWriteMigration).toMatch(/is distinct from/i);
    expect(dualWriteMigration).toMatch(/relationship_status <> 'terminated'/i);
    expect(dualWriteMigration).toMatch(/where not exists \(/i);
  });

  it('fills CAD legacy_cad_column without inventing USD', () => {
    expect(dualWriteMigration).toMatch(/conversion_source := 'legacy_cad_column'/);
    expect(dualWriteMigration).toMatch(/original_currency := 'CAD'/);
    expect(dualWriteMigration).toMatch(/order_value_conversion_source := 'legacy_cad_column'/);
    expect(dualWriteMigration).not.toMatch(/original_currency := 'USD'/);
    expect(dualWriteMigration).not.toMatch(/total_amount_cad\s*:=/i);
  });

  it('never deletes operational rows or writes back to prospects', () => {
    expect(dualWriteMigration).not.toMatch(/delete from orders/i);
    expect(dualWriteMigration).not.toMatch(/delete from calls/i);
    expect(dualWriteMigration).not.toMatch(/delete from prospects/i);
    expect(dualWriteMigration).not.toMatch(/delete from account_contacts/i);
    expect(dualWriteMigration).not.toMatch(/update prospects\b/i);
    expect(dualWriteMigration).not.toMatch(/insert into prospects\b/i);
  });

  it('mirrors dual-write functions and triggers in schema.sql', () => {
    expect(schemaSql).toMatch(/sync_ogr_retailer_line_account_from_prospect/i);
    expect(schemaSql).toMatch(/sync_ogr_retailer_line_contact_from_account_contact/i);
    expect(schemaSql).toMatch(/fill_ogr_retailer_line_account_on_order/i);
    expect(schemaSql).toMatch(/fill_ogr_retailer_line_account_on_call/i);
    expect(schemaSql).toMatch(/after insert or update on account_contacts/i);
    expect(schemaSql).toMatch(/ogr_retailer_line_account_id_for_retailer/i);
  });

  it('hard-stops non-OGR line_id on operational inserts', () => {
    expect(dualWriteMigration).toMatch(/assert_line_id_is_ogr_or_null/i);
    expect(dualWriteMigration).toMatch(/is not OGR/i);
  });
});
