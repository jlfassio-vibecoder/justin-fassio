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
  deriveProductEngagementAlerts,
  fetchProductEngagementAlerts,
  fetchProductOutreachHistory,
  insertAgentProductOutreachDraft,
  insertProductOutreachSystemMessage,
  markProductEngagementSeen,
  matchUniqueAccountContactByEmail,
  normalizeSystemMessageEmail,
  requireExplicitProductOutreachCrmAssociation,
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
    expect(chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
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
          origin: 'manual_product_email',
          intro_text: null,
          closing_text: null,
          sent_at: '2026-08-11T12:00:00.000Z',
          prospect_id: 42,
          account_contact_id: 'c1',
          catalog_item_id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          created_at: '2026-08-11T12:00:00.000Z',
          open_count: 0,
          click_count: 0,
          opened_at: null,
          clicked_at: null,
          delivered_at: null,
          bounced_at: null,
          failed_at: null,
          failure_reason: null,
        },
        {
          id: 'sm-2',
          to_email: 'other@example.com',
          to_name: null,
          subject: 'Hi',
          status: 'sent',
          origin: 'manual_product_email',
          intro_text: null,
          closing_text: null,
          sent_at: '2026-08-10T12:00:00.000Z',
          prospect_id: null,
          account_contact_id: null,
          catalog_item_id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          created_at: '2026-08-10T12:00:00.000Z',
          open_count: 1,
          click_count: 0,
          opened_at: '2026-08-10T12:30:00.000Z',
          clicked_at: null,
          delivered_at: '2026-08-10T12:05:00.000Z',
          bounced_at: null,
          failed_at: null,
          failure_reason: null,
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
        origin: 'manual_product_email',
        introText: null,
        closingText: null,
        sentAt: '2026-08-11T12:00:00.000Z',
        prospectId: 42,
        accountContactId: 'c1',
        catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        prospectName: 'Kelowna Golf',
        contactName: 'Sam Buyer',
        createdAt: '2026-08-11T12:00:00.000Z',
        openCount: 0,
        clickCount: 0,
        openedAt: null,
        clickedAt: null,
        deliveredAt: null,
        bouncedAt: null,
        failedAt: null,
        failureReason: null,
      },
      {
        id: 'sm-2',
        toEmail: 'other@example.com',
        toName: null,
        subject: 'Hi',
        status: 'sent',
        origin: 'manual_product_email',
        introText: null,
        closingText: null,
        sentAt: '2026-08-10T12:00:00.000Z',
        prospectId: null,
        accountContactId: null,
        catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        prospectName: null,
        contactName: null,
        createdAt: '2026-08-10T12:00:00.000Z',
        openCount: 1,
        clickCount: 0,
        openedAt: '2026-08-10T12:30:00.000Z',
        clickedAt: null,
        deliveredAt: '2026-08-10T12:05:00.000Z',
        bouncedAt: null,
        failedAt: null,
        failureReason: null,
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

describe('deriveProductEngagementAlerts', () => {
  it('returns opened for unseen opens', () => {
    expect(
      deriveProductEngagementAlerts(
        [
          {
            catalog_item_id: 'p1',
            last_opened_at: '2026-08-11T12:00:00.000Z',
            last_clicked_at: null,
            last_engagement_received_at: '2026-08-11T12:00:05.000Z',
          },
        ],
        {},
      ),
    ).toEqual({ p1: 'opened' });
  });

  it('prioritizes clicked over opened', () => {
    expect(
      deriveProductEngagementAlerts(
        [
          {
            catalog_item_id: 'p1',
            last_opened_at: '2026-08-11T12:00:00.000Z',
            last_clicked_at: '2026-08-11T12:05:00.000Z',
            last_engagement_received_at: '2026-08-11T12:05:05.000Z',
          },
        ],
        {},
      ),
    ).toEqual({ p1: 'clicked' });
  });

  it('clears when seen_at is at or after receipt time', () => {
    expect(
      deriveProductEngagementAlerts(
        [
          {
            catalog_item_id: 'p1',
            last_opened_at: '2026-08-11T12:00:00.000Z',
            last_clicked_at: '2026-08-11T12:05:00.000Z',
            last_engagement_received_at: '2026-08-11T12:05:05.000Z',
          },
        ],
        { p1: '2026-08-11T12:05:05.000Z' },
      ),
    ).toEqual({});
  });

  it('re-alerts after a later receipt when previously seen', () => {
    expect(
      deriveProductEngagementAlerts(
        [
          {
            catalog_item_id: 'p1',
            last_opened_at: '2026-08-11T13:00:00.000Z',
            last_clicked_at: null,
            last_engagement_received_at: '2026-08-11T13:00:10.000Z',
          },
        ],
        { p1: '2026-08-11T12:00:00.000Z' },
      ),
    ).toEqual({ p1: 'opened' });
  });

  it('alerts when a delayed older open is received after the drawer was opened', () => {
    expect(
      deriveProductEngagementAlerts(
        [
          {
            catalog_item_id: 'p1',
            // Provider occurrence is older than seen_at…
            last_opened_at: '2026-08-11T11:00:00.000Z',
            last_clicked_at: null,
            // …but system receipt is newer, so the alert returns.
            last_engagement_received_at: '2026-08-11T13:00:00.000Z',
          },
        ],
        { p1: '2026-08-11T12:00:00.000Z' },
      ),
    ).toEqual({ p1: 'opened' });
  });

  it('keeps clicked when another message only has an open', () => {
    expect(
      deriveProductEngagementAlerts(
        [
          {
            catalog_item_id: 'p1',
            last_opened_at: '2026-08-11T12:00:00.000Z',
            last_clicked_at: '2026-08-11T12:01:00.000Z',
            last_engagement_received_at: '2026-08-11T12:01:05.000Z',
          },
          {
            catalog_item_id: 'p1',
            last_opened_at: '2026-08-11T14:00:00.000Z',
            last_clicked_at: null,
            last_engagement_received_at: '2026-08-11T14:00:05.000Z',
          },
        ],
        {},
      ),
    ).toEqual({ p1: 'clicked' });
  });
});

describe('fetchProductEngagementAlerts', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('aggregates messages and seen cursors', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'system_messages') {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        catalog_item_id: 'p1',
                        last_opened_at: '2026-08-11T12:00:00.000Z',
                        last_clicked_at: null,
                        last_engagement_received_at: '2026-08-11T12:00:05.000Z',
                      },
                      {
                        catalog_item_id: 'p2',
                        last_opened_at: '2026-08-11T11:00:00.000Z',
                        last_clicked_at: '2026-08-11T11:30:00.000Z',
                        last_engagement_received_at: '2026-08-11T11:30:05.000Z',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === 'product_outreach_engagement_seen') {
        return {
          select: () =>
            Promise.resolve({
              data: [{ catalog_item_id: 'p2', seen_at: '2026-08-11T12:00:00.000Z' }],
              error: null,
            }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await fetchProductEngagementAlerts();
    expect(result).toEqual({ data: { p1: 'opened' }, error: null });
  });
});

describe('markProductEngagementSeen', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('upserts seen_at for the catalog item', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === 'product_outreach_engagement_seen') {
        return { upsert };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await markProductEngagementSeen('p1');
    expect(result).toEqual({ error: null });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ catalog_item_id: 'p1' }), {
      onConflict: 'catalog_item_id',
    });
    const payload = upsert.mock.calls[0]?.[0] as { seen_at: string };
    expect(typeof payload.seen_at).toBe('string');
  });

  it('returns error for blank catalog item id', async () => {
    const result = await markProductEngagementSeen('  ');
    expect(result).toEqual({ error: 'A catalog item id is required' });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('requireExplicitProductOutreachCrmAssociation', () => {
  it('requires a contact that belongs to the prospect', async () => {
    const client = mockClient({
      accountContacts: {
        eqMaybeSingle: { data: { id: 'c1', account_id: 42 }, error: null },
      },
    });
    await expect(
      requireExplicitProductOutreachCrmAssociation(client, {
        prospectId: 42,
        accountContactId: 'c1',
      }),
    ).resolves.toEqual({
      ok: true,
      association: { prospectId: 42, accountContactId: 'c1' },
    });
  });

  it('rejects a mismatched contact without soft-matching email', async () => {
    const client = mockClient({
      accountContacts: {
        eqMaybeSingle: { data: { id: 'c1', account_id: 99 }, error: null },
      },
    });
    await expect(
      requireExplicitProductOutreachCrmAssociation(client, {
        prospectId: 42,
        accountContactId: 'c1',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'Account contact does not belong to the given prospect',
    });
  });
});

describe('insertAgentProductOutreachDraft', () => {
  it('inserts agent_product_email draft without Resend id or sent_at', async () => {
    let inserted: Record<string, unknown> | undefined;
    const client = mockClient({
      systemMessagesInsert: { data: { id: 'draft-1' }, error: null },
      onInsert: (row) => {
        inserted = row as Record<string, unknown>;
      },
    });

    const result = await insertAgentProductOutreachDraft(client, {
      catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      toEmail: 'Buyer@Example.com',
      toName: 'Sam',
      subject: 'Old Guys Rule — American Revival',
      introText: 'Short intro',
      closingText: 'Short closing',
      prospectId: 42,
      accountContactId: 'c1',
      sentBy: 'user-1',
      payload: {
        sku: 'OG2513',
        name: 'American Revival',
        slug: 'american-revival',
        productHref: 'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
      },
    });

    expect(result).toEqual({ ok: true, id: 'draft-1' });
    expect(inserted).toEqual(
      expect.objectContaining({
        message_type: 'product_outreach',
        origin: 'agent_product_email',
        status: 'draft',
        resend_email_id: null,
        sent_at: null,
        queued_at: null,
        intro_text: 'Short intro',
        closing_text: 'Short closing',
        to_name: 'Sam',
        to_email: 'buyer@example.com',
        prospect_id: 42,
        account_contact_id: 'c1',
      }),
    );
  });

  it('rejects blank toName', async () => {
    const client = mockClient({});
    const result = await insertAgentProductOutreachDraft(client, {
      catalogItemId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      toEmail: 'buyer@example.com',
      toName: '   ',
      subject: 'Old Guys Rule — American Revival',
      introText: 'Intro',
      closingText: 'Closing',
      prospectId: 42,
      accountContactId: 'c1',
      sentBy: 'user-1',
      payload: {
        sku: 'OG2513',
        name: 'American Revival',
        slug: 'american-revival',
        productHref: 'https://example.com/p',
      },
    });
    expect(result).toEqual({ ok: false, error: 'toName is required' });
  });
});

describe('fetchLatestProductOutreachSend', () => {
  it('returns latest sent row for prospect', async () => {
    const { fetchLatestProductOutreachSend } = await import('@/lib/systemMessages');
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      not: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      or: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: 'sm-1',
          prospect_id: 42,
          to_email: 'buyer@example.com',
          sent_at: '2026-08-01T12:00:00Z',
        },
        error: null,
      })),
    };
    const client = {
      from: vi.fn(() => chain),
    } as unknown as DbClient;

    const result = await fetchLatestProductOutreachSend(client, { prospectId: 42 });
    expect(result).toEqual({
      ok: true,
      row: {
        id: 'sm-1',
        prospectId: 42,
        toEmail: 'buyer@example.com',
        sentAt: '2026-08-01T12:00:00Z',
      },
    });
  });

  it('requires prospectId or toEmail', async () => {
    const { fetchLatestProductOutreachSend } = await import('@/lib/systemMessages');
    const client = { from: vi.fn() } as unknown as DbClient;
    await expect(fetchLatestProductOutreachSend(client, {})).resolves.toEqual({
      ok: false,
      error: 'prospectId or toEmail is required',
    });
  });
});

