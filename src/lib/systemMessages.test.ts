import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  fetchProductOutreachHistory,
  insertProductOutreachSystemMessage,
  matchUniqueAccountContactByEmail,
  normalizeSystemMessageEmail,
  resolveProductOutreachCrmAssociation,
} from '@/lib/systemMessages';

type DbClient = SupabaseClient<Database>;

function mockClient(handlers: {
  accountContacts?: {
    ilike?: { data: unknown; error: unknown };
    eqMaybeSingle?: { data: unknown; error: unknown };
  };
  systemMessagesInsert?: { data: unknown; error: unknown };
  onInsert?: (row: unknown) => void;
}): DbClient {
  const from = vi.fn((table: string) => {
    if (table === 'account_contacts') {
      return {
        select: () => ({
          ilike: () =>
            Promise.resolve(handlers.accountContacts?.ilike ?? { data: [], error: null }),
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                handlers.accountContacts?.eqMaybeSingle ?? { data: null, error: null },
              ),
          }),
        }),
      };
    }
    if (table === 'system_messages') {
      return {
        insert: (row: unknown) => {
          handlers.onInsert?.(row);
          return {
            select: () => ({
              single: () =>
                Promise.resolve(
                  handlers.systemMessagesInsert ?? { data: { id: 'sm-1' }, error: null },
                ),
            }),
          };
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  return { from } as unknown as DbClient;
}

describe('normalizeSystemMessageEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeSystemMessageEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
  });
});

describe('matchUniqueAccountContactByEmail', () => {
  it('returns association for a unique exact match', async () => {
    const client = mockClient({
      accountContacts: {
        ilike: {
          data: [{ id: 'c1', account_id: 42, email: 'Buyer@Example.com' }],
          error: null,
        },
      },
    });
    const result = await matchUniqueAccountContactByEmail(client, 'buyer@example.com');
    expect(result).toEqual({ prospectId: 42, accountContactId: 'c1' });
  });

  it('returns null when zero matches', async () => {
    const client = mockClient({
      accountContacts: { ilike: { data: [], error: null } },
    });
    expect(await matchUniqueAccountContactByEmail(client, 'nobody@example.com')).toBeNull();
  });

  it('returns null when multiple contacts match', async () => {
    const client = mockClient({
      accountContacts: {
        ilike: {
          data: [
            { id: 'c1', account_id: 1, email: 'shared@example.com' },
            { id: 'c2', account_id: 2, email: 'shared@example.com' },
          ],
          error: null,
        },
      },
    });
    expect(await matchUniqueAccountContactByEmail(client, 'shared@example.com')).toBeNull();
  });
});

describe('resolveProductOutreachCrmAssociation', () => {
  it('rejects when only one of prospectId/accountContactId is provided', async () => {
    const client = mockClient({});
    const result = await resolveProductOutreachCrmAssociation(client, {
      prospectId: 42,
      toEmail: 'buyer@example.com',
    });
    expect(result).toEqual({
      ok: false,
      error: 'prospectId and accountContactId must be provided together',
    });
  });

  it('validates contact belongs to prospect', async () => {
    const client = mockClient({
      accountContacts: {
        eqMaybeSingle: { data: { id: 'c1', account_id: 99 }, error: null },
      },
    });
    const result = await resolveProductOutreachCrmAssociation(client, {
      prospectId: 42,
      accountContactId: 'c1',
      toEmail: 'buyer@example.com',
    });
    expect(result).toEqual({
      ok: false,
      error: 'Account contact does not belong to the given prospect',
    });
  });

  it('accepts matching explicit ids', async () => {
    const client = mockClient({
      accountContacts: {
        eqMaybeSingle: { data: { id: 'c1', account_id: 42 }, error: null },
      },
    });
    const result = await resolveProductOutreachCrmAssociation(client, {
      prospectId: 42,
      accountContactId: 'c1',
      toEmail: 'buyer@example.com',
    });
    expect(result).toEqual({
      ok: true,
      association: { prospectId: 42, accountContactId: 'c1' },
    });
  });

  it('falls back to unique email match when ids omitted', async () => {
    const client = mockClient({
      accountContacts: {
        ilike: {
          data: [{ id: 'c9', account_id: 7, email: 'buyer@example.com' }],
          error: null,
        },
      },
    });
    const result = await resolveProductOutreachCrmAssociation(client, {
      toEmail: 'buyer@example.com',
    });
    expect(result).toEqual({
      ok: true,
      association: { prospectId: 7, accountContactId: 'c9' },
    });
  });

  it('returns null FKs when email match is ambiguous', async () => {
    const client = mockClient({
      accountContacts: {
        ilike: {
          data: [
            { id: 'c1', account_id: 1, email: 'buyer@example.com' },
            { id: 'c2', account_id: 2, email: 'buyer@example.com' },
          ],
          error: null,
        },
      },
    });
    const result = await resolveProductOutreachCrmAssociation(client, {
      toEmail: 'buyer@example.com',
    });
    expect(result).toEqual({
      ok: true,
      association: { prospectId: null, accountContactId: null },
    });
  });
});

