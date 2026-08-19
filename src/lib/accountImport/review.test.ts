import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyApplyDecision,
  formatReviewValue,
  groupReviewRows,
  isReviewApplyFieldPath,
  normalizeReviewValue,
  reviewReasonsForGroup,
  unwrapJsonValue,
} from '@/lib/accountImport/reviewStatus';

const CHANGE_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';

describe('review value helpers', () => {
  it('unwraps jsonb-encoded strings and treats blank as empty', () => {
    expect(unwrapJsonValue('"https://coast.example"')).toBe('https://coast.example');
    expect(unwrapJsonValue('https://coast.example')).toBe('https://coast.example');
    expect(normalizeReviewValue(null)).toBe('');
    expect(normalizeReviewValue('  Portland  ')).toBe('Portland');
    expect(formatReviewValue(null)).toBe('(blank)');
    expect(formatReviewValue('503-555-0100')).toBe('503-555-0100');
  });

  it('allowlists bulk apply columns and forbids identity/commerce fields', () => {
    expect(isReviewApplyFieldPath('website')).toBe(true);
    expect(isReviewApplyFieldPath('address')).toBe(true);
    expect(isReviewApplyFieldPath('name')).toBe(false);
    expect(isReviewApplyFieldPath('existing_ogr')).toBe(false);
    expect(isReviewApplyFieldPath('buyer_verified')).toBe(false);
    expect(isReviewApplyFieldPath('notes')).toBe(false);
    expect(isReviewApplyFieldPath('fit')).toBe(false);
    expect(
      classifyApplyDecision({
        fieldPath: 'name',
        currentValue: 'Coast',
        oldValue: 'Coast',
        newValue: 'Other',
      }).kind,
    ).toBe('forbidden');
  });

  it('applies when current still matches old, no-ops when already new, conflicts otherwise', () => {
    expect(
      classifyApplyDecision({
        fieldPath: 'website',
        currentValue: null,
        oldValue: null,
        newValue: 'https://coast.example',
      }),
    ).toEqual({ kind: 'write', patchValue: 'https://coast.example' });
    expect(
      classifyApplyDecision({
        fieldPath: 'website',
        currentValue: 'https://coast.example',
        oldValue: null,
        newValue: 'https://coast.example',
      }).kind,
    ).toBe('already_applied');
    expect(
      classifyApplyDecision({
        fieldPath: 'phone',
        currentValue: '503-555-9999',
        oldValue: null,
        newValue: '503-555-0100',
      }).kind,
    ).toBe('conflict');
  });
});

describe('review grouping', () => {
  it('groups pending rows by retailer and flags protected identity', () => {
    const snapshot = groupReviewRows({
      batchId: 'batch-1',
      changes: [
        {
          id: CHANGE_ID,
          retailerId: 24,
          fieldPath: 'website',
          oldValue: null,
          newValue: 'https://coast.example',
          confidence: 'low',
          sourceUrls: ['https://coast.example'],
          enrichmentJobId: JOB_ID,
        },
      ],
      retailers: [{ id: 24, name: 'Coast Outfitters', importProtected: true }],
      jobs: [
        {
          id: JOB_ID,
          retailerId: 24,
          researchBrief: 'Coast Outfitters in Portland.',
          evidence: {
            cityStateAgrees: false,
            directoryOnly: true,
            multipleOfficialSites: true,
          },
        },
      ],
    });
    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.groups[0]?.name).toBe('Coast Outfitters');
    expect(snapshot.groups[0]?.changes[0]?.sourceUrl).toBe('https://coast.example');
    expect(snapshot.groups[0]?.reasons).toEqual([
      'city_state_mismatch',
      'directory_only',
      'multiple_sites',
      'protected_identity',
      'low_confidence',
    ]);
  });

  it('does not flag protected identity on non-identity fields', () => {
    expect(
      reviewReasonsForGroup({
        importProtected: true,
        evidence: { cityStateAgrees: true, directoryOnly: false, multipleOfficialSites: false },
        changes: [{ fieldPath: 'category', confidence: 'medium' }],
      }),
    ).toEqual([]);
  });
});

describe('review engine file contracts', () => {
  it('applies allowlisted prospect columns, supersedes duplicates, and rejects without writes', () => {
    const engine = readFileSync(resolve(process.cwd(), 'src/lib/accountImport/review.ts'), 'utf8');
    expect(engine).toMatch(/\.from\('prospects'\)/);
    expect(engine).toMatch(/status: 'applied'/);
    expect(engine).toMatch(/status: 'superseded'/);
    expect(engine).toMatch(/status: 'rejected'/);
    const rejectFn = engine.slice(engine.indexOf('async function rejectOnePendingChange'));
    expect(rejectFn).toMatch(/status: 'rejected'/);
    expect(rejectFn).not.toMatch(/from\('prospects'\)/);
    expect(engine).toMatch(/classifyApplyDecision/);
    expect(engine).not.toMatch(/applyProspectResearchUpdate/);
    expect(engine).not.toMatch(/mergeProfileNotes/);
    expect(engine).not.toMatch(/checkAgentRateLimit/);
    expect(engine).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getServiceRoleClient/);
    expect(engine).not.toMatch(/from '@\/lib\/accountImport\/enrich'/);
  });
});
