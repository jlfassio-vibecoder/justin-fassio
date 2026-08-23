import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260823180000_account_research_pr4_product_match_rpc.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve('supabase/schema.sql'), 'utf8');

describe('account research PR4 product match migration', () => {
  it('defines persist_account_product_match_run RPC', () => {
    expect(migration).toMatch(/persist_account_product_match_run/i);
    expect(schemaSql).toMatch(/persist_account_product_match_run/i);
  });

  it('maps invalid citation UUIDs to INVALID_CITATIONS', () => {
    expect(migration).toMatch(/invalid_text_representation/i);
    expect(schemaSql).toMatch(/invalid_text_representation/i);
  });
});
