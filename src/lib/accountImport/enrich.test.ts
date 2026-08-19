import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAiProfileNote,
  canResumeEnrich,
  canRetryFailedEnrich,
  cityStateAgrees,
  classifyBulkFillBlank,
  deriveBatchEnrichmentStatus,
  hasMultipleOfficialSites,
  isEnrichableBatchStatus,
  isGatewayRateLimitError,
  isStaleRunning,
  mergeProfileNotes,
  retailersNeedingJobs,
  STALE_RUNNING_MS,
  type EnrichmentSnapshot,
} from '@/lib/accountImport/enrich';
import type { FillBlankEvidence, FillBlankProspectFields } from '@/lib/fillBlankProspectFields';
import { EMPTY_PROSPECT_PLANNING, EMPTY_PROSPECT_TAXONOMY, type Prospect } from '@/lib/prospects';

const oregonStore: Prospect = {
  id: 24,
  name: 'Coast Outfitters',
  category: 'other',
  region: 'Oregon',
  city: 'Portland',
  address: '12 Oak St',
  phone: '',
  fit: '',
  accountStatus: 'active_account',
  convertedAt: null,
  initialOrderDate: null,
  notes: 'Import seed note.',
  ...EMPTY_PROSPECT_PLANNING,
  ...EMPTY_PROSPECT_TAXONOMY,
  territoryId: 'terr-or',
  territoryCode: 'or',
  territoryName: 'Oregon',
  importProtected: true,
  existingOgr: 'yes',
  website: null,
};

const evidence: FillBlankEvidence = {
  officialWebsite: 'https://coastoutfitters.example',
  address: '12 Oak St, Portland, OR 97201',
  phone: '503-555-0100',
  retailCategory: 'Fishing / outdoor retailer',
  categoryRationale: 'Outdoor apparel',
  apparelCapability: 'Confirmed',
  lifestyleThemes: ['outdoor'],
  customerAlignmentNotes: 'Gift traffic',
  strategicReference: false,
  strategicReferenceReason: null,
  operatingConfirmed: true,
  directoryOnly: false,
  sourceUrls: ['https://coastoutfitters.example'],
};

const fields: FillBlankProspectFields = {
  name: null,
  category: 'outdoor_camping_hunting',
  region: null,
  city: null,
  address: '12 Oak St, Portland, OR 97201',
  phone: '503-555-0100',
  website: 'https://coastoutfitters.example',
  subterritory: null,
  primaryDistrict: null,
  retailCategory: 'Fishing / outdoor retailer',
  apparelCapability: 'Confirmed',
  verificationStatus: 'Website confirmed',
  fitScore: null,
  fit: null,
  idealOpeningUnits: null,
  priority: null,
  provisionalGrade: null,
  nextAction: null,
};

function snapshot(overrides: Partial<EnrichmentSnapshot> = {}): EnrichmentSnapshot {
  return {
    batchId: 'batch-1',
    batchStatus: 'committed',
    jobs: {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      pendingFieldChanges: 0,
      total: 0,
    },
    rows: [],
    pauseReason: null,
    ...overrides,
  };
}

describe('bulk enrichment queue helpers', () => {
  it('skips retailers that already have a non-cancelled job', () => {
    expect(retailersNeedingJobs([1, 2, 3], [2])).toEqual([1, 3]);
    const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');
    expect(schema).toMatch(/account_enrichment_jobs_batch_retailer_mode_uidx/);
    expect(schema).toMatch(/where status <> 'cancelled'/);
    const engine = readFileSync(resolve(process.cwd(), 'src/lib/accountImport/enrich.ts'), 'utf8');
    expect(engine).not.toMatch(/createEnrichedProspect|enrichedProspectSchema/);
    expect(engine).not.toMatch(/checkAgentRateLimit/);
    expect(engine).toMatch(/skipFitScoring: true/);
    expect(engine).toMatch(/research_brief: inferred.researchBrief/);
    expect(engine).toMatch(/if \(latest\?\.status === 'cancelled'\)/);
    expect(engine).toMatch(/Web research returned empty brief/);
    expect(engine.indexOf('research_brief: inferred.researchBrief')).toBeLessThan(
      engine.indexOf("if (latest?.status === 'cancelled')"),
    );
    expect(engine.indexOf("if (latest?.status === 'cancelled')")).toBeLessThan(
      engine.indexOf('classified.applyPatch'),
    );
  });

  it('resets stale running jobs after 120s and keeps fresh ones', () => {
    const now = Date.parse('2026-08-18T18:00:00.000Z');
    expect(isStaleRunning(new Date(now - STALE_RUNNING_MS).toISOString(), now)).toBe(true);
    expect(isStaleRunning(new Date(now - 1_000).toISOString(), now)).toBe(false);
  });

  it('treats 429 as a pause, not a failed row', () => {
    expect(isGatewayRateLimitError('429 Too Many Requests')).toBe(true);
    expect(isGatewayRateLimitError('Rate limit exceeded')).toBe(true);
    expect(isGatewayRateLimitError('Gateway 502')).toBe(false);
  });

  it('derives batch status from job rows including cancel remaining', () => {
    expect(deriveBatchEnrichmentStatus([{ status: 'queued' }])).toBe('enriching');
    expect(deriveBatchEnrichmentStatus([{ status: 'completed' }])).toBe('completed');
    expect(deriveBatchEnrichmentStatus([{ status: 'failed' }, { status: 'completed' }])).toBe(
      'enrichment_partial',
    );
    expect(deriveBatchEnrichmentStatus([{ status: 'cancelled' }])).toBe('cancelled');
    expect(deriveBatchEnrichmentStatus([{ status: 'completed' }, { status: 'cancelled' }])).toBe(
      'enrichment_partial',
    );
  });

  it('allows resume on empty B-era completed batches and retry when failed', () => {
    expect(isEnrichableBatchStatus('completed')).toBe(true);
    expect(canResumeEnrich(snapshot({ batchStatus: 'completed' }))).toBe(true);
    expect(
      canResumeEnrich(
        snapshot({
          batchStatus: 'completed',
          jobs: {
            queued: 0,
            running: 0,
            completed: 2,
            failed: 0,
            cancelled: 0,
            pendingFieldChanges: 0,
            total: 2,
          },
        }),
      ),
    ).toBe(false);
    expect(
      canRetryFailedEnrich(
        snapshot({
          jobs: {
            queued: 0,
            running: 0,
            completed: 1,
            failed: 1,
            cancelled: 0,
            pendingFieldChanges: 0,
            total: 2,
          },
        }),
      ),
    ).toBe(true);
  });
});