describe('insertProductOutreachSystemMessage', () => {
  it('inserts product_outreach / manual_product_email with lean payload', async () => {
    let inserted: Record<string, unknown> | undefined;
    const client = mockClient({
      systemMessagesInsert: { data: { id: 'sm-99' }, error: null },
      onInsert: (row) => {
        inserted = row as Record<string, unknown>;
      },
    });

    const result = await insertProductOutreachSystemMessage(client, {
      catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      resendEmailId: 're_123',
      toEmail: 'Buyer@Example.com',
      toName: 'Sam',
      subject: 'Old Guys Rule — American Revival',
      prospectId: 42,
      accountContactId: 'c1',
      sentBy: 'user-1',
      payload: {
        sku: 'OG2513',
        name: 'American Revival',
        slug: 'american-revival',
        productHref: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
        from: 'Justin Fassio <office@justinfassio.com>',
      },
    });

    expect(result).toEqual({ ok: true, id: 'sm-99' });
    expect(inserted).toEqual(
      expect.objectContaining({
        message_type: 'product_outreach',
        origin: 'manual_product_email',
        status: 'sent',
        catalog_item_id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        resend_email_id: 're_123',
        to_email: 'buyer@example.com',
        to_name: 'Sam',
        subject: 'Old Guys Rule — American Revival',
        prospect_id: 42,
        account_contact_id: 'c1',
        sent_by: 'user-1',
        payload: {
          sku: 'OG2513',
          name: 'American Revival',
          slug: 'american-revival',
          productHref: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
          from: 'Justin Fassio <office@justinfassio.com>',
        },
      }),
    );
    expect(inserted).toEqual(
      expect.objectContaining({
        sent_at: expect.any(String),
        queued_at: expect.any(String),
      }),
    );
    expect(JSON.stringify(inserted?.payload)).not.toMatch(/<html|<p>|script/i);
  });

  it('returns error when insert fails', async () => {
    const client = mockClient({
      systemMessagesInsert: { data: null, error: { message: 'rls denied' } },
    });
    const result = await insertProductOutreachSystemMessage(client, {
      catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      resendEmailId: 're_123',
      toEmail: 'buyer@example.com',
      subject: 'Hello',
      sentBy: 'user-1',
      payload: {
        sku: 'OG2513',
        name: 'American Revival',
        slug: 'american-revival',
        productHref: 'https://example.com/p',
      },
    });
    expect(result).toEqual({ ok: false, error: 'rls denied' });
  });
});

describe('fetchProductOutreachHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockHistoryQuery(result: { data: unknown; error: unknown }) {
    const limit = vi.fn().mockResolvedValue(result);
    const order = vi.fn().mockReturnValue({ limit });
    const eqCatalog = vi.fn().mockReturnValue({ order });
    const eqType = vi.fn().mockReturnValue({ eq: eqCatalog });
    const select = vi.fn().mockReturnValue({ eq: eqType });
    return { select, eqType, eqCatalog, order, limit };
  }

  it('returns empty list when no rows', async () => {
    const chain = mockHistoryQuery({ data: [], error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === 'system_messages') return chain;
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await fetchProductOutreachHistory('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');
    expect(result).toEqual({ data: [], error: null });
    expect(chain.eqType).toHaveBeenCalledWith('message_type', 'product_outreach');
    expect(chain.eqCatalog).toHaveBeenCalledWith(
      'catalog_item_id',
      'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    );
    expect(chain.order).toHaveBeenCalledWith('sent_at', {
      ascending: false,
      nullsFirst: false,
    });
    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  it('maps rows and enriches CRM names', async () => {
    const chain = mockHistoryQuery({
      data: [
        {
          id: 'sm-1',
          to_email: 'buyer@example.com',
          to_name: 'Sam',
          subject: 'Hello',
          status: 'sent',
          sent_at: '2026-08-11T12:00:00.000Z',
          prospect_id: 42,
          account_contact_id: 'c1',
          created_at: '2026-08-11T12:00:00.000Z',
        },
        {
          id: 'sm-2',
          to_email: 'other@example.com',
          to_name: null,
          subject: 'Hi',
          status: 'sent',
          sent_at: '2026-08-10T12:00:00.000Z',
          prospect_id: null,
          account_contact_id: null,
          created_at: '2026-08-10T12:00:00.000Z',
        },
      ],
      error: null,
    });

    const prospectsIn = vi.fn().mockResolvedValue({
      data: [{ id: 42, name: 'Kelowna Golf' }],
      error: null,
    });
    const contactsIn = vi.fn().mockResolvedValue({
      data: [{ id: 'c1', full_name: 'Sam Buyer' }],
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'system_messages') return chain;
      if (table === 'prospects') {
        return { select: () => ({ in: prospectsIn }) };
      }
      if (table === 'account_contacts') {
        return { select: () => ({ in: contactsIn }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await fetchProductOutreachHistory('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'sm-1',
        toEmail: 'buyer@example.com',
        toName: 'Sam',
        subject: 'Hello',
        status: 'sent',
        sentAt: '2026-08-11T12:00:00.000Z',
        prospectId: 42,
        accountContactId: 'c1',
        prospectName: 'Kelowna Golf',
        contactName: 'Sam Buyer',
        createdAt: '2026-08-11T12:00:00.000Z',
      },
      {
        id: 'sm-2',
        toEmail: 'other@example.com',
        toName: null,
        subject: 'Hi',
        status: 'sent',
        sentAt: '2026-08-10T12:00:00.000Z',
        prospectId: null,
        accountContactId: null,
        prospectName: null,
        contactName: null,
        createdAt: '2026-08-10T12:00:00.000Z',
      },
    ]);
    expect(prospectsIn).toHaveBeenCalledWith('id', [42]);
    expect(contactsIn).toHaveBeenCalledWith('id', ['c1']);
  });

  it('returns error when the query fails', async () => {
    const chain = mockHistoryQuery({ data: null, error: { message: 'permission denied' } });
    fromMock.mockImplementation((table: string) => {
      if (table === 'system_messages') return chain;
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await fetchProductOutreachHistory('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');
    expect(result).toEqual({ data: [], error: 'permission denied' });
  });

  it('returns error for blank catalog item id', async () => {
    const result = await fetchProductOutreachHistory('  ');
    expect(result).toEqual({ data: [], error: 'A catalog item id is required' });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
