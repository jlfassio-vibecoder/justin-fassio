import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260817180000_bulk_import_phase1_data_foundation.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');
const dualWriteMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql'),
  'utf8',
);

function dualWriteFunctionSql(source: string): string {
  const start = source.indexOf(
    'create or replace function public.ensure_ogr_retailer_line_account_from_prospect',
  );
  const end = source.indexOf(
    'create or replace function public.ensure_ogr_retailer_line_account_for_retailer_id',
  );
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Phase 1 bulk-import data foundation schema', () => {
  it('adds identity columns, markers, and import/enrich tables in the new migration and schema.sql', () => {
    for (const source of [migration, schemaSql]) {
      expect(source).toMatch(/postal_code/);
      expect(source).toMatch(/import_protected boolean not null default false/);
      expect(source).toMatch(/line_account_markers text\[\] not null default '\{\}'/);
      expect(source).toMatch(/historical_purchaser/);
      expect(source).toMatch(/reactivation_candidate/);
      expect(source).toMatch(/reactivation_unresponsive/);
      expect(source).toMatch(/create table if not exists account_import_batches/i);
      expect(source).toMatch(/create table if not exists account_import_rows/i);
      expect(source).toMatch(/create table if not exists account_enrichment_jobs/i);
    }
  });

  it('keeps fingerprint uniqueness on committed identity rows only', () => {
    for (const source of [migration, schemaSql]) {
      expect(source).toMatch(
        /account_import_rows_line_fingerprint_committed_uidx[\s\S]*status in \('imported', 'linked', 'updated'\)/i,
      );
      expect(source).toMatch(/account_import_rows_batch_row_uidx unique \(batch_id, row_number\)/i);
      expect(source).toMatch(
        /account_import_batches_id_sales_line_uidx unique \(id, sales_line_id\)/i,
      );
      expect(source).toMatch(
        /account_import_rows_batch_line_fkey[\s\S]*foreign key \(batch_id, sales_line_id\)[\s\S]*references account_import_batches \(id, sales_line_id\)/i,
      );
    }
  });

  it('splits RLS: staff read, owner write on import/enrich tables only', () => {
    for (const table of [
      'account_import_batches',
      'account_import_rows',
      'account_enrichment_jobs',
    ]) {
      expect(migration).toMatch(new RegExp(`alter table ${table} enable row level security`, 'i'));
      expect(migration).toMatch(
        new RegExp(
          `create policy "approved staff read" on ${table}[\\s\\S]*is_approved_staff\\(\\)`,
          'i',
        ),
      );
      expect(migration).toMatch(
        new RegExp(
          `create policy "approved owner write" on ${table}[\\s\\S]*is_approved_owner\\(\\)`,
          'i',
        ),
      );
      expect(schemaSql).toMatch(new RegExp(`create policy "approved staff read" on ${table}`, 'i'));
    }
    expect(migration).not.toMatch(
      /drop policy if exists "approved staff full access" on prospects/i,
    );
    expect(migration).not.toMatch(
      /drop policy if exists "approved staff full access" on retailer_line_accounts/i,
    );
    expect(migration).not.toMatch(
      /drop policy if exists "approved staff full access" on retailer_field_changes/i,
    );
  });

  it('defaults retailer_field_changes.status to applied', () => {
    expect(migration).toMatch(/add column if not exists status text not null default 'applied'/i);
    expect(schemaSql).toMatch(
      /status text not null default 'applied'[\s\S]*check \(status in \('pending', 'applied', 'rejected', 'superseded'\)\)/,
    );
  });

  it('extends activity view with historical_purchaser dormant branch and does not store activity columns', () => {
    for (const source of [migration, schemaSql]) {
      expect(source).toMatch(
        /when 'historical_purchaser' = any \(rla\.line_account_markers\) then 'dormant'/,
      );
      expect(source).toMatch(/create or replace view retailer_line_account_activity/i);
      expect(source).not.toMatch(
        /alter table retailer_line_accounts[\s\S]*add column.*activity_status/i,
      );
      expect(source).not.toMatch(
        /alter table retailer_line_accounts[\s\S]*add column.*productivity_class/i,
      );
    }
  });

  it('does not add line_account_markers to the OGR dual-write function', () => {
    const dualWriteFn = dualWriteFunctionSql(schemaSql);
    expect(dualWriteFn).not.toMatch(/line_account_markers/);
    expect(dualWriteMigration).not.toMatch(/line_account_markers/);
    expect(migration).not.toMatch(
      /create or replace function public\.ensure_ogr_retailer_line_account_from_prospect/i,
    );
  });
});
