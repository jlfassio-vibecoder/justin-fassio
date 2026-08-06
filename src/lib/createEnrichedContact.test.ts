import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';

const createEnrichedProspectMock = vi.fn();
const researchCompanyMock = vi.fn();
const generateObjectMock = vi.fn();

vi.mock('@/lib/createEnrichedProspect', () => ({
  createEnrichedProspect: (...args: unknown[]) => createEnrichedProspectMock(...args),
}));

vi.mock('@/lib/companyWebResearch', () => ({
  researchCompany: (...args: unknown[]) => researchCompanyMock(...args),
}));

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

import { createEnrichedContact, fillContactGapsFromBrief } from '@/lib/createEnrichedContact';
import { BC_PROSPECT_TERRITORY, EMPTY_PROSPECT_PLANNING } from '@/lib/prospects';

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
  title: 'Buyer',
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
  external_id: null,
  subterritory: null,
  primary_district: null,
  retail_category: null,
  website: null,
  fit_score: null,
  ideal_opening_units: null,
  priority: null,
  provisional_grade: null,
  verification_status: null,
  buyer_verified: false,
  apparel_capability: null,
  existing_ogr: null,
  qualification_status: null,
  next_action: null,
  source_note: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('fillContactGapsFromBrief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers form phone/email over research', async () => {
    const result = await fillContactGapsFromBrief({
      contactName: 'Sarah',
      brief: 'anything',
      phone: '250-111-1111',
      email: 'a@b.com',
    });
    expect(result).toEqual({ title: null, phone: '250-111-1111', email: 'a@b.com' });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('fills blank phone from brief', async () => {
    generateObjectMock.mockResolvedValue({
      object: { title: 'Buyer', phone: '250-555-9999', email: null },
    });
    const result = await fillContactGapsFromBrief({
      contactName: 'Sarah',
      brief: 'Sarah Jenkins, Buyer, 250-555-9999',
      phone: null,
      email: null,
    });
    expect(result.phone).toBe('250-555-9999');
    expect(result.title).toBe('Buyer');
  });
});

describe('createEnrichedContact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    researchCompanyMock.mockResolvedValue({ brief: 'Research brief', error: null });
    generateObjectMock.mockResolvedValue({
      object: { title: null, phone: null, email: null },
    });
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
        ...EMPTY_PROSPECT_PLANNING,
        ...BC_PROSPECT_TERRITORY,
      },
      researchBrief: 'Research brief',
    });

    const supabase = mockSupabase({ contactInsert: contactRow });
    const result = await createEnrichedContact(supabase, {
      contactName: 'Sarah Jenkins',
      companyName: 'Kelowna Golf',
      phone: '250-555-0100',
      email: 'sarah@example.com',
      mode: 'create_prospect',
    });

    expect(researchCompanyMock).toHaveBeenCalled();
    expect(createEnrichedProspectMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        companyName: 'Kelowna Golf',
        contactName: 'Sarah Jenkins',
        researchBrief: 'Research brief',
      }),
    );
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
    expect(researchCompanyMock).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prospect.id).toBe(12);
      expect(result.contact.isPrimary).toBe(true);
    }
  });
});
