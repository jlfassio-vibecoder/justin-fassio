import { describe, expect, it } from 'vitest';
import { resolveAccountIdentity } from '@/lib/accountResearch/identity';
import { normalizeSourceUrl, truncateExcerpt } from '@/lib/accountResearch/normalizeUrl';
import { isUsableFreshRun, runSatisfiesScopeRequest } from '@/lib/accountResearch/freshness';
import { isAccountResearchV1Scope, scopesForRequested } from '@/lib/accountResearch/constants';

describe('accountResearch normalizeUrl', () => {
  it('normalizes host, www, tracking params, and trailing slash', () => {
    expect(normalizeSourceUrl('HTTPS://WWW.Example.com/Shop/?utm_source=x&fbclid=1&keep=1')).toBe(
      'https://example.com/Shop?keep=1',
    );
  });

  it('returns null for invalid URLs', () => {
    expect(normalizeSourceUrl('notaurl')).toBeNull();
  });

  it('truncates excerpts', () => {
    expect(truncateExcerpt('  hello   world  ', 20)).toBe('hello world');
    expect(truncateExcerpt('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('accountResearch identity', () => {
  it('requires corroboration beyond website match for high', () => {
    const medium = resolveAccountIdentity({
      businessName: 'Kelowna Outdoor',
      website: 'https://www.kelownaoutdoor.ca',
      city: 'Kelowna',
    });
    expect(medium.identity_confidence).toBe('medium');

    const high = resolveAccountIdentity({
      businessName: 'Kelowna Outdoor',
      website: 'https://www.kelownaoutdoor.ca',
      city: 'Kelowna',
      officialHostEvidenceText: 'Kelowna Outdoor — visit us in Kelowna, BC',
    });
    expect(high.identity_confidence).toBe('high');
    expect(high.identity_review_status).toBe('not_required');
  });

  it('rejects same-name different-city evidence for acceptance path', () => {
    const result = resolveAccountIdentity({
      businessName: 'Summit Sports',
      city: 'Bend',
      website: 'https://summitsports.com',
      conflictingCityEvidence: true,
      officialHostEvidenceText: 'Summit Sports Portland',
    });
    expect(result.identity_confidence).toBe('low');
  });

  it('marks directory-only as low/unresolved', () => {
    const result = resolveAccountIdentity({
      businessName: 'Some Shop',
      website: 'https://www.facebook.com/someshop',
    });
    expect(['low', 'unresolved']).toContain(result.identity_confidence);
  });
});

describe('accountResearch freshness', () => {
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  it('treats succeeded/partial within 7 days as usable', () => {
    expect(
      isUsableFreshRun({ status: 'succeeded', completed_at: '2026-08-20T12:00:00.000Z' }, now),
    ).toBe(true);
    expect(
      isUsableFreshRun({ status: 'failed', completed_at: '2026-08-20T12:00:00.000Z' }, now),
    ).toBe(false);
    expect(
      isUsableFreshRun(
        { status: 'needs_identity_review', completed_at: '2026-08-20T12:00:00.000Z' },
        now,
      ),
    ).toBe(false);
  });

  it('allows Search All to satisfy a fresh platform read; not the reverse', () => {
    const sources = [
      {
        source_type: 'instagram' as const,
        status: 'succeeded' as const,
        completed_at: '2026-08-22T12:00:00.000Z',
      },
    ];
    expect(
      runSatisfiesScopeRequest({
        run: {
          requested_scope: 'all',
          status: 'succeeded',
          completed_at: '2026-08-22T12:00:00.000Z',
        },
        requestedScope: 'instagram',
        sources,
        nowMs: now,
      }),
    ).toBe(true);

    expect(
      runSatisfiesScopeRequest({
        run: {
          requested_scope: 'instagram',
          status: 'succeeded',
          completed_at: '2026-08-22T12:00:00.000Z',
        },
        requestedScope: 'all',
        sources,
        nowMs: now,
      }),
    ).toBe(false);
  });
});

describe('accountResearch scopes', () => {
  it('maps Search All to six platforms', () => {
    expect(isAccountResearchV1Scope('all')).toBe(true);
    expect(isAccountResearchV1Scope('linkedin')).toBe(false);
    expect(scopesForRequested('all')).toHaveLength(6);
    expect(scopesForRequested('website')).toEqual(['website']);
  });
});
