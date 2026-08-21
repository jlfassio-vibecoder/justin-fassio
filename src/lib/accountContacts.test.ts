import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  accountContactRoleLabel,
  ACCOUNT_CONTACT_ROLES,
  chunkIds,
  classifyAccountContactDuplicate,
  fetchAllContacts,
  findObviousAccountContactDuplicate,
  findPrimaryAccountContact,
  insertAccountContact,
  mapAccountContactRow,
  POSTGREST_UUID_IN_CHUNK,
  searchContactsByName,
  type AccountContact,
} from '@/lib/accountContacts';
import type { AccountContact as AccountContactRow } from '@/types/database';

const { fetchOperationalLineAccountMock } = vi.hoisted(() => ({
  fetchOperationalLineAccountMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/retailerLineAccounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/retailerLineAccounts')>(
    '@/lib/retailerLineAccounts',
  );
  return {
    ...actual,
    fetchOperationalLineAccount: (...args: unknown[]) => fetchOperationalLineAccountMock(...args),
  };
});

import { supabase } from '@/lib/supabase';

const sampleRow: AccountContactRow = {
  id: 'c1',
  account_id: 12,
  role: 'buyer',
  full_name: 'Pat Buyer',
  title: 'Softgoods',
  phone: '250-555-0100',
  email: 'pat@example.com',
  is_primary: true,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function contact(
  partial: Partial<AccountContact> & Pick<AccountContact, 'id' | 'fullName'>,
): AccountContact {
  return {
    accountId: 12,
    role: 'buyer',
    title: null,
    phone: null,
    email: null,
    isPrimary: false,
    notes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('accountContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOperationalLineAccountMock.mockResolvedValue({ data: null, error: null });
  });

  it('exposes role labels', () => {
    expect(ACCOUNT_CONTACT_ROLES).toEqual(['buyer', 'manager', 'owner']);
    expect(accountContactRoleLabel('manager')).toBe('Manager');
  });

  it('maps snake_case rows to camelCase', () => {
    expect(mapAccountContactRow(sampleRow)).toEqual({
      id: 'c1',
      accountId: 12,
      role: 'buyer',
      fullName: 'Pat Buyer',
      title: 'Softgoods',
      phone: '250-555-0100',
      email: 'pat@example.com',
      isPrimary: true,
      notes: null,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    });
  });

  it('findObviousAccountContactDuplicate prefers email then name', () => {
    const list = [
      contact({ id: 'a', fullName: 'Pat Buyer', email: 'pat@example.com', isPrimary: true }),
      contact({ id: 'b', fullName: 'Sam Other', email: 'sam@example.com' }),
    ];
    expect(
      findObviousAccountContactDuplicate(list, {
        fullName: 'Someone Else',
        email: '  PAT@example.com ',
      })?.id,
    ).toBe('a');
    expect(
      findObviousAccountContactDuplicate(list, { fullName: '  sam other  ', email: '' })?.id,
    ).toBe('b');
    expect(findObviousAccountContactDuplicate(list, { fullName: 'New Person', email: null })).toBe(
      null,
    );
  });

  it('classifyAccountContactDuplicate: email is hard, name is soft', () => {
    const list = [
      contact({ id: 'a', fullName: 'Pat Buyer', email: 'pat@example.com' }),
      contact({ id: 'b', fullName: 'Sam Other', email: null }),
    ];
    expect(
      classifyAccountContactDuplicate(list, { fullName: 'X', email: 'pat@example.com' }),
    ).toEqual({ kind: 'email', contact: list[0] });
    expect(classifyAccountContactDuplicate(list, { fullName: 'Sam Other', email: '' })).toEqual({
      kind: 'name',
      contact: list[1],
    });
    expect(
      classifyAccountContactDuplicate(list, { fullName: 'New', email: 'new@example.com' }),
    ).toBe(null);
  });

  it('findPrimaryAccountContact returns the primary row', () => {
    const list = [
      contact({ id: 'a', fullName: 'A', isPrimary: false }),
      contact({ id: 'b', fullName: 'B', isPrimary: true }),
    ];
    expect(findPrimaryAccountContact(list)?.id).toBe('b');
    expect(findPrimaryAccountContact([contact({ id: 'a', fullName: 'A' })])).toBe(null);
  });

  it('insertAccountContact skips junction without salesLineId (no client RLA create)', async () => {
    const single = vi.fn().mockResolvedValue({ data: sampleRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const upsert = vi.fn();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'account_contacts') return { insert } as never;
      if (table === 'retailer_line_contacts') return { upsert } as never;
      if (table === 'retailer_line_accounts') {
        throw new Error('must not insert retailer_line_accounts from contact path');
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await insertAccountContact({
      account_id: 12,
      role: 'buyer',
      full_name: 'Pat Buyer',
    });
    expect(result.error).toBeNull();
    expect(fetchOperationalLineAccountMock).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('insertAccountContact upserts junction only for explicit salesLineId RLA', async () => {
    const single = vi.fn().mockResolvedValue({ data: sampleRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const upsert = vi.fn().mockResolvedValue({ error: null });

    fetchOperationalLineAccountMock.mockResolvedValue({
      data: {
        id: 'rla-line-a',
        retailerId: 12,
        salesLineId: 'line-a',
        relationshipStatus: 'prospect',
        notes: null,
        salesLineTerritoryId: null,
      },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'account_contacts') return { insert } as never;
      if (table === 'retailer_line_contacts') return { upsert } as never;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await insertAccountContact(
      { account_id: 12, role: 'buyer', full_name: 'Pat Buyer' },
      { salesLineId: 'line-a' },
    );
    expect(result.error).toBeNull();
    expect(fetchOperationalLineAccountMock).toHaveBeenCalledWith({
      retailerId: 12,
      salesLineId: 'line-a',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        retailer_line_account_id: 'rla-line-a',
        account_contact_id: 'c1',
      }),
      expect.anything(),
    );
  });

  it('insertAccountContact skips junction when RLA missing for salesLineId', async () => {
    const single = vi.fn().mockResolvedValue({ data: sampleRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const upsert = vi.fn();

    fetchOperationalLineAccountMock.mockResolvedValue({ data: null, error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'account_contacts') return { insert } as never;
      if (table === 'retailer_line_contacts') return { upsert } as never;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await insertAccountContact(
      { account_id: 12, role: 'buyer', full_name: 'Pat Buyer' },
      { salesLineId: 'line-missing' },
    );
    expect(result.error).toBeNull();
    expect(result.data?.fullName).toBe('Pat Buyer');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('insertAccountContact deletes person row when junction upsert fails', async () => {
    const single = vi.fn().mockResolvedValue({ data: sampleRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'junction boom' } });

    fetchOperationalLineAccountMock.mockResolvedValue({
      data: {
        id: 'rla-line-a',
        retailerId: 12,
        salesLineId: 'line-a',
        relationshipStatus: 'prospect',
        notes: null,
        salesLineTerritoryId: null,
      },
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'account_contacts') return { insert, delete: del } as never;
      if (table === 'retailer_line_contacts') return { upsert } as never;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await insertAccountContact(
      { account_id: 12, role: 'buyer', full_name: 'Pat Buyer' },
      { salesLineId: 'line-a' },
    );
    expect(result.data).toBeNull();
    expect(result.error).toBe('junction boom');
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('searchContactsByName returns [] for blank query without querying', async () => {
    const result = await searchContactsByName('   ');
    expect(result).toEqual({ data: [], error: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('searchContactsByName enriches contacts with prospect fields', async () => {
    const contactLimit = vi.fn().mockResolvedValue({
      data: [sampleRow],
      error: null,
    });
    const contactOrder = vi.fn().mockReturnValue({ limit: contactLimit });
    const contactIlike = vi.fn().mockReturnValue({ order: contactOrder });
    const contactSelect = vi.fn().mockReturnValue({ ilike: contactIlike });

    const prospectIn = vi.fn().mockResolvedValue({
      data: [
        {
          id: 12,
          name: 'Kelowna Golf',
          city: 'Kelowna',
          account_status: 'active_account',
        },
      ],
      error: null,
    });
    const prospectSelect = vi.fn().mockReturnValue({ in: prospectIn });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'account_contacts') {
        return { select: contactSelect } as never;
      }
      if (table === 'prospects') {
        return { select: prospectSelect } as never;
      }
      if (table === 'lines') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'line-ogr' }, error: null }),
            }),
          }),
        } as never;
      }
      if (table === 'retailer_line_accounts') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                neq: async () => ({
                  data: [{ retailer_id: 12, relationship_status: 'opened' }],
                  error: null,
                }),
              }),
            }),
          }),
        } as never;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await searchContactsByName('Pat');
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      fullName: 'Pat Buyer',
      accountName: 'Kelowna Golf',
      accountCity: 'Kelowna',
      accountStatus: 'active_account',
    });
  });

  it('fetchAllContacts loads line contacts in UUID chunks instead of one giant .in()', async () => {
    const lineAccountIds = Array.from(
      { length: POSTGREST_UUID_IN_CHUNK + 1 },
      (_, i) => `rla-${i}`,
    );
    const inCalls: string[][] = [];
    const rlaNeq = vi.fn().mockResolvedValue({
      data: lineAccountIds.map((id, i) => ({
        id,
        retailer_id: i + 1,
        relationship_status: 'opened',
      })),
      error: null,
    });
    const rlaSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ neq: rlaNeq }),
    });
    const junctionIn = vi.fn().mockImplementation(async (_column: string, ids: string[]) => {
      inCalls.push(ids);
      return { data: [], error: null };
    });
    const junctionSelect = vi.fn().mockReturnValue({ in: junctionIn });
    const contactOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const contactSelect = vi.fn().mockReturnValue({ order: contactOrder });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'retailer_line_accounts') {
        return { select: rlaSelect } as never;
      }
      if (table === 'retailer_line_contacts') {
        return { select: junctionSelect } as never;
      }
      if (table === 'account_contacts') {
        return { select: contactSelect } as never;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await fetchAllContacts({ salesLineId: 'line-ogr' });
    expect(result.error).toBeNull();
    expect(inCalls).toHaveLength(2);
    expect(inCalls[0]).toHaveLength(POSTGREST_UUID_IN_CHUNK);
    expect(inCalls[1]).toHaveLength(1);
  });

  it('chunkIds splits at the PostgREST URL budget', () => {
    expect(chunkIds(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
  });
});
