import { describe, expect, it } from 'vitest';
import {
  assertMarkUnresponsiveAllowed,
  assertReopenCandidateAllowed,
} from '@/lib/setReactivationUnresponsive';

describe('assertMarkUnresponsiveAllowed', () => {
  const candidate = {
    relationshipStatus: 'opened',
    markers: ['historical_purchaser', 'reactivation_candidate'],
  };

  it('allows opened reactivation candidates and idempotent parked rows', () => {
    expect(assertMarkUnresponsiveAllowed(candidate)).toEqual({ ok: true });
    expect(
      assertMarkUnresponsiveAllowed({
        ...candidate,
        markers: [...candidate.markers, 'outreach_eligible'],
      }),
    ).toEqual({ ok: true });
    expect(
      assertMarkUnresponsiveAllowed({
        relationshipStatus: 'inactive',
        markers: ['historical_purchaser', 'reactivation_unresponsive'],
      }),
    ).toEqual({ ok: true });
  });

  it('rejects qualifying recent orders, prospects, and non-historicals', () => {
    expect(
      assertMarkUnresponsiveAllowed({ ...candidate, hasQualifyingOrderLast365Days: true }).ok,
    ).toBe(false);
    expect(
      assertMarkUnresponsiveAllowed({
        relationshipStatus: 'prospect',
        markers: ['historical_purchaser', 'reactivation_candidate'],
      }).ok,
    ).toBe(false);
    expect(
      assertMarkUnresponsiveAllowed({
        relationshipStatus: 'opened',
        markers: ['reactivation_candidate'],
      }).ok,
    ).toBe(false);
  });
});

describe('assertReopenCandidateAllowed', () => {
  it('allows inactive unresponsive historicals only', () => {
    expect(
      assertReopenCandidateAllowed({
        relationshipStatus: 'inactive',
        markers: ['historical_purchaser', 'reactivation_unresponsive'],
      }),
    ).toEqual({ ok: true });
    expect(
      assertReopenCandidateAllowed({
        relationshipStatus: 'opened',
        markers: ['historical_purchaser', 'reactivation_unresponsive'],
      }).ok,
    ).toBe(false);
    expect(
      assertReopenCandidateAllowed({
        relationshipStatus: 'inactive',
        markers: ['historical_purchaser', 'reactivation_candidate'],
      }).ok,
    ).toBe(false);
  });
});
