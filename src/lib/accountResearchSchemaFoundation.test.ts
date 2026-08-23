import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260823120000_account_research_schema_foundation.sql',
  ),
  'utf8',
);
const schemaSql = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');
const databaseTs = readFileSync(resolve(process.cwd(), 'src/types/database.ts'), 'utf8');

const TABLES = [
  'account_research_runs',
  'account_research_source_searches',
  'account_research_citations',
  'account_research_profile_suggestions',
  'account_research_suggestion_citations',
  'account_product_match_runs',
  'account_product_match_items',
  'account_product_match_item_citations',
] as const;

describe('Account Research PR1 schema foundation', () => {
  it('creates all eight tables in migration and schema.sql', () => {
    for (const table of TABLES) {
      expect(migration).toMatch(new RegExp(`create table if not exists ${table}`, 'i'));
      expect(schemaSql).toMatch(new RegExp(`create table if not exists ${table}`, 'i'));
    }
  });

  it('includes controlled CHECK literals for statuses, scopes, and product_fit', () => {
    for (const literal of [
      'none_indexed',
      'needs_identity_review',
      'recent_activity',
      'channel_intersect',
      'global_fallback',
      'all_recently_emailed',
      'stale_research',
      'identity_gate',
    ]) {
      expect(migration).toContain(`'${literal}'`);
      expect(schemaSql).toContain(`'${literal}'`);
    }
    for (const scope of [
      'all',
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest',
      'linkedin',
      'youtube',
      'x',
      'other',
    ]) {
      expect(migration).toContain(`'${scope}'`);
    }
  });

  it('enforces one active pending/running research run per retailer', () => {
    expect(migration).toMatch(
      /account_research_runs_one_active_per_retailer_uidx[\s\S]*\(retailer_id\)[\s\S]*where status in \('pending',\s*'running'\)/i,
    );
    expect(schemaSql).toMatch(/account_research_runs_one_active_per_retailer_uidx/i);
  });

  it('enforces source and citation URL uniqueness', () => {
    expect(migration).toMatch(/unique\s*\(\s*research_run_id,\s*source_type,\s*search_mode\s*\)/i);
    expect(migration).toMatch(/unique\s*\(\s*source_search_id,\s*source_url_normalized\s*\)/i);
  });

  it('requires explicit sales_line_id and RESTRICT match→research_run delete', () => {
    expect(migration).toMatch(
      /sales_line_id\s+uuid\s+not\s+null\s+references\s+lines\s*\(\s*id\s*\)/i,
    );
    expect(migration).toMatch(
      /research_run_id\s+uuid\s+not\s+null\s+references\s+account_research_runs\s*\(\s*id\s*\)\s+on\s+delete\s+restrict/i,
    );
  });

  it('enforces match item rank 1–3 and unique rank/catalog per run', () => {
    expect(migration).toMatch(/rank\s+smallint\s+not\s+null[\s\S]*between\s+1\s+and\s+3/i);
    expect(migration).toMatch(/account_product_match_items_run_rank_uidx/i);
    expect(migration).toMatch(/account_product_match_items_run_catalog_uidx/i);
  });

  it('includes same-run integrity trigger functions', () => {
    expect(migration).toContain('account_research_suggestion_citations_same_run');
    expect(migration).toContain('account_product_match_item_citations_same_run');
    expect(schemaSql).toContain('account_research_suggestion_citations_same_run');
    expect(schemaSql).toContain('account_product_match_item_citations_same_run');
  });

  it('enables staff RLS on every research table', () => {
    for (const table of TABLES) {
      expect(migration).toMatch(new RegExp(`alter table ${table} enable row level security`, 'i'));
      expect(migration).toMatch(
        new RegExp(
          `create policy "approved staff full access" on ${table}[\\s\\S]*is_approved_staff\\(\\)`,
          'i',
        ),
      );
    }
  });

  it('omits denormalized social/citation-array/pointer columns and seeds', () => {
    expect(migration).not.toMatch(/social_index_status/i);
    expect(migration).not.toMatch(/citation_ids/i);
    expect(migration).not.toMatch(/last_account_research/i);
    expect(migration).not.toMatch(/insert\s+into\s+account_research/i);
    expect(migration).not.toMatch(/insert\s+into\s+account_product_match/i);
    expect(migration).not.toMatch(/drop\s+table\s+.*prospects/i);
    expect(migration).not.toMatch(/alter\s+table\s+prospects/i);
    expect(migration).not.toMatch(/alter\s+table\s+system_messages/i);
  });

  it('hand-updates database.ts with all eight table keys', () => {
    for (const table of TABLES) {
      expect(databaseTs).toContain(`${table}: {`);
    }
  });
});
