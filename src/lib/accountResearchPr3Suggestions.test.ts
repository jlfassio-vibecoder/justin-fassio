import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260823160000_account_research_pr3_suggestions.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve('supabase/schema.sql'), 'utf8');

describe('account research PR3 suggestions migration', () => {
  it('adds baseline_value and pending uniqueness', () => {
    expect(migration).toMatch(/baseline_value jsonb/i);
    expect(migration).toMatch(/account_research_profile_suggestions_run_field_pending_uidx/i);
  });

  it('defines persist, apply, and reject RPCs', () => {
    expect(migration).toMatch(/persist_account_research_profile_suggestions/i);
    expect(migration).toMatch(/apply_account_research_profile_suggestion/i);
    expect(migration).toMatch(/reject_account_research_profile_suggestion/i);
  });

  it('supersedes pending suggestions when a run is superseded', () => {
    expect(migration).toMatch(/account_research_runs_supersede_suggestions/i);
    expect(schemaSql).toMatch(/account_research_runs_supersede_suggestions/i);
  });
});
