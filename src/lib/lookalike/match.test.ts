import { describe, expect, it } from 'vitest';
import { classifyLookalikeCandidate, lookalikeStatusForMatch } from '@/lib/lookalike/match';
import type { ThinRetailer, ThinRla } from '@/lib/accountImport/matchRetailers';

function retailer(overrides: Partial<ThinRetailer> = {}): ThinRetailer {
  return {
    id: 4,
    name: 'Coast Outfitters',
    city: 'Portland',
    territoryCode: 'or',
    accountStatus: 'active_account',
    externalId: null,
    importProtected: true,
    buyerVerified: false,
    verificationStatus: null,
    ...overrides,
  };
}

function rla(overrides: Partial<ThinRla> = {}): ThinRla {
  return {
    id: 'rla-1',
    retailerId: 4,
    relationshipStatus: 'opened',
    markers: ['historical_purchaser'],
    ...overrides,
  };
}

describe('lookalike CRM dedup', () => {
  it('marks net-new names as proposed and existing CRM identity as already_in_crm', () => {
    const netNew = classifyLookalikeCandidate({
      candidate: {
        name: 'Deschutes Fly Shop',
        city: 'Bend',
        state: 'OR',
        website: null,
        whySimilar: 'Independent outdoor retailer',
      },
      retailers: [],
      rlas: [],
      contacts: [],
    });
    expect(netNew).toEqual({ matchDecision: 'create_retailer', status: 'proposed' });

    const duplicate = classifyLookalikeCandidate({
      candidate: {
        name: 'Coast Outfitters',
        city: 'Portland',
        state: 'OR',
        website: null,
        whySimilar: 'Same store',
      },
      retailers: [retailer()],
      rlas: [rla()],
      contacts: [],
    });
    expect(duplicate?.status).toBe('already_in_crm');
    expect(duplicate?.matchDecision).not.toBe('create_retailer');
  });

  it('does not demote an opened OGR RLA', () => {
    const opened = classifyLookalikeCandidate({
      candidate: {
        name: 'Coast Outfitters',
        city: 'Portland',
        state: 'OR',
        website: null,
        whySimilar: 'Opened account',
      },
      retailers: [retailer({ accountStatus: 'active_account' })],
      rlas: [rla({ relationshipStatus: 'opened', markers: ['historical_purchaser'] })],
      contacts: [],
    });
    expect(opened?.status).toBe('already_in_crm');
    expect(lookalikeStatusForMatch('update_rla')).toBe('already_in_crm');
    expect(lookalikeStatusForMatch('create_retailer')).toBe('proposed');
  });
});
