import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const preserveOpenedMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260822212141_ogr_sync_preserve_opened_rla.sql'),
  'utf8',
);
const schemaSql = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');
const convertSource = readFileSync(resolve(root, 'src/lib/convertToActiveAccount.ts'), 'utf8');

describe('Phase 9B OGR sync preserve opened RLA', () => {
  it('migration and schema preserve opened when prospect.account_status is still prospect', () => {
    for (const sql of [preserveOpenedMigration, schemaSql]) {
      expect(sql).toMatch(/v_relationship_to_apply := v_relationship;/);
      expect(sql).toMatch(
        /if v_existing\.relationship_status = 'opened' and p\.account_status = 'prospect' then/,
      );
      expect(sql).toMatch(/v_relationship_to_apply := 'opened';/);
      expect(sql).toMatch(/relationship_status = v_relationship_to_apply/);
    }
  });

  it('still maps account_status on insert and does not change convert dual-write policy', () => {
    expect(schemaSql).toMatch(
      /v_relationship := public\.map_prospect_account_status_to_relationship/,
    );
    expect(convertSource).not.toMatch(/account_status: 'active_account'/);
    expect(convertSource).not.toMatch(/from\('prospects'\)[\s\S]*account_status/);
    expect(convertSource).toMatch(/relationshipStatus: 'opened'/);
  });
});
