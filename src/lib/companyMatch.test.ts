import { describe, expect, it } from 'vitest';
import { findCompanyMatches } from '@/lib/companyMatch';
import type { Prospect } from '@/lib/prospects';

const SAMPLE: Prospect[] = [
  {
    id: 1,
    name: 'Kelowna Golf & Country Club',
    category: 'Golf',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '',
    phone: '',
    fit: '',
    accountStatus: 'active_account',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
  },
  {
    id: 2,
    name: 'Sidney Marina Store',
    category: 'Marina',
    region: 'Vancouver Island',
    city: 'Sidney',
    address: '',
    phone: '',
    fit: '',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
  },
  {
    id: 3,
    name: 'Kelowna Marina Shop',
    category: 'Marina',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '',
    phone: '',
    fit: '',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
  },
];

describe('findCompanyMatches', () => {
  it('returns empty for blank query', () => {
    expect(findCompanyMatches('  ', SAMPLE)).toEqual([]);
  });

  it('prefers exact case-insensitive matches', () => {
    expect(findCompanyMatches('sidney marina store', SAMPLE).map((p) => p.id)).toEqual([2]);
  });

  it('falls back to substring matches capped at 5', () => {
    expect(findCompanyMatches('Kelowna', SAMPLE).map((p) => p.id)).toEqual([1, 3]);
  });

  it('returns none when nothing matches', () => {
    expect(findCompanyMatches('Totally Unknown Co', SAMPLE)).toEqual([]);
  });
});
