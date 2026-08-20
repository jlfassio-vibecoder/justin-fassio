import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  accountContactRoleLabel,
  ACCOUNT_CONTACT_ROLES,
  chunkIds,
  fetchAllContacts,
  mapAccountContactRow,
  POSTGREST_UUID_IN_CHUNK,
  searchContactsByName,
} from '@/lib/accountContacts';
import type { AccountContact as AccountContactRow } from '@/types/database';

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

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('accountContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
