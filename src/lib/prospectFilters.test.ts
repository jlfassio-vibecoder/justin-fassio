import { describe, expect, it } from 'vitest';
import type { Prospect } from '@/lib/prospects';
import { filterProspects } from '@/lib/prospectFilters';

const SAMPLE: Prospect[] = [
  {
    id: 1,
    name: 'Kelowna Golf & Country Club',
    category: 'Golf',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '1297 Glenmore Dr',
    phone: '250-762-2531',
    fit: 'Strong golf lifestyle fit',
  },
  {
    id: 2,
    name: 'Sidney Marina Store',
    category: 'Marina',
    region: 'Vancouver Island',
    city: 'Sidney',
    address: '1 Harbour Rd',
    phone: '250-555-0100',
    fit: 'Dockside apparel traffic',
  },
  {
    id: 3,
    name: 'Nelson Hardware Co-op',
    category: 'Hardware',
    region: 'Kootenays',
    city: 'Nelson',
    address: '200 Baker St',
    phone: '250-555-0200',
    fit: 'Workwear cross-sell',
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
      filterProspects(SAMPLE, { search: '', region: 'ALL', channel: 'Marina' }).map((p) => p.id),
    ).toEqual([2]);
  });

  it('matches search across name, city, address, and fit', () => {
    expect(
      filterProspects(SAMPLE, { search: 'baker', region: 'ALL', channel: 'ALL' }).map((p) => p.id),
    ).toEqual([3]);
    expect(
      filterProspects(SAMPLE, { search: 'dockside', region: 'ALL', channel: 'ALL' }).map(
        (p) => p.id,
      ),
    ).toEqual([2]);
  });

  it('applies region, channel, and search together (AND)', () => {
    expect(
      filterProspects(SAMPLE, {
        search: 'golf',
        region: 'Okanagan',
        channel: 'Golf',
      }).map((p) => p.id),
    ).toEqual([1]);

    expect(
      filterProspects(SAMPLE, {
        search: 'golf',
        region: 'Kootenays',
        channel: 'Golf',
      }),
    ).toHaveLength(0);
  });
});
