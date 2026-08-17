/**
 * Phase 9C — gated sync-trigger removal SQL (not applied with 9B).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Phase 9C gated sync-trigger removal', () => {
  const sql = readFileSync(resolve(root, 'plan/multi-line-phase9c-drop-sync-triggers.sql'), 'utf8');
  const schema = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');
  const migrations = readFileSync(
    resolve(root, 'supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql'),
    'utf8',
  );

  it('drops sync triggers/functions only and keeps fillers', () => {
    expect(sql).toMatch(/drop trigger if exists prospects_sync_ogr_retailer_line_account_ins/);
    expect(sql).toMatch(/drop trigger if exists prospects_sync_ogr_retailer_line_account_upd/);
    expect(sql).toMatch(/drop trigger if exists account_contacts_sync_ogr_retailer_line_contact/);
    expect(sql).toMatch(
      /drop function if exists public.sync_ogr_retailer_line_account_from_prospect/,
    );
    expect(sql).toMatch(
      /drop function if exists public.sync_ogr_retailer_line_contact_from_account_contact/,
    );
    expect(sql).not.toMatch(/drop function if exists public.fill_ogr_retailer_line_account/);
    expect(sql).not.toMatch(/drop function if exists public.ensure_ogr_retailer_line_account/);
    expect(sql).not.toMatch(/alter table[\s\S]{0,80}drop column/i);
    expect(sql).toMatch(/validate constraint calls_prospect_id_fkey/);
    expect(sql).toMatch(/orphan_calls = 0/);
  });

  it('is not in supabase/migrations so 9B db push cannot apply it', () => {
    expect(sql).toMatch(/do not copy this file into supabase\/migrations/i);
    const nineB = readFileSync(
      resolve(root, 'supabase/migrations/20260817120000_multi_line_phase9b_integrity_fks.sql'),
      'utf8',
    );
    expect(nineB).not.toMatch(/sync_ogr_retailer_line_account_from_prospect/);
  });

  it('live schema.sql still has sync until the separate 9C PR', () => {
    expect(schema).toMatch(/sync_ogr_retailer_line_account_from_prospect/);
    expect(schema).toMatch(/fill_ogr_retailer_line_account_on_order/);
    expect(schema).toMatch(/fill_ogr_retailer_line_account_on_call/);
    expect(migrations).toMatch(/sync_ogr_retailer_line_account_from_prospect/);
  });
});
