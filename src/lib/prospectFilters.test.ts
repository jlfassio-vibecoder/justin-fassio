import { describe, expect, it } from 'vitest';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';
import { filterProspects } from '@/lib/prospectFilters';

const SAMPLE: Prospect[] = [
  {
    id: 1,
    name: 'Kelowna Golf & Country Club',
    category: 'golf_retail',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '1297 Glenmore Dr',
    phone: '250-762-2531',
    fit: 'Strong golf lifestyle fit',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    ...BC_PROSPECT_TERRITORY,
  },
  {
    id: 2,
    name: 'Sidney Marina Store',
    category: 'marine_retail',
    region: 'Vancouver Island',
    city: 'Sidney',
    address: '1 Harbour Rd',
    phone: '250-555-0100',
    fit: 'Dockside apparel traffic',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    ...BC_PROSPECT_TERRITORY,
  },
  {
    id: 3,
    name: 'Nelson Hardware Co-op',
    category: 'hardware_farm_rural',
    region: 'Kootenays',
    city: 'Nelson',
    address: '200 Baker St',
    phone: '250-555-0200',
    fit: 'Workwear cross-sell',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    ...BC_PROSPECT_TERRITORY,
  },
];

describe('filterProspects', () => {
  it('returns all when filters are open', () => {
    expect(filterProspects(SAMPLE, { search: '', region: 'ALL', channel: 'ALL' })).toHaveLength(3);
  });

  it('filters by region', () => {
    expect(
      filterProspects(SAMPLE, { search: '', region: 'Okanagan', channel: 'ALL' }).map((p) => p.id),
    ).toEqual([1]);
  });

  it('filters by channel', () => {
    expect(
      filterProspects(SAMPLE, { search: '', region: 'ALL', channel: 'marine_retail' }).map(
        (p) => p.id,
      ),
    ).toEqual([2]);
  });

  it('matches search across name, city, address, fit, and planning fields', () => {
    expect(
      filterProspects(SAMPLE, { search: 'baker', region: 'ALL', channel: 'ALL' }).map((p) => p.id),
    ).toEqual([3]);
    expect(
      filterProspects(SAMPLE, { search: 'dockside', region: 'ALL', channel: 'ALL' }).map(
        (p) => p.id,
      ),
    ).toEqual([2]);
    expect(
      filterProspects([{ ...SAMPLE[0], externalId: 'BC-001', website: 'https://example.com' }], {
        search: 'bc-001',
        region: 'ALL',
        channel: 'ALL',
      }).map((p) => p.id),
    ).toEqual([1]);
  });

  it('applies region, channel, and search together (AND)', () => {
    expect(
      filterProspects(SAMPLE, {
        search: 'golf',
        region: 'Okanagan',
        channel: 'golf_retail',
      }).map((p) => p.id),
    ).toEqual([1]);

    expect(
      filterProspects(SAMPLE, {
        search: 'golf',
        region: 'Kootenays',
        channel: 'golf_retail',
      }),
    ).toHaveLength(0);
  });

  it('filters by territory code (default ALL when omitted)', () => {
    const mixed = [SAMPLE[0], { ...SAMPLE[1], territoryCode: 'ab', territoryName: 'Alberta' }];
    expect(
      filterProspects(mixed, {
        search: '',
        region: 'ALL',
        channel: 'ALL',
        territoryCode: 'bc',
      }).map((p) => p.id),
    ).toEqual([1]);
    expect(
      filterProspects(mixed, {
        search: '',
        region: 'ALL',
        channel: 'ALL',
        territoryCode: 'ab',
      }).map((p) => p.id),
    ).toEqual([2]);
  });

  it('includes Oregon/Washington regions and territory ALL', () => {
    const portland: Prospect = {
      ...SAMPLE[0],
      id: 10,
      name: 'Portland Outfitters',
      region: 'Oregon',
      city: 'Portland',
      territoryCode: 'or',
      territoryName: 'Oregon',
    };
    const seattle: Prospect = {
      ...SAMPLE[0],
      id: 11,
      name: 'Seattle Marine',
      region: 'Washington',
      city: 'Seattle',
      territoryCode: 'wa',
      territoryName: 'Washington',
    };
    const mixed = [...SAMPLE, portland, seattle];
    expect(
      filterProspects(mixed, { search: '', region: 'Oregon', channel: 'ALL' }).map((p) => p.id),
    ).toEqual([10]);
    expect(
      filterProspects(mixed, { search: '', region: 'Washington', channel: 'ALL' }).map((p) => p.id),
    ).toEqual([11]);
    expect(
      filterProspects(mixed, {
        search: '',
        region: 'ALL',
        channel: 'ALL',
        territoryCode: 'ALL',
      }).map((p) => p.id),
    ).toEqual([1, 2, 3, 10, 11]);
  });
});
