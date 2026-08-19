import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const phase1Migration = readFileSync(
  resolve(root, 'supabase/migrations/20260817180000_bulk_import_phase1_data_foundation.sql'),
  'utf8',
);
const f1Migration = readFileSync(
  resolve(root, 'supabase/migrations/20260819120000_bulk_import_f1_outreach_eligible_marker.sql'),
  'utf8',
);
const f4Migration = readFileSync(
  resolve(root, 'supabase/migrations/20260819140000_bulk_import_f4_lookalike_discovery.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');

describe('F4 lookalike discovery schema', () => {
  it('adds lookalike_prospect and staging tables without rewriting Phase 1 or F1', () => {
    expect(f4Migration).toMatch(/lookalike_prospect/);
    expect(f4Migration).toMatch(/create table if not exists lookalike_jobs/);
    expect(f4Migration).toMatch(/create table if not exists lookalike_candidates/);
    expect(f4Migration).toMatch(/approved owner write/);
    expect(schemaSql).toMatch(/lookalike_prospect/);
    expect(schemaSql).toMatch(/create table if not exists lookalike_jobs/);
    expect(phase1Migration).not.toMatch(/lookalike_prospect/);
    expect(phase1Migration).not.toMatch(/lookalike_jobs/);
    expect(f1Migration).not.toMatch(/lookalike_prospect/);
  });

  it('keeps import from stamping lookalike_prospect', () => {
    const classification = readFileSync(
      resolve(root, 'src/lib/accountImport/classification.ts'),
      'utf8',
    );
    const start = classification.indexOf('export const IMPORT_SETTABLE_MARKERS');
    const end = classification.indexOf('const ALLOWED_MARKERS');
    const importBlock = classification.slice(start, end);
    expect(importBlock).toMatch(/historical_purchaser/);
    expect(importBlock).not.toMatch(/lookalike_prospect/);
  });
});
