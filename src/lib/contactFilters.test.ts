import { describe, expect, it } from 'vitest';
import type { ContactDirectoryRow } from '@/lib/accountContacts';
import { enrichContactsForDirectory } from '@/lib/accountContacts';
import { filterContacts } from '@/lib/contactFilters';

const BASE: ContactDirectoryRow = {
  id: 'c1',
  accountId: 1,
  role: 'buyer',
  fullName: 'Sarah Jenkins',
  title: 'Softgoods',
  phone: '250-555-0100',
  email: 'sarah@example.com',
  isPrimary: true,
  notes: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  accountName: 'Kelowna Golf & Country Club',
  accountCity: 'Kelowna',
  accountRegion: 'Okanagan',
  accountCategory: 'Golf',
  accountAddress: '1297 Glenmore Dr',
  accountPhone: '250-762-2531',
  accountStatus: 'active_account',
};

const SAMPLE: ContactDirectoryRow[] = [
  BASE,
  {
    ...BASE,
    id: 'c2',
    accountId: 2,
    fullName: 'John Owner',
    role: 'owner',
    title: null,
    email: 'john@marina.test',
    isPrimary: false,
    accountName: 'Sidney Marina Store',
    accountCity: 'Sidney',
    accountRegion: 'Vancouver Island',
    accountCategory: 'Marina',
    accountAddress: '1 Harbour Rd',
    accountPhone: '250-555-0200',
    accountStatus: 'prospect',
  },
];

describe('enrichContactsForDirectory', () => {
  it('joins store fields onto contacts', () => {
    const rows = enrichContactsForDirectory(
      [
        {
          id: 'c1',
          accountId: 12,
          role: 'buyer',
          fullName: 'Pat Buyer',
          title: null,
          phone: null,
          email: null,
          isPrimary: true,
          notes: null,
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
        },
      ],
      [
        {
          id: 12,
          name: 'Kelowna Golf',
          city: 'Kelowna',
          region: 'Okanagan',
          category: 'Golf',
          address: '1297 Glenmore',
          phone: '250-762-2531',
          account_status: 'active_account',
        },
      ],
    );

    expect(rows[0]).toMatchObject({
      fullName: 'Pat Buyer',
      accountName: 'Kelowna Golf',
      accountCity: 'Kelowna',
      accountRegion: 'Okanagan',
      accountCategory: 'Golf',
      accountStatus: 'active_account',
    });
  });

  it('falls back when store is missing', () => {
    const rows = enrichContactsForDirectory(
      [
        {
          id: 'c1',
          accountId: 99,
          role: 'manager',
          fullName: 'Orphan',
          title: null,
          phone: null,
          email: null,
          isPrimary: false,
          notes: null,
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
        },
      ],
      [],
    );
    expect(rows[0]?.accountName).toBe('—');
    expect(rows[0]?.accountStatus).toBe('prospect');
  });
});

describe('filterContacts', () => {
  it('returns all when filters are open', () => {
    expect(
      filterContacts(SAMPLE, {
        search: '',
        region: 'ALL',
        channel: 'ALL',
        accountStatus: 'ALL',
      }),
    ).toHaveLength(2);
  });

  it('filters by region, channel, and account status', () => {
    expect(
      filterContacts(SAMPLE, {
        search: '',
        region: 'Okanagan',
        channel: 'ALL',
        accountStatus: 'ALL',
      }).map((c) => c.id),
    ).toEqual(['c1']);

    expect(
      filterContacts(SAMPLE, {
        search: '',
        region: 'ALL',
        channel: 'Marina',
        accountStatus: 'ALL',
      }).map((c) => c.id),
    ).toEqual(['c2']);

    expect(
      filterContacts(SAMPLE, {
        search: '',
        region: 'ALL',
        channel: 'ALL',
        accountStatus: 'prospect',
      }).map((c) => c.id),
    ).toEqual(['c2']);
  });

  it('searches contact and store fields', () => {
    expect(
      filterContacts(SAMPLE, {
        search: 'sarah',
        region: 'ALL',
        channel: 'ALL',
        accountStatus: 'ALL',
      }).map((c) => c.id),
    ).toEqual(['c1']);

    expect(
      filterContacts(SAMPLE, {
        search: 'sidney',
        region: 'ALL',
        channel: 'ALL',
        accountStatus: 'ALL',
      }).map((c) => c.id),
    ).toEqual(['c2']);
  });
});
