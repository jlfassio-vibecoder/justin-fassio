import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSupabase } from '@/lib/agentAuth';

const createEnrichedProspectMock = vi.fn();
const researchCompanyMock = vi.fn();
const generateObjectMock = vi.fn();
const buildContactResearchBriefMock = vi.fn();
const matchProspectToYelpMock = vi.fn();

vi.mock('@/lib/createEnrichedProspect', () => ({
  createEnrichedProspect: (...args: unknown[]) => createEnrichedProspectMock(...args),
}));

vi.mock('@/lib/companyWebResearch', () => ({
  researchCompany: (...args: unknown[]) => researchCompanyMock(...args),
}));

vi.mock('@/lib/contactResearch/buildContactResearchBrief', () => ({
  buildContactResearchBrief: (...args: unknown[]) => buildContactResearchBriefMock(...args),
  composeContactResearchBrief: (seed: string, brief: string | null) =>
    [seed, brief].filter(Boolean).join('\n\n---\n\n') || null,
}));

vi.mock('@/lib/yelp/businessMatch', () => ({
  matchProspectToYelp: (...args: unknown[]) => matchProspectToYelpMock(...args),
}));

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

import {
  applyEnrichedContactAttach,
  createEnrichedContact,
  fillContactGapsFromBrief,
  previewEnrichedContactAttach,
} from '@/lib/createEnrichedContact';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
} from '@/lib/prospects';

function mockSupabase(handlers: {
  prospectSingle?: unknown;
  contactCount?: number;
  contactList?: unknown[];
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
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === 'exact' && opts?.head) {
            return {
              eq: async () => ({ count: handlers.contactCount ?? 0, error: null }),
            };
          }
          return {
            eq: () => ({
              order: () => ({
                order: async () => ({
                  data: handlers.contactList ?? [],
                  error: null,
                }),
              }),
            }),
          };
        },
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
    if (table === 'lines') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'line-ogr' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'retailer_line_accounts') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              neq: () => ({
                maybeSingle: async () => ({ data: { id: 'rla-1' }, error: null }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: 'rla-1' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'retailer_line_contacts') {
      return {
        upsert: async () => ({ error: null }),
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
  secondary_channels: [],
  retail_subchannels: [],
  venue_contexts: [],
  lifestyle_themes: [],
  retail_capabilities: [],

  updated_at: '2026-08-01T00:00:00Z',
};

const prospectRow = {
  id: 12,
  name: 'Kelowna Golf',
  category: 'golf_retail',
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
  import_protected: false,
  apparel_capability: null,
  existing_ogr: null,
  qualification_status: null,
  next_action: null,
  source_note: null,
  postal_code: null,
  created_at: '2026-08-01T00:00:00Z',
  secondary_channels: [],
  retail_subchannels: [],
  venue_contexts: [],
  lifestyle_themes: [],
  retail_capabilities: [],

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
    buildContactResearchBriefMock.mockResolvedValue({
      seedBlock: 'seed',
      yelpMatch: null,
      websiteUrl: null,
      researchBrief: null,
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
        category: 'golf_retail',
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
        ...EMPTY_PROSPECT_TAXONOMY,
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

describe('previewEnrichedContactAttach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildContactResearchBriefMock.mockResolvedValue({
      seedBlock: 'Yelp directory listing',
      yelpMatch: { business: { url: 'https://www.yelp.com/biz/test' } },
      websiteUrl: 'https://store.com',
      researchBrief: null,
    });
    researchCompanyMock.mockResolvedValue({ brief: 'Perplexity brief', error: null });
    generateObjectMock.mockResolvedValue({
      object: { title: 'General Manager', phone: '541-555-0100', email: null },
    });
  });

  it('returns preview with mapped role', async () => {
    const supabase = mockSupabase({
      prospectSingle: prospectRow,
      contactCount: 1,
      contactList: [],
    });

    const result = await previewEnrichedContactAttach(supabase, {
      accountId: 12,
      candidateName: 'Sarah Jenkins',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.proposed.role).toBe('manager');
      expect(result.preview.proposed.fullName).toBe('Sarah Jenkins');
      expect(result.preview.yelpListingUrl).toBe('https://www.yelp.com/biz/test');
    }
  });
});

describe('applyEnrichedContactAttach', () => {
  it('uses staff-confirmed role on insert', async () => {
    const supabase = mockSupabase({
      prospectSingle: prospectRow,
      contactCount: 1,
      contactList: [],
      contactInsert: { ...contactRow, role: 'owner' },
    });

    const result = await applyEnrichedContactAttach(supabase, {
      accountId: 12,
      fullName: 'Sarah Jenkins',
      title: 'Owner',
      phone: null,
      email: null,
      role: 'owner',
    });

    expect(result.ok).toBe(true);
  });

  it('blocks apply on email duplicate without confirm flag', async () => {
    const supabase = mockSupabase({
      prospectSingle: prospectRow,
      contactCount: 1,
      contactList: [
        {
          id: 'c-existing',
          account_id: 12,
          role: 'buyer',
          full_name: 'Sarah J.',
          title: null,
          phone: null,
          email: 'sarah@example.com',
          is_primary: true,
          notes: null,
          created_at: '',
          updated_at: '',
        },
      ],
    });

    const result = await applyEnrichedContactAttach(supabase, {
      accountId: 12,
      fullName: 'Sarah Jenkins',
      email: 'sarah@example.com',
      role: 'buyer',
    });

    expect(result).toEqual({
      ok: false,
      error: 'A contact with email sarah@example.com already exists (Sarah J.)',
    });
  });
});
