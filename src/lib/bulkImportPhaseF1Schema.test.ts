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
const schemaSql = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');

describe('F1 outreach_eligible marker schema', () => {
  it('adds outreach_eligible in the new migration and schema.sql without rewriting Phase 1', () => {
    expect(f1Migration).toMatch(/outreach_eligible/);
    expect(f1Migration).toMatch(/retailer_line_accounts_line_account_markers_check/);
    expect(schemaSql).toMatch(
      /line_account_markers <@ array\[[\s\S]*'reactivation_unresponsive',[\s\S]*'outreach_eligible'/,
    );
    expect(phase1Migration).not.toMatch(/outreach_eligible/);
    expect(phase1Migration).toMatch(/reactivation_unresponsive/);
  });

  it('owner opt-in API uses owner JWT and does not use the service role', () => {
    const api = readFileSync(
      resolve(root, 'src/pages/api/staff/line-accounts/outreach-opt-in.ts'),
      'utf8',
    );
    expect(api).toMatch(/export const prerender = false/);
    expect(api).toMatch(/requireApprovedOwnerClient/);
    expect(api).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getServiceRoleClient/);
  });

  it('Active Accounts exposes an owner-only outreach toggle on reactivation rows', () => {
    const accountsTab = readFileSync(
      resolve(root, 'src/components/tabs/ActiveAccountsTab.tsx'),
      'utf8',
    );
    expect(accountsTab).toMatch(/isApprovedOwner/);
    expect(accountsTab).toMatch(/isReactivationCandidate/);
    expect(accountsTab).toMatch(/Include in outreach/);
    expect(accountsTab).toMatch(/Remove from outreach/);
    expect(accountsTab).toMatch(/setOutreachEligibleClient/);
    expect(accountsTab).not.toMatch(/from '@\/lib\/setOutreachEligible'/);
    expect(accountsTab).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('owner unresponsive API uses owner JWT and does not use the service role', () => {
    const api = readFileSync(
      resolve(root, 'src/pages/api/staff/line-accounts/reactivation-unresponsive.ts'),
      'utf8',
    );
    expect(api).toMatch(/export const prerender = false/);
    expect(api).toMatch(/requireApprovedOwnerClient/);
    expect(api).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getServiceRoleClient/);
    expect(api).not.toMatch(/account_status/);
    expect(api).not.toMatch(/demoteToProspect/);
  });
});
