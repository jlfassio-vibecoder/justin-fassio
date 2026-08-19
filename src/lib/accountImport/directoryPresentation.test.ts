import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasQualifyingOrderLast365Days,
  isProspectsPipelineRow,
  isReactivationCandidate,
  parseDirectoryTerritoryParam,
  territoryDisplayLabel,
} from '@/lib/accountImport/directoryPresentation';

describe('directory presentation', () => {
  it('keeps ordinary BC prospects in the pipeline and opened accounts on Active Accounts', () => {
    expect(
      isProspectsPipelineRow({
        accountStatus: 'prospect',
        lineRelationshipStatus: 'prospect',
        lineAccountMarkers: [],
      }),
    ).toBe(true);
    expect(
      isProspectsPipelineRow({
        accountStatus: 'active_account',
        lineRelationshipStatus: 'opened',
        lineAccountMarkers: [],
      }),
    ).toBe(false);
    expect(
      isReactivationCandidate({
        accountStatus: 'active_account',
        lineRelationshipStatus: 'opened',
        lineAccountMarkers: [],
      }),
    ).toBe(false);
  });

  it('excludes historical purchasers from Prospects', () => {
    expect(
      isProspectsPipelineRow({
        accountStatus: 'active_account',
        lineRelationshipStatus: 'opened',
        lineAccountMarkers: ['historical_purchaser', 'reactivation_candidate'],
      }),
    ).toBe(false);
    expect(
      isProspectsPipelineRow({
        accountStatus: 'inactive',
        lineRelationshipStatus: 'inactive',
        lineAccountMarkers: ['historical_purchaser'],
      }),
    ).toBe(false);
    expect(
      isProspectsPipelineRow({
        accountStatus: 'inactive',
        lineRelationshipStatus: 'inactive',
        lineAccountMarkers: [],
      }),
    ).toBe(true);
  });

  it('treats opened reactivation_candidate rows as reactivation filter matches', () => {
    expect(
      isReactivationCandidate({
        accountStatus: 'active_account',
        lineRelationshipStatus: 'opened',
        lineAccountMarkers: ['historical_purchaser', 'reactivation_candidate'],
      }),
    ).toBe(true);
    expect(
      isReactivationCandidate({
        accountStatus: 'prospect',
        lineRelationshipStatus: 'prospect',
        lineAccountMarkers: ['reactivation_candidate'],
      }),
    ).toBe(false);
  });

  it('drops opened historicals from Reactivation when a qualifying order exists in the last 365 days', () => {
    const row = {
      accountStatus: 'active_account' as const,
      lineRelationshipStatus: 'opened' as const,
      lineAccountMarkers: ['historical_purchaser', 'reactivation_candidate'],
    };
    expect(
      hasQualifyingOrderLast365Days(
        [{ order_date: '2026-07-01', status: 'fulfilled' }],
        '2026-08-17',
      ),
    ).toBe(true);
    expect(
      isReactivationCandidate(row, {
        hasQualifyingOrderLast365Days: hasQualifyingOrderLast365Days(
          [{ order_date: '2026-07-01', status: 'fulfilled' }],
          '2026-08-17',
        ),
      }),
    ).toBe(false);
    expect(
      isReactivationCandidate(row, {
        hasQualifyingOrderLast365Days: hasQualifyingOrderLast365Days(
          [{ order_date: '2024-01-01', status: 'fulfilled' }],
          '2026-08-17',
        ),
      }),
    ).toBe(true);
    expect(
      isReactivationCandidate(row, {
        hasQualifyingOrderLast365Days: hasQualifyingOrderLast365Days(
          [{ order_date: '2026-07-01', status: 'draft' }],
          '2026-08-17',
        ),
      }),
    ).toBe(true);
  });

  it('labels OR/WA/BC territories', () => {
    expect(territoryDisplayLabel({ territoryCode: 'or', territoryName: null })).toBe('Oregon');
    expect(territoryDisplayLabel({ territoryCode: 'wa', territoryName: 'Washington' })).toBe(
      'Washington',
    );
    expect(territoryDisplayLabel({ territoryCode: 'bc', territoryName: null })).toBe(
      'British Columbia',
    );
    expect(parseDirectoryTerritoryParam('ALL')).toBe('ALL');
    expect(parseDirectoryTerritoryParam('or')).toBe('or');
    expect(parseDirectoryTerritoryParam('nope')).toBeNull();
  });

  it('source: Prospects exclude historicals; Active Accounts has Reactivation and Import history', () => {
    const root = process.cwd();
    const rcc = readFileSync(resolve(root, 'src/components/RepCommandCenter.tsx'), 'utf8');
    const prospectsTab = readFileSync(
      resolve(root, 'src/components/tabs/ProspectsTab.tsx'),
      'utf8',
    );
    const accountsTab = readFileSync(
      resolve(root, 'src/components/tabs/ActiveAccountsTab.tsx'),
      'utf8',
    );
    const directory = readFileSync(
      resolve(root, 'src/components/directory/RetailerDirectory.tsx'),
      'utf8',
    );
    const regions = readFileSync(resolve(root, 'src/lib/directoryOptions.ts'), 'utf8');
    const overlay = readFileSync(resolve(root, 'src/lib/prospects.ts'), 'utf8');

    expect(rcc).toMatch(/isProspectsPipelineRow/);
    expect(rcc).toMatch(/reactivation=1|reactivation/);
    expect(prospectsTab).toMatch(/isProspectsPipelineRow/);
    expect(prospectsTab).toMatch(/Import history/);
    expect(accountsTab).toMatch(/isReactivationCandidate/);
    expect(accountsTab).toMatch(/hasQualifyingOrderLast365Days/);
    expect(accountsTab).toMatch(/ordersEvidenceReady/);
    expect(accountsTab).toMatch(/Reactivation/);
    expect(accountsTab).toMatch(/Import history/);
    expect(directory).toMatch(/All territories/);
    expect(directory).toMatch(/territoryDisplayLabel/);
    expect(regions).toMatch(/Oregon/);
    expect(regions).toMatch(/Washington/);
    expect(overlay).toMatch(/line_account_markers/);
    expect(overlay).toMatch(/lineAccountMarkers/);
    const historyModal = readFileSync(
      resolve(root, 'src/components/accountImport/ImportHistoryModal.tsx'),
      'utf8',
    );
    expect(historyModal).toMatch(/Re-upload the same file/);
    expect(historyModal).toMatch(/reactivation=1/);
    expect(historyModal).toMatch(/Resume enrich/);
    expect(historyModal).not.toMatch(/from '@\/lib\/accountImport\/enrich'/);
    expect(historyModal).not.toMatch(/resume-by-batchId|resumeByBatchId/);
  });
});