describe('classifyBulkFillBlank', () => {
  it('auto-applies a high-confidence blank website and phones when city/state agree', () => {
    const result = classifyBulkFillBlank({
      current: oregonStore,
      fields,
      evidence,
      brief: 'Coast Outfitters is an outdoor store in Portland, Oregon.',
    });
    expect(result.cityStateAgrees).toBe(true);
    expect(result.applyPatch.website).toBe('https://coastoutfitters.example');
    expect(result.applyPatch.phone).toBe('503-555-0100');
    expect(result.applied.map((row) => row.fieldPath)).toEqual(
      expect.arrayContaining(['website', 'phone']),
    );
    expect(result.pending.map((row) => row.fieldPath)).toContain('address');
  });

  it('queues directory-only website as pending instead of applying', () => {
    const result = classifyBulkFillBlank({
      current: oregonStore,
      fields,
      evidence: { ...evidence, directoryOnly: true, operatingConfirmed: false },
      brief: 'Directory listing for Coast Outfitters in Portland.',
    });
    expect(result.applyPatch.website).toBeUndefined();
    expect(result.pending.map((row) => row.fieldPath)).toContain('website');
  });

  it('applies a blank website on import-protected rows and queues a populated website', () => {
    const blank = classifyBulkFillBlank({
      current: { ...oregonStore, website: null, importProtected: true },
      fields,
      evidence,
      brief: 'Coast Outfitters, Portland, Oregon.',
    });
    expect(blank.applyPatch.website).toBe('https://coastoutfitters.example');

    const populated = classifyBulkFillBlank({
      current: { ...oregonStore, website: 'https://old.example', importProtected: true },
      fields,
      evidence,
      brief: 'Coast Outfitters, Portland, Oregon.',
    });
    expect(populated.applyPatch.website).toBeUndefined();
    expect(populated.pending.find((row) => row.fieldPath === 'website')?.newValue).toBe(
      'https://coastoutfitters.example',
    );
  });
});

describe('city/state and notes', () => {
  it('requires the import city in the brief or address', () => {
    expect(
      cityStateAgrees({
        city: 'Portland',
        region: 'Oregon',
        address: '12 Oak St, Portland, OR',
        brief: null,
      }),
    ).toBe(true);
    expect(
      cityStateAgrees({
        city: 'Portland',
        region: 'Oregon',
        address: 'Seattle, WA',
        brief: 'A store in Seattle, Washington',
      }),
    ).toBe(false);
  });

  it('flags multiple official hosts', () => {
    expect(hasMultipleOfficialSites(['https://a.example', 'https://www.a.example/about'])).toBe(
      false,
    );
    expect(hasMultipleOfficialSites(['https://a.example', 'https://b.example'])).toBe(true);
  });

  it('appends an AI sourced/inference block without deleting the import seed', () => {
    const addition = buildAiProfileNote({
      evidence,
      brief: 'Brief',
      applied: [
        {
          fieldPath: 'website',
          camel: 'website',
          oldValue: null,
          newValue: 'https://coastoutfitters.example',
          action: 'apply',
          confidence: 'high',
        },
      ],
      pending: [],
      asOf: '2026-08-18',
    });
    expect(addition).toMatch(/^Sourced/m);
    expect(addition).toMatch(/Unknown/);
    const merged = mergeProfileNotes('Import seed note.', addition);
    expect(merged.startsWith('Import seed note.')).toBe(true);
    expect(merged).toContain('Sourced');
  });
});
