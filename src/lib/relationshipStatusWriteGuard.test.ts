import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertLineAllowsOperationalWrite,
  splitDirectoryByAccountOrLineRelationship,
  updateRetailerLineAccountStatus,
  usesLineRelationshipDirectorySplit,
} from '@/lib/retailerLineAccounts';

const lineRow = vi.hoisted(() => ({
  current: {
    id: 'line-1',
    code: 'wyld-gear',
    status: 'active',
    catalog_status: 'active',
    default_currency: 'USD',
  },
}));

const updates = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'retailer_line_accounts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { sales_line_id: 'line-1' }, error: null }),
            }),
          }),
          update: (patch: unknown) => {
            updates.current.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'lines') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: lineRow.current, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

describe('relationship status write guard', () => {
  beforeEach(() => {
    updates.current = [];
    lineRow.current = {
      id: 'line-1',
      code: 'wyld-gear',
      status: 'active',
      catalog_status: 'active',
      default_currency: 'USD',
    };
  });

  it('rejects a status transition on a terminated or onboarding line', () => {
    expect(
      assertLineAllowsOperationalWrite({
        code: 'big-fish',
        status: 'terminated',
        catalogStatus: 'active',
        defaultCurrency: 'USD',
      }),
    ).toBe('reject');
    expect(
      assertLineAllowsOperationalWrite({
        code: 'eagle-peak',
        status: 'onboarding',
        catalogStatus: 'active',
        defaultCurrency: 'USD',
      }),
    ).toBe('reject');
    expect(
      assertLineAllowsOperationalWrite({
        code: 'living-in-sunshine',
        status: 'onboarding',
        catalogStatus: 'draft',
        defaultCurrency: 'USD',
      }),
    ).toBe('reject');
  });

  it('allows a status transition on active Wyld', async () => {
    expect(
      assertLineAllowsOperationalWrite({
        code: 'wyld-gear',
        status: 'active',
        catalogStatus: 'active',
        defaultCurrency: 'USD',
      }),
    ).toBe('allow');

    const result = await updateRetailerLineAccountStatus({
      lineAccountId: 'rla-wyld',
      relationshipStatus: 'qualified',
    });

    expect(result).toEqual({ error: null });
    expect(updates.current).toEqual([{ relationship_status: 'qualified' }]);
  });

  it('does not update relationship status when the line cannot sell', async () => {
    lineRow.current = {
      ...lineRow.current,
      code: 'big-fish',
      status: 'terminated',
    };

    const result = await updateRetailerLineAccountStatus({
      lineAccountId: 'rla-big-fish',
      relationshipStatus: 'prospect',
    });

    expect(result).toEqual({ error: 'Operational writes are not allowed for this line' });
    expect(updates.current).toEqual([]);
  });

  it('guards relationship_status in the database and leaves notes updates alone', () => {
    const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');
    const guard = schema.slice(
      schema.indexOf('drop trigger if exists retailer_line_accounts_operational_write_guard'),
      schema.indexOf(
        'create or replace function public.enforce_order_operational_write_not_blocked',
      ),
    );
    expect(guard).toMatch(
      /before insert or update of sales_line_id, relationship_status on retailer_line_accounts/,
    );
    expect(guard).not.toMatch(/update of notes/);
  });
});

describe('line relationship isolation', () => {
  const retailer = {
    id: 42,
    accounts: [
      { lineCode: 'ogr', relationshipStatus: 'opened', accountStatus: 'active_account' },
      { lineCode: 'living-in-sunshine', relationshipStatus: 'prospect', accountStatus: 'prospect' },
      { lineCode: 'wyld-gear', relationshipStatus: 'not_qualified', accountStatus: 'prospect' },
    ],
  };

  function visibleBook(lineCode: string) {
    const account = retailer.accounts.find((row) => row.lineCode === lineCode);
    if (!account) throw new Error(`missing ${lineCode}`);
    return splitDirectoryByAccountOrLineRelationship(
      [
        {
          accountStatus: account.accountStatus,
          lineRelationshipStatus: account.relationshipStatus,
        },
      ],
      usesLineRelationshipDirectorySplit({ lineCode }),
    );
  }

  it('keeps OGR opened, Living In Sunshine prospect, and Wyld not_qualified independent', () => {
    expect(visibleBook('ogr').active).toHaveLength(1);
    expect(visibleBook('living-in-sunshine').pipeline).toHaveLength(1);
    expect(visibleBook('living-in-sunshine').active).toHaveLength(0);
    expect(visibleBook('wyld-gear').pipeline).toHaveLength(1);
    expect(visibleBook('wyld-gear').active).toHaveLength(0);

    const wyld = retailer.accounts.find((row) => row.lineCode === 'wyld-gear');
    if (!wyld) throw new Error('missing wyld');
    wyld.relationshipStatus = 'qualified';

    expect(retailer.accounts.find((row) => row.lineCode === 'ogr')?.relationshipStatus).toBe(
      'opened',
    );
    expect(
      retailer.accounts.find((row) => row.lineCode === 'living-in-sunshine')?.relationshipStatus,
    ).toBe('prospect');
    expect(visibleBook('ogr').active).toHaveLength(1);
    expect(visibleBook('living-in-sunshine').pipeline).toHaveLength(1);
    expect(visibleBook('wyld-gear').pipeline).toHaveLength(1);
  });
});
