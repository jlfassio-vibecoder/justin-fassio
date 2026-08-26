import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatAccountLocationLine,
  hasQualifyingOrderLast365Days,
  isDefaultActiveAccountRow,
  isProspectsPipelineRow,
  isReactivationCandidate,
  isReactivationDirectoryRow,
  isReactivationFilterRow,
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

  it('keeps lookalike prospects on Prospects and off Reactivation', () => {
    const lookalike = {
      accountStatus: 'prospect' as const,
      lineRelationshipStatus: 'prospect' as const,
      lineAccountMarkers: ['lookalike_prospect'],
    };
    expect(isProspectsPipelineRow(lookalike)).toBe(true);
    expect(isReactivationFilterRow(lookalike)).toBe(false);
    expect(isReactivationCandidate(lookalike)).toBe(false);
    expect(isDefaultActiveAccountRow(lookalike)).toBe(false);
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

  it('keeps inactive unresponsive historicals on Reactivation and off Prospects and default Active Accounts', () => {
    const parked = {
      accountStatus: 'inactive' as const,
      lineRelationshipStatus: 'inactive' as const,
      lineAccountMarkers: ['historical_purchaser', 'reactivation_unresponsive'],
    };
    expect(isProspectsPipelineRow(parked)).toBe(false);
    expect(isDefaultActiveAccountRow(parked)).toBe(false);
    expect(isReactivationCandidate(parked)).toBe(false);
    expect(isReactivationDirectoryRow(parked)).toBe(true);
    expect(isReactivationFilterRow(parked)).toBe(true);
    expect(isReactivationFilterRow(parked, { hasQualifyingOrderLast365Days: true })).toBe(false);
    expect(
      isDefaultActiveAccountRow({
        accountStatus: 'active_account',
        lineRelationshipStatus: 'opened',
        lineAccountMarkers: ['historical_purchaser', 'reactivation_candidate'],
      }),
    ).toBe(true);
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
    expect(parseDirectoryTerritoryParam('ab')).toBe('ab');
    expect(parseDirectoryTerritoryParam('ca')).toBe('ca');
    expect(parseDirectoryTerritoryParam('AB')).toBe('ab');
    expect(parseDirectoryTerritoryParam('nope')).toBeNull();
  });

  it('dedupes location line when region matches store territory', () => {
    expect(
      formatAccountLocationLine({
        city: 'Grand Ronde',
        region: 'Oregon',
        territoryCode: 'or',
        territoryName: 'Oregon',
      }),
    ).toBe('Grand Ronde · Oregon');
    expect(
      formatAccountLocationLine({
        city: 'Grand Ronde',
        region: 'Oregon',
        territoryCode: 'bc',
        territoryName: 'British Columbia',
      }),
    ).toBe('Grand Ronde (Oregon) · British Columbia');
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
    const overlay = readFileSync(resolve(root, 'src/lib/prospects.ts'), 'utf8');

    expect(rcc).toMatch(/isProspectsPipelineRow/);
    expect(rcc).toMatch(/isReactivationDirectoryRow/);
    expect(rcc).toMatch(/reactivation=1|reactivation/);
    expect(prospectsTab).toMatch(/isProspectsPipelineRow/);
    expect(prospectsTab).toMatch(/Import history/);
    expect(prospectsTab).toMatch(/Find lookalikes/);
    expect(accountsTab).toMatch(/Find lookalikes/);
    expect(directory).toMatch(/Lookalike/);
    expect(accountsTab).toMatch(/isReactivationCandidate/);
    expect(accountsTab).toMatch(/isReactivationFilterRow/);
    expect(accountsTab).toMatch(/isDefaultActiveAccountRow/);
    expect(accountsTab).toMatch(/hasQualifyingOrderLast365Days/);
    expect(accountsTab).toMatch(/ordersEvidenceReady/);
    expect(accountsTab).toMatch(/Reactivation/);
    expect(accountsTab).toMatch(/Import history/);
    expect(accountsTab).toMatch(/Include in outreach/);
    expect(accountsTab).toMatch(/Remove from outreach/);
    expect(accountsTab).toMatch(/Mark unresponsive/);
    expect(accountsTab).toMatch(/Reopen as candidate/);
    expect(accountsTab).toMatch(/setReactivationUnresponsiveClient/);
    expect(accountsTab).not.toMatch(/from '@\/lib\/setReactivationUnresponsive'/);
    expect(directory).toMatch(/All territories/);
    expect(directory).toMatch(/formatAccountLocationLine/);
    expect(directory).toMatch(/regionOptionsForTerritory/);
    expect(directory).toMatch(/aria-label="Territory"/);
    expect(directory).toMatch(/aria-label="Region"/);
    expect(rcc).toMatch(/fetchStoreTerritories/);
    expect(rcc).not.toMatch(/fetchTerritories\(\)/);
    const geo = readFileSync(resolve(root, 'src/lib/geoCatalog.ts'), 'utf8');
    expect(geo).toMatch(/Portland Metro & Gorge/);
    expect(geo).toMatch(/Puget Sound/);
    expect(geo).not.toMatch(/value: 'Oregon'/);
    expect(geo).not.toMatch(/value: 'Washington'/);
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