describe('isProductOutreachRecipientSuppressed', () => {
  it('reports suppressed when a bounce row exists', async () => {
    const { isProductOutreachRecipientSuppressed } = await import('@/lib/systemMessages');
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      or: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'sm-b', status: 'bounced', bounced_at: '2026-01-01T00:00:00Z' },
        error: null,
      })),
    };
    const client = { from: vi.fn(() => chain) } as unknown as DbClient;
    await expect(
      isProductOutreachRecipientSuppressed(client, { toEmail: 'Buyer@Example.com' }),
    ).resolves.toEqual({ ok: true, suppressed: true });
  });

  it('reports not suppressed when no matching row', async () => {
    const { isProductOutreachRecipientSuppressed } = await import('@/lib/systemMessages');
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      or: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const client = { from: vi.fn(() => chain) } as unknown as DbClient;
    await expect(
      isProductOutreachRecipientSuppressed(client, { toEmail: 'clean@example.com' }),
    ).resolves.toEqual({ ok: true, suppressed: false });
  });
});

describe('fetchPendingAgentProductOutreachProspectIds', () => {
  it('collects distinct prospect ids', async () => {
    const { fetchPendingAgentProductOutreachProspectIds } = await import('@/lib/systemMessages');
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      not: vi.fn(async () => ({
        data: [{ prospect_id: 1 }, { prospect_id: 2 }, { prospect_id: 1 }],
        error: null,
      })),
    };
    const client = { from: vi.fn(() => chain) } as unknown as DbClient;
    const result = await fetchPendingAgentProductOutreachProspectIds(client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.prospectIds].sort()).toEqual([1, 2]);
    }
  });
});
