import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HISTORICAL_OGR_IMPORT_DEFAULTS } from '@/lib/accountImport/classification';
import { buildCommitRowPayload, isEligibleImportDecision } from '@/lib/accountImport/commit';
import { matchCollapsedRows, summarizePreview } from '@/lib/accountImport/matchRetailers';
import type { CollapsedImportRow } from '@/lib/accountImport/types';

const root = process.cwd();

function collapsed(overrides: Partial<CollapsedImportRow> = {}): CollapsedImportRow {
  return {
    rowNumber: 1,
    raw: { 'Business name': 'Coast Outfitters' },
    name: 'Coast Outfitters',
    nameNormalized: 'coast outfitters',
    street: '12 Oak St',
    city: 'Portland',
    stateCode: 'or',
    region: 'Oregon',
    postalCode: '97201',
    postal5: '97201',
    formerRepCode: 'R1',
    storeTypeRaw: null,
    category: 'other',
    contactName: null,
    email: null,
    emailImportable: false,
    phone: null,
    website: null,
    externalId: null,
    rawAddressText: '12 Oak St, Portland, OR 97201',
    addressUncertain: false,
    fingerprint: 'coast outfitters|or|97201',
    warnings: [],
    inFileDuplicateOf: null,
    collapsedFromRowNumbers: [1],
    ...overrides,
  };
}

describe('account import matching', () => {
  it('skips a prior import fingerprint', () => {
    const rows = matchCollapsedRows({
      rows: [collapsed()],
      retailers: [
        {
          id: 9,
          name: 'Coast Outfitters',
          city: 'Portland',
          territoryCode: 'or',
          accountStatus: 'active_account',
          externalId: null,
          importProtected: true,
          buyerVerified: false,
          verificationStatus: null,
        },
      ],
      rlas: [],
      contacts: [],
      priorFingerprints: [{ fingerprint: 'coast outfitters|or|97201', retailerId: 9 }],
    });
    expect(rows[0]?.matchDecision).toBe('prior_import_skip');
  });

  it('links a unique OR/WA name and reviews BC collisions', () => {
    const linked = matchCollapsedRows({
      rows: [collapsed()],
      retailers: [
        {
          id: 4,
          name: 'Coast Outfitters',
          city: 'Portland',
          territoryCode: 'or',
          accountStatus: 'prospect',
          externalId: null,
          importProtected: false,
          buyerVerified: false,
          verificationStatus: null,
        },
      ],
      rlas: [],
      contacts: [],
      priorFingerprints: [],
    });
    expect(linked[0]?.matchDecision).toBe('link_existing');

    const review = matchCollapsedRows({
      rows: [collapsed({ city: 'Kelowna', stateCode: null, fingerprint: 'coast outfitters||' })],
      retailers: [
        {
          id: 12,
          name: 'Coast Outfitters',
          city: 'Kelowna',
          territoryCode: 'bc',
          accountStatus: 'prospect',
          externalId: null,
          importProtected: false,
          buyerVerified: false,
          verificationStatus: null,
        },
      ],
      rlas: [],
      contacts: [],
      priorFingerprints: [],
    });
    expect(review[0]?.matchDecision).toBe('needs_review');
  });

  it('does not silently reopen terminated or inactive historical purchasers', () => {
    const terminated = matchCollapsedRows({
      rows: [collapsed()],
      retailers: [
        {
          id: 4,
          name: 'Coast Outfitters',
          city: 'Portland',
          territoryCode: 'or',
          accountStatus: 'inactive',
          externalId: null,
          importProtected: false,
          buyerVerified: false,
          verificationStatus: null,
        },
      ],
      rlas: [
        {
          id: 'rla-1',
          retailerId: 4,
          relationshipStatus: 'terminated',
          markers: [],
        },
      ],
      contacts: [],
      priorFingerprints: [],
    });
    expect(terminated[0]?.matchDecision).toBe('needs_review');
  });

  it('summarizes preview counts without AI chips', () => {
    const rows = matchCollapsedRows({
      rows: [
        collapsed(),
        collapsed({ rowNumber: 2, inFileDuplicateOf: 1, name: 'Coast Outfitters' }),
      ],
      retailers: [],
      rlas: [],
      contacts: [],
      priorFingerprints: [],
    });
    const counts = summarizePreview(rows, 2);
    expect(counts.uploadedRows).toBe(2);
    expect(counts.uniqueBusinesses).toBe(1);
    expect(counts.duplicateSpreadsheetRows).toBe(1);
    expect(counts.newRetailersProposed).toBe(1);
  });
});

