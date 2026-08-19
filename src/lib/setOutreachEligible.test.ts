import { describe, expect, it } from 'vitest';
import { assertOutreachOptInAllowed } from '@/lib/setOutreachEligible';

describe('assertOutreachOptInAllowed', () => {
  const reactivation = {
    relationshipStatus: 'opened',
    markers: ['historical_purchaser', 'reactivation_candidate'],
  };

  it('allows opt-in on opened reactivation candidates', () => {
    expect(assertOutreachOptInAllowed({ ...reactivation, eligible: true })).toEqual({ ok: true });
    expect(assertOutreachOptInAllowed({ ...reactivation, eligible: false })).toEqual({ ok: true });
  });

  it('rejects prospects, non-candidates, and unresponsive opt-in', () => {
    expect(
      assertOutreachOptInAllowed({
        relationshipStatus: 'prospect',
        markers: [],
        eligible: true,
      }).ok,
    ).toBe(false);
    expect(
      assertOutreachOptInAllowed({
        relationshipStatus: 'opened',
        markers: ['historical_purchaser'],
        eligible: true,
      }).ok,
    ).toBe(false);
    expect(
      assertOutreachOptInAllowed({
        relationshipStatus: 'opened',
        markers: ['historical_purchaser', 'reactivation_candidate', 'reactivation_unresponsive'],
        eligible: true,
      }).ok,
    ).toBe(false);
    expect(
      assertOutreachOptInAllowed({
        relationshipStatus: 'opened',
        markers: [
          'historical_purchaser',
          'reactivation_candidate',
          'reactivation_unresponsive',
          'outreach_eligible',
        ],
        eligible: false,
      }),
    ).toEqual({ ok: true });
  });
});
