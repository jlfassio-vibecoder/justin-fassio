import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnrichedContact } from '@/lib/createEnrichedContact';
import type { AgentSupabase } from '@/lib/agentAuth';

const createEnrichedProspectMock = vi.fn();

vi.mock('@/lib/createEnrichedProspect', () => ({
  createEnrichedProspect: (...args: unknown[]) => createEnrichedProspectMock(...args),
}));

function mockSupabase(handlers: {
  prospectSingle?: unknown;
  contactCount?: number;
  contactInsert?: unknown;
  contactInsertError?: string | null;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'prospects') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: handlers.prospectSingle, error: null }),
          }),
        }),
      };
    }
    if (table === 'account_contacts') {
      return {
        select: () => ({
          eq: async () => ({ count: handlers.contactCount ?? 0, error: null }),
        }),
        insert: () => ({
          select: () => ({
            single: async () =>
              handlers.contactInsertError
                ? { data: null, error: { message: handlers.contactInsertError } }
                : { data: handlers.contactInsert, error: null },
          }),
        }),
      };
    }
    return {};
  });

  return { from } as unknown as AgentSupabase;
}

const contactRow = {
  id: 'c1',
  account_id: 12,
  role: 'buyer' as const,
  full_name: 'Sarah Jenkins',
  title: null,
  phone: '250-555-0100',
  email: 'sarah@example.com',
  is_primary: true,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const prospectRow = {
  id: 12,
  name: 'Kelowna Golf',
  category: 'Golf',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '',
  phone: '',
  fit: '8/10 — Strong fit',
  account_status: 'prospect' as const,
  converted_at: null,
  initial_order_date: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('createEnrichedContact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires contact and company name', async () => {
    const supabase = mockSupabase({});
    expect(
      await createEnrichedContact(supabase, {
        contactName: '',
        companyName: 'Co',
        mode: 'create_prospect',
      }),
    ).toEqual({ ok: false, error: 'Contact name is required' });
  });

  it('create_prospect enriches store then inserts contact', async () => {
    createEnrichedProspectMock.mockResolvedValue({
      ok: true,
      prospect: {
        id: 12,
        name: 'Kelowna Golf',
        category: 'Golf',
        region: 'Okanagan',
        city: 'Kelowna',
        address: '',
        phone: '',
        fit: '8/10 — Strong fit',
        accountStatus: 'prospect',
        convertedAt: null,
        initialOrderDate: null,
        notes: null,
      },
    });

    const supabase = mockSupabase({ contactInsert: contactRow });
    const result = await createEnrichedContact(supabase, {
      contactName: 'Sarah Jenkins',
      companyName: 'Kelowna Golf',
      phone: '250-555-0100',
      email: 'sarah@example.com',
      mode: 'create_prospect',
    });

    expect(createEnrichedProspectMock).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contact.fullName).toBe('Sarah Jenkins');
      expect(result.prospect.id).toBe(12);
    }
  });

  it('attach uses existing account and skips prospect AI', async () => {
    const supabase = mockSupabase({
      prospectSingle: prospectRow,
      contactCount: 0,
      contactInsert: contactRow,
    });

    const result = await createEnrichedContact(supabase, {
      contactName: 'Sarah Jenkins',
      companyName: 'Kelowna Golf',
      mode: 'attach',
      accountId: 12,
    });

    expect(createEnrichedProspectMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prospect.id).toBe(12);
      expect(result.contact.isPrimary).toBe(true);
    }
  });
});