describe('account import commit payload', () => {
  it('uses historical defaults and does not create orders', () => {
    const payload = buildCommitRowPayload({
      row: {
        ...collapsed(),
        matchDecision: 'create_retailer',
        match: null,
        blockingErrors: [],
        proposedClassification: {
          relationshipStatus: 'opened',
          markers: ['historical_purchaser', 'reactivation_candidate'],
          existingOgr: 'yes',
          importProtected: true,
          qualificationStatus: 'reactivation',
        },
      },
      classification: {
        relationshipStatus: HISTORICAL_OGR_IMPORT_DEFAULTS.relationshipStatus,
        markers: [...HISTORICAL_OGR_IMPORT_DEFAULTS.markers],
        existingOgr: 'yes',
        nextAction: 'Call',
      },
      filename: 'synthetic.xlsx',
      batchId: 'batch-1',
      sourceType: 'historical_customer',
      territoryId: 'terr-or',
      salesLineTerritoryId: 'slt-or',
    });
    expect(payload?.action).toBe('create_retailer');
    expect(payload?.prospect_insert?.account_status).toBe('active_account');
    expect(payload?.prospect_insert?.import_protected).toBe(true);
    expect(payload?.prospect_insert?.converted_at).toBeNull();
    expect(payload?.rla_patch.line_account_markers).toEqual([
      'historical_purchaser',
      'reactivation_candidate',
    ]);
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.createOrders).toBe(false);
    expect(isEligibleImportDecision('needs_review')).toBe(false);
  });

  it('fill-blanks skips import-protected identity', () => {
    const payload = buildCommitRowPayload({
      row: {
        ...collapsed(),
        matchDecision: 'update_rla',
        match: {
          retailerId: 4,
          name: 'Coast Outfitters',
          city: 'Portland',
          territoryCode: 'or',
          accountStatus: 'active_account',
          relationshipStatus: 'opened',
          markers: [],
        },
        blockingErrors: [],
        proposedClassification: {
          relationshipStatus: 'opened',
          markers: ['historical_purchaser', 'reactivation_candidate'],
          existingOgr: 'yes',
          importProtected: true,
          qualificationStatus: 'reactivation',
        },
        website: 'https://new.example',
      },
      classification: {
        relationshipStatus: 'opened',
        markers: ['historical_purchaser', 'reactivation_candidate'],
        existingOgr: 'yes',
        nextAction: null,
      },
      filename: 'synthetic.xlsx',
      batchId: 'batch-1',
      sourceType: 'historical_customer',
      territoryId: 'terr-or',
      salesLineTerritoryId: 'slt-or',
      existingRetailer: {
        name: 'Coast Outfitters',
        address: '12 Oak St',
        city: 'Portland',
        phone: '555',
        website: null,
        postalCode: '97201',
        importProtected: true,
        buyerVerified: false,
        verificationStatus: null,
        hasPrimaryContact: true,
      },
    });
    expect(payload?.prospect_patch).toBeNull();
  });
});

describe('account import phase 2 files', () => {
  it('adds an INVOKER commit RPC and owner-only APIs', () => {
    const migration = readFileSync(
      resolve(root, 'supabase/migrations/20260817200000_bulk_import_phase2_commit_rpc.sql'),
      'utf8',
    );
    const schema = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');
    const rpcStart = schema.indexOf('create or replace function public.commit_account_import_row');
    expect(rpcStart).toBeGreaterThan(-1);
    const rpcSql = schema.slice(rpcStart, rpcStart + 8000);
    for (const source of [migration, rpcSql]) {
      expect(source).toMatch(/commit_account_import_row/);
      expect(source).toMatch(/security invoker/i);
      expect(source).not.toMatch(/security definer/i);
      expect(source).not.toMatch(/insert into orders/i);
      expect(source).not.toMatch(/account_enrichment_jobs/i);
      expect(source).toMatch(/when others then/);
    }

    const preview = readFileSync(resolve(root, 'src/lib/accountImport/preview.ts'), 'utf8');
    expect(preview).not.toMatch(/from\('prospects'\)[\s\S]*insert/);

    const commit = readFileSync(resolve(root, 'src/lib/accountImport/commit.ts'), 'utf8');
    expect(commit).not.toMatch(/from\('orders'\)/);
    expect(commit).not.toMatch(/account_enrichment_jobs/);

    for (const file of ['parse.ts', 'preview.ts', 'commit.ts']) {
      const src = readFileSync(resolve(root, `src/pages/api/staff/account-import/${file}`), 'utf8');
      expect(src).toMatch(/export const prerender = false/);
      expect(src).toMatch(/requireAccountImportOwner|requireApprovedOwnerClient/);
    }

    const modal = readFileSync(
      resolve(root, 'src/components/accountImport/ImportAccountsModal.tsx'),
      'utf8',
    );
    expect(modal).toMatch(/select.*map.*normalize.*preview.*confirm.*importing.*imported/s);
    expect(modal).not.toMatch(/enriching/);
    expect(modal).not.toMatch(/run AI after import/i);

    const prospectsTab = readFileSync(
      resolve(root, 'src/components/tabs/ProspectsTab.tsx'),
      'utf8',
    );
    const accountsTab = readFileSync(
      resolve(root, 'src/components/tabs/ActiveAccountsTab.tsx'),
      'utf8',
    );
    expect(prospectsTab).toMatch(/isApprovedOwner/);
    expect(prospectsTab).toMatch(/Import accounts/);
    expect(accountsTab).toMatch(/Import accounts/);
    expect(commit).toMatch(/existingBatch/);
    expect(readFileSync(resolve(root, 'src/components/RepCommandCenter.tsx'), 'utf8')).toMatch(
      /get\('import'\) === '1'/,
    );
  });
});
