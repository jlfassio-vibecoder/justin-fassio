import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTACT_ACTIVITY_HISTORY_LIMIT,
  isSuccessfulProductEmailSend,
  mapCallToActivityItem,
  mapEmailRowToActivityItem,
  mergeContactActivityHistory,
  fetchContactActivityHistory,
  type ContactActivityItem,
} from '@/lib/contactActivityHistory';
import {
  SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
  SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
} from '@/lib/systemMessages';

const { fetchOperationalLineAccountMock, fetchPreviousCallsForLogMock } = vi.hoisted(() => ({
  fetchOperationalLineAccountMock: vi.fn(),
  fetchPreviousCallsForLogMock: vi.fn(),
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

vi.mock('@/lib/logCallForm', async () => {
  const actual = await vi.importActual<typeof import('@/lib/logCallForm')>('@/lib/logCallForm');
  return {
    ...actual,
    fetchPreviousCallsForLog: (...args: unknown[]) => fetchPreviousCallsForLogMock(...args),
  };
});

import { supabase } from '@/lib/supabase';

function emailRow(
  overrides: Partial<{
    id: string;
    to_email: string;
    to_name: string | null;
    subject: string;
    status: string | null;
    origin: string;
    intro_text: string | null;
    sent_at: string | null;
    prospect_id: number | null;
    account_contact_id: string | null;
    retailer_line_account_id: string | null;
    catalog_item_id: string | null;
    sent_by: string | null;
    payload: unknown;
    created_at: string;
  }> = {},
) {
  return {
    id: 'email-1',
    to_email: 'buyer@example.com',
    to_name: 'Pat Buyer',
    subject: 'New product for you',
    status: 'sent' as string | null,
    origin: SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
    intro_text: null as string | null,
    sent_at: '2026-08-20T15:00:00.000Z' as string | null,
    prospect_id: 12,
    account_contact_id: 'c1' as string | null,
    retailer_line_account_id: 'rla-1' as string | null,
    catalog_item_id: 'cat-1',
    sent_by: 'user-1' as string | null,
    payload: { sku: 'SKU-1', name: 'Trail Cap', slug: 'trail-cap', productHref: 'https://x' },
    created_at: '2026-08-20T15:00:00.000Z',
    ...overrides,
  };
}

describe('isSuccessfulProductEmailSend', () => {
  it('includes successful manual send shaped like insertProductOutreachSystemMessage', () => {
    expect(
      isSuccessfulProductEmailSend({
        sent_at: '2026-08-20T15:00:00.000Z',
        status: 'sent',
      }),
    ).toBe(true);
  });

  it('includes successful agent-draft send after markAgentProductOutreachDraftSent', () => {
    expect(
      isSuccessfulProductEmailSend({
        sent_at: '2026-08-20T16:00:00.000Z',
        status: 'sent',
      }),
    ).toBe(true);
  });

  it('includes null status when sent_at is set (avoids NOT IN null trap)', () => {
    expect(
      isSuccessfulProductEmailSend({
        sent_at: '2026-08-20T15:00:00.000Z',
        status: null,
      }),
    ).toBe(true);
  });

  it('excludes drafts, pipeline, cancelled, failed, and null sent_at', () => {
    for (const status of [
      'draft',
      'queued',
      'scheduled',
      'sending',
      'cancelled',
      'failed',
    ] as const) {
      expect(
        isSuccessfulProductEmailSend({
          sent_at: '2026-08-20T15:00:00.000Z',
          status,
        }),
      ).toBe(false);
    }
    expect(isSuccessfulProductEmailSend({ sent_at: null, status: 'sent' })).toBe(false);
  });

  it('includes post-send engagement statuses', () => {
    for (const status of ['delivered', 'opened', 'clicked', 'bounced', 'complained'] as const) {
      expect(
        isSuccessfulProductEmailSend({
          sent_at: '2026-08-20T15:00:00.000Z',
          status,
        }),
      ).toBe(true);
    }
  });
});

describe('mergeContactActivityHistory', () => {
  it('sorts newest first and applies final combined limit after fetch-sized legs', () => {
    const calls: ContactActivityItem[] = Array.from({ length: 25 }, (_, i) => ({
      kind: 'call' as const,
      id: `c-${i}`,
      occurredAt: `2026-08-${String(i + 1).padStart(2, '0')}`,
      sortAt: `2026-08-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
      contactLabel: null,
      outcome: 'Left Message / Gatekeeper',
    }));
    const emails: ContactActivityItem[] = Array.from({ length: 25 }, (_, i) => ({
      kind: 'email' as const,
      id: `e-${i}`,
      occurredAt: `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
      sortAt: `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
      contactLabel: null,
      subject: `Subject ${i}`,
    }));

    const merged = mergeContactActivityHistory(calls, emails, CONTACT_ACTIVITY_HISTORY_LIMIT);
    expect(merged).toHaveLength(25);
    expect(merged.every((m) => m.kind === 'email')).toBe(true);
    expect(merged[0]?.id).toBe('e-24');
  });

  it('uses stable kind-id keys via distinct ids', () => {
    const call = mapCallToActivityItem({
      id: 'same-id',
      callDate: '2026-08-01',
      contactName: 'A',
      outcome: 'X',
      objectionTags: [],
      followUpDate: null,
      notes: null,
      createdAt: '2026-08-01T10:00:00.000Z',
    });
    const email = mapEmailRowToActivityItem(
      emailRow({ id: 'same-id', sent_at: '2026-08-02T10:00:00.000Z' }),
    );
    expect(email).not.toBeNull();
    const merged = mergeContactActivityHistory([call], [email!]);
    expect(merged.map((m) => `${m.kind}-${m.id}`)).toEqual(['email-same-id', 'call-same-id']);
  });
});

describe('fetchContactActivityHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPreviousCallsForLogMock.mockResolvedValue({ data: [], error: null });
    fetchOperationalLineAccountMock.mockResolvedValue({
      data: {
        id: 'rla-1',
        retailerId: 12,
        salesLineId: 'line-ogr',
        relationshipStatus: 'opened',
        notes: null,
        salesLineTerritoryId: null,
      },
      error: null,
    });
  });

  function mockSystemMessages(rows: ReturnType<typeof emailRow>[]) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const or = vi.fn().mockReturnValue({ order, eq: vi.fn().mockReturnValue({ order }) });
    // After .or(), we may .eq(rla) then .order().limit()
    const eqAfterOr = vi.fn().mockReturnValue({ order });
    or.mockReturnValue({ order, eq: eqAfterOr });
    const not = vi.fn().mockReturnValue({ or });
    const eqProspect = vi.fn().mockReturnValue({ not });
    const eqType = vi.fn().mockReturnValue({ eq: eqProspect });
    const select = vi.fn().mockReturnValue({ eq: eqType });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'system_messages') return { select } as never;
      if (table === 'account_contacts') {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: 'c1', full_name: 'Pat Buyer' }], error: null }),
          }),
        } as never;
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: 'user-1', display_name: 'Justin' }], error: null }),
          }),
        } as never;
      }
      throw new Error(`unexpected table ${table}`);
    });

    return { select, eqType, eqProspect, not, or, eqAfterOr, order, limit };
  }

  it('includes manual and agent sent rows for matching RLA; excludes draft', async () => {
    const rows = [
      emailRow({
        id: 'manual-1',
        origin: SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
        status: 'sent',
        sent_at: '2026-08-21T10:00:00.000Z',
      }),
      emailRow({
        id: 'agent-1',
        origin: SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
        status: 'sent',
        sent_at: '2026-08-21T11:00:00.000Z',
        intro_text: 'Hope you are well.',
      }),
      emailRow({
        id: 'draft-1',
        origin: SYSTEM_MESSAGE_ORIGIN_AGENT_PRODUCT_EMAIL,
        status: 'draft',
        sent_at: null,
      }),
    ];
    mockSystemMessages(rows);

    const result = await fetchContactActivityHistory({
      prospectId: 12,
      salesLineId: 'line-ogr',
      limit: 25,
    });

    expect(fetchPreviousCallsForLogMock).toHaveBeenCalledWith({
      prospectId: 12,
      salesLineId: 'line-ogr',
      limit: 25,
    });
    expect(fetchOperationalLineAccountMock).toHaveBeenCalledWith({
      retailerId: 12,
      salesLineId: 'line-ogr',
    });
    expect(result.error).toBeNull();
    expect(result.data.map((d) => d.id)).toEqual(['agent-1', 'manual-1']);
    expect(result.data.every((d) => d.kind === 'email')).toBe(true);
  });

  it('returns no emails when RLA missing for sales line', async () => {
    fetchOperationalLineAccountMock.mockResolvedValue({ data: null, error: null });
    mockSystemMessages([emailRow()]);

    const result = await fetchContactActivityHistory({
      prospectId: 12,
      salesLineId: 'line-missing',
    });
    expect(result.data).toEqual([]);
    expect(vi.mocked(supabase.from)).not.toHaveBeenCalled();
  });

  it('scopes emails to matching RLA and excludes other account prospect_id via query eq', async () => {
    const { eqProspect, eqAfterOr } = mockSystemMessages([
      emailRow({ id: 'keep', prospect_id: 12, retailer_line_account_id: 'rla-1' }),
    ]);

    await fetchContactActivityHistory({ prospectId: 12, salesLineId: 'line-ogr' });

    expect(eqProspect).toHaveBeenCalledWith('prospect_id', 12);
    expect(eqAfterOr).toHaveBeenCalledWith('retailer_line_account_id', 'rla-1');
  });

  it('shipped workflow: account email with prospect_id + RLA appears once; other line empty', async () => {
    const sent = emailRow({
      id: 'acct-email-1',
      prospect_id: 99,
      retailer_line_account_id: 'rla-account-line',
      subject: 'Account product email',
      status: 'sent',
      sent_at: '2026-08-21T12:00:00.000Z',
      origin: SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
    });

    fetchOperationalLineAccountMock.mockResolvedValue({
      data: {
        id: 'rla-account-line',
        retailerId: 99,
        salesLineId: 'line-a',
        relationshipStatus: 'opened',
        notes: null,
        salesLineTerritoryId: null,
      },
      error: null,
    });
    mockSystemMessages([sent]);

    const forAccount = await fetchContactActivityHistory({
      prospectId: 99,
      salesLineId: 'line-a',
    });
    expect(forAccount.data.filter((d) => d.kind === 'email')).toHaveLength(1);
    expect(forAccount.data[0]?.subject).toBe('Account product email');

    // Other line: different RLA → empty emails
    fetchOperationalLineAccountMock.mockResolvedValue({
      data: {
        id: 'rla-other-line',
        retailerId: 99,
        salesLineId: 'line-b',
        relationshipStatus: 'opened',
        notes: null,
        salesLineTerritoryId: null,
      },
      error: null,
    });
    mockSystemMessages([]); // query filtered by other RLA returns none
    const otherLine = await fetchContactActivityHistory({
      prospectId: 99,
      salesLineId: 'line-b',
    });
    expect(otherLine.data.filter((d) => d.kind === 'email')).toHaveLength(0);

    // Other account
    fetchOperationalLineAccountMock.mockResolvedValue({
      data: {
        id: 'rla-other-acct',
        retailerId: 100,
        salesLineId: 'line-a',
        relationshipStatus: 'opened',
        notes: null,
        salesLineTerritoryId: null,
      },
      error: null,
    });
    mockSystemMessages([]);
    const otherAccount = await fetchContactActivityHistory({
      prospectId: 100,
      salesLineId: 'line-a',
    });
    expect(otherAccount.data.filter((d) => d.kind === 'email')).toHaveLength(0);
  });

  it('refresh replaces list without duplicating', async () => {
    mockSystemMessages([emailRow({ id: 'once' })]);
    const first = await fetchContactActivityHistory({ prospectId: 12, salesLineId: 'line-ogr' });
    const second = await fetchContactActivityHistory({ prospectId: 12, salesLineId: 'line-ogr' });
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    expect(second.data[0]?.id).toBe('once');
  });
});
