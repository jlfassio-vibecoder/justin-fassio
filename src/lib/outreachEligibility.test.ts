import { describe, expect, it } from 'vitest';
import type { AccountContact } from '@/lib/accountContacts';
import {
  channelMatchCost,
  compareOutreachProspectRank,
  isRlaInOutreachPool,
  isWithinOutreachCooldown,
  pickOutreachContact,
  prospectPassesAccountStatus,
  prospectPassesOutreachPool,
  resolveProspectOutreachChannels,
} from '@/lib/outreachEligibility';

function contact(
  partial: Partial<AccountContact> & Pick<AccountContact, 'id' | 'fullName'>,
): AccountContact {
  return {
    accountId: 1,
    role: 'manager',
    title: null,
    phone: null,
    email: null,
    isPrimary: false,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('pickOutreachContact', () => {
  it('prefers primary with valid email', () => {
    const picked = pickOutreachContact([
      contact({ id: '1', fullName: 'A', email: 'a@example.com', role: 'buyer' }),
      contact({ id: '2', fullName: 'B', email: 'b@example.com', isPrimary: true }),
    ]);
    expect(picked?.contact.id).toBe('2');
    expect(picked?.toEmail).toBe('b@example.com');
  });

  it('prefers buyer when no primary email', () => {
    const picked = pickOutreachContact([
      contact({ id: '1', fullName: 'Mgr', email: 'mgr@example.com', role: 'manager' }),
      contact({ id: '2', fullName: 'Buy', email: 'buy@example.com', role: 'buyer' }),
    ]);
    expect(picked?.contact.id).toBe('2');
  });

  it('returns null when only invalid emails', () => {
    expect(
      pickOutreachContact([contact({ id: '1', fullName: 'X', email: 'not-an-email' })]),
    ).toBeNull();
  });
});

describe('isWithinOutreachCooldown', () => {
  it('is true inside window and false outside / never sent', () => {
    const asOf = new Date('2026-08-12T12:00:00Z');
    expect(isWithinOutreachCooldown(null, { asOf })).toBe(false);
    expect(isWithinOutreachCooldown('2026-08-10T12:00:00Z', { asOf, cooldownDays: 14 })).toBe(true);
    expect(isWithinOutreachCooldown('2026-07-01T12:00:00Z', { asOf, cooldownDays: 14 })).toBe(
      false,
    );
  });
});

describe('compareOutreachProspectRank', () => {
  const allocated = new Set(['golf_retail'] as const);

  it('orders by priority then fitScore then channel match then id', () => {
    const a = {
      id: 2,
      priority: 'Tier 2',
      fitScore: 9,
      provisionalGrade: 'B (provisional)',
      primaryChannel: 'golf_retail' as const,
      secondaryChannels: [],
      lastSentAt: null,
    };
    const b = {
      id: 1,
      priority: 'Tier 1',
      fitScore: 5,
      provisionalGrade: 'A (provisional)',
      primaryChannel: 'marine_retail' as const,
      secondaryChannels: [],
      lastSentAt: null,
    };
    expect(compareOutreachProspectRank(b, a, { allocatedChannels: allocated })).toBeLessThan(0);
  });

  it('puts never-sent before older sent', () => {
    const never = {
      id: 1,
      priority: null,
      fitScore: null,
      provisionalGrade: null,
      primaryChannel: null,
      secondaryChannels: [],
      lastSentAt: null,
    };
    const sent = {
      ...never,
      id: 2,
      lastSentAt: '2026-01-01T00:00:00Z',
    };
    expect(compareOutreachProspectRank(never, sent, { allocatedChannels: [] })).toBeLessThan(0);
  });

  it('ranks higher fitScore before lower even when lower band has higher weight', () => {
    const base = {
      priority: 'Tier 1',
      provisionalGrade: 'A (provisional)',
      primaryChannel: 'golf_retail' as const,
      secondaryChannels: [],
      lastSentAt: null,
    };
    const topBand = { ...base, id: 3, fitScore: 9 };
    const bottomBand = { ...base, id: 4, fitScore: 3 };
    const bandWeights = new Map([
      ['8-10', 0.05],
      ['1-5', 0.01],
    ]);
    expect(
      compareOutreachProspectRank(topBand, bottomBand, {
        allocatedChannels: allocated,
        fitBandWeights: bandWeights,
        globalFitBandWeight: 0.015,
        fitBandWeightSource: 'measured',
      }),
    ).toBeLessThan(0);
  });

  it('uses fitScore before fit-band weight when scores differ', () => {
    const base = {
      priority: 'Tier 1',
      provisionalGrade: null,
      primaryChannel: null,
      secondaryChannels: [],
      lastSentAt: null,
    };
    const higherFit = { ...base, id: 1, fitScore: 9 };
    const lowerFitHighBandWeight = { ...base, id: 2, fitScore: 3 };
    const bandWeights = new Map([
      ['8-10', 0.01],
      ['1-5', 0.1],
    ]);
    expect(
      compareOutreachProspectRank(higherFit, lowerFitHighBandWeight, {
        allocatedChannels: [],
        fitBandWeights: bandWeights,
        globalFitBandWeight: 0.015,
        fitBandWeightSource: 'measured',
      }),
    ).toBeLessThan(0);
  });

  it('keeps Tier 1 ahead of Tier 2 regardless of fit-band weight', () => {
    const tier1 = {
      id: 1,
      priority: 'Tier 1',
      fitScore: 3,
      provisionalGrade: null,
      primaryChannel: null,
      secondaryChannels: [],
      lastSentAt: null,
    };
    const tier2 = {
      id: 2,
      priority: 'Tier 2',
      fitScore: 9,
      provisionalGrade: null,
      primaryChannel: null,
      secondaryChannels: [],
      lastSentAt: null,
    };
    const weights = new Map([
      ['8-10', 0.01],
      ['1-5', 0.1],
    ]);
    expect(
      compareOutreachProspectRank(tier1, tier2, {
        allocatedChannels: [],
        fitBandWeights: weights,
        globalFitBandWeight: 0.015,
        fitBandWeightSource: 'measured',
      }),
    ).toBeLessThan(0);
  });

  it('ignores measured fit-band weights when globalFitBandWeight is missing', () => {
    const base = {
      priority: 'Tier 1',
      provisionalGrade: null,
      primaryChannel: null,
      secondaryChannels: [],
      lastSentAt: null,
      fitScore: 5,
    };
    const a = { ...base, id: 1 };
    const b = { ...base, id: 2 };
    const bandWeights = new Map([
      ['1-5', 0.01],
      ['6-7', 0.1],
    ]);
    expect(
      compareOutreachProspectRank(a, b, {
        allocatedChannels: [],
        fitBandWeights: bandWeights,
        fitBandWeightSource: 'measured',
      }),
    ).toBeLessThan(0);
  });
});

describe('resolveProspectOutreachChannels', () => {
  it('uses category when present', () => {
    const resolved = resolveProspectOutreachChannels({
      category: 'golf_retail',
      retailCategory: 'Marine',
      secondaryChannels: ['marine_retail'],
    });
    expect(resolved.primaryChannel).toBe('golf_retail');
    expect(resolved.allChannels).toContain('marine_retail');
  });
});

describe('channelMatchCost', () => {
  it('returns 0 on match and 1 otherwise', () => {
    expect(channelMatchCost(['golf_retail'], ['golf_retail'])).toBe(0);
    expect(channelMatchCost(['marine_retail'], ['golf_retail'])).toBe(1);
  });
});

describe('outreach pool eligibility', () => {
  it('keeps prospects eligible and allows opted-in active accounts', () => {
    expect(prospectPassesAccountStatus({ accountStatus: 'prospect' })).toBe(true);
    expect(prospectPassesAccountStatus({ accountStatus: 'active_account' })).toBe(false);
    expect(prospectPassesOutreachPool({ accountStatus: 'prospect' })).toBe(true);
    expect(prospectPassesOutreachPool({ accountStatus: 'active_account' })).toBe(true);
    expect(prospectPassesOutreachPool({ accountStatus: 'inactive' })).toBe(false);
  });

  it('includes OGR prospects and opted-in opened reactivation candidates', () => {
    expect(isRlaInOutreachPool({ relationshipStatus: 'prospect', markers: [] })).toBe(true);
    expect(
      isRlaInOutreachPool({
        relationshipStatus: 'opened',
        markers: ['historical_purchaser', 'reactivation_candidate'],
      }),
    ).toBe(false);
    expect(
      isRlaInOutreachPool({
        relationshipStatus: 'opened',
        markers: ['historical_purchaser', 'reactivation_candidate', 'outreach_eligible'],
      }),
    ).toBe(true);
    expect(
      isRlaInOutreachPool({
        relationshipStatus: 'opened',
        markers: [
          'historical_purchaser',
          'reactivation_candidate',
          'outreach_eligible',
          'reactivation_unresponsive',
        ],
      }),
    ).toBe(false);
    expect(
      isRlaInOutreachPool({
        relationshipStatus: 'inactive',
        markers: ['historical_purchaser', 'reactivation_candidate', 'outreach_eligible'],
      }),
    ).toBe(false);
    expect(
      isRlaInOutreachPool({
        relationshipStatus: 'prospect',
        markers: ['lookalike_prospect'],
      }),
    ).toBe(false);
    expect(
      isRlaInOutreachPool(
        {
          relationshipStatus: 'prospect',
          markers: ['lookalike_prospect'],
        },
        { includeLookalikeDiscovery: true },
      ),
    ).toBe(true);
    expect(
      isRlaInOutreachPool({
        relationshipStatus: 'prospect',
        markers: ['lookalike_prospect', 'outreach_eligible'],
      }),
    ).toBe(true);
  });
});
