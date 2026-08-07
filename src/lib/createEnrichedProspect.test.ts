import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateObjectMock = vi.fn();
const researchCompanyMock = vi.fn();

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock('@/lib/companyWebResearch', () => ({
  researchCompany: (...args: unknown[]) => researchCompanyMock(...args),
}));

import { createEnrichedProspect } from '@/lib/createEnrichedProspect';
import type { AgentSupabase } from '@/lib/agentAuth';

function mockSupabaseInsert(row: unknown) {
  const from = vi.fn((table: string) => {
    if (table === 'territories') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'terr-bc' }, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: { id: 10 }, error: null }),
          }),
        }),
      }),
      insert: () => {
        const result = { data: null, error: null };
        return {
          select: () => ({
            single: async () => ({ data: row, error: null }),
          }),
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled, onRejected),
        };
      },
    };
  });
  return { from } as unknown as AgentSupabase;
}

const insertedRow = {
  id: 11,
  name: 'Kelowna Golf',
  category: 'golf_retail',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '1297 Glenmore Dr',
  phone: '250-762-2531',
  fit: '8/10 — Strong summer traffic.',
  account_status: 'prospect',
  converted_at: null,
  initial_order_date: null,
  notes: null,
  territory_id: 'terr-bc',
  territories: { code: 'bc', name: 'British Columbia' },
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
  secondary_channels: [],
  retail_subchannels: [],
  venue_contexts: [],
  lifestyle_themes: [],
  retail_capabilities: [],

  updated_at: '2026-08-01T00:00:00Z',
};

describe('createEnrichedProspect web research', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects research brief into generateObject and maps address/phone', async () => {
    researchCompanyMock.mockResolvedValue({
      brief: 'Kelowna Golf, 1297 Glenmore Dr, 250-762-2531',
      error: null,
    });
    generateObjectMock.mockResolvedValue({
      object: {
        name: 'Kelowna Golf',
        category: 'golf_retail',
        region: 'Okanagan',
        city: 'Kelowna',
        fitScore: 8,
        notes: 'Strong summer traffic. Good OGR fit.',
        address: '1297 Glenmore Dr',
        phone: '250-762-2531',
      },
    });

    const supabase = mockSupabaseInsert(insertedRow);
    const result = await createEnrichedProspect(supabase, { companyName: 'Kelowna Golf' });

    expect(result.ok).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringMatching(/Never map hunting[\s\S]*Web research brief/),
      }),
    );
    if (result.ok) {
      expect(result.prospect.address).toBe('1297 Glenmore Dr');
      expect(result.prospect.phone).toBe('250-762-2531');
      expect(result.researchBrief).toContain('Kelowna Golf');
    }
  });

  it('continues with hint-only enrichment when research fails', async () => {
    researchCompanyMock.mockResolvedValue({ brief: null, error: 'gateway down' });
    generateObjectMock.mockResolvedValue({
      object: {
        name: 'Kelowna Golf',
        category: 'golf_retail',
        region: 'Okanagan',
        city: 'Kelowna',
        fitScore: 7,
        notes: 'Inferred from name. Solid golf channel.',
        address: null,
        phone: null,
      },
    });

    const supabase = mockSupabaseInsert({
      ...insertedRow,
      address: '',
      phone: '',
      fit: '7/10 — Inferred from name. Solid golf channel.',
    });

    const result = await createEnrichedProspect(supabase, { companyName: 'Kelowna Golf' });
    expect(result.ok).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('No web research brief available'),
      }),
    );
  });

  it('skips research when researchBrief is provided', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        name: 'Kelowna Golf',
        category: 'golf_retail',
        region: 'Okanagan',
        city: 'Kelowna',
        fitScore: 8,
        notes: 'From shared brief. Good fit.',
        address: null,
        phone: null,
      },
    });

    const supabase = mockSupabaseInsert({
      ...insertedRow,
      address: '',
      phone: '',
    });

    await createEnrichedProspect(supabase, {
      companyName: 'Kelowna Golf',
      researchBrief: 'Shared brief from contact enrich',
    });

    expect(researchCompanyMock).not.toHaveBeenCalled();
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Shared brief from contact enrich'),
      }),
    );
  });
});

describe('formatProspectFit still works', () => {
  it('encodes score', async () => {
    const { formatProspectFit, nextProspectId } = await import('@/lib/createEnrichedProspect');
    expect(formatProspectFit(8, 'Nice notes')).toBe('8/10 — Nice notes');
    expect(nextProspectId(null)).toBe(1);
    expect(nextProspectId(249)).toBe(250);
  });
});

describe('applyInboundSeedOverrides', () => {
  it('prefers seeded phone and city over AI fields', async () => {
    const { applyInboundSeedOverrides } = await import('@/lib/createEnrichedProspect');
    const next = applyInboundSeedOverrides(
      {
        name: 'Store',
        category: 'hardware_farm_rural',
        region: 'Okanagan',
        city: 'AI City',
        fitScore: 7,
        notes: 'A. B.',
        address: null,
        phone: 'AI-phone',
      },
      { phone: '250-555-0100', city: 'Kelowna' },
    );
    expect(next.phone).toBe('250-555-0100');
    expect(next.city).toBe('Kelowna');
  });

  it('keeps AI values when seeds are empty', async () => {
    const { applyInboundSeedOverrides } = await import('@/lib/createEnrichedProspect');
    const next = applyInboundSeedOverrides(
      {
        name: 'Store',
        category: 'hardware_farm_rural',
        region: 'Okanagan',
        city: 'AI City',
        fitScore: 7,
        notes: 'A. B.',
        address: null,
        phone: 'AI-phone',
      },
      {},
    );
    expect(next.phone).toBe('AI-phone');
    expect(next.city).toBe('AI City');
  });
});

describe('createEnrichedProspect inbound seeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes city/channel seeds to research and prefers seeded phone', async () => {
    researchCompanyMock.mockResolvedValue({
      brief: 'Some outdoor store',
      error: null,
    });
    generateObjectMock.mockResolvedValue({
      object: {
        name: 'Smoke Test Outfitters',
        category: 'hardware_farm_rural',
        region: 'Okanagan',
        city: 'Wrong City',
        fitScore: 7,
        notes: 'Outdoor specialty. Apparel likely.',
        address: null,
        phone: null,
      },
    });

    const supabase = mockSupabaseInsert({
      ...insertedRow,
      name: 'Smoke Test Outfitters',
      category: 'hardware_farm_rural',
      city: 'Kelowna',
      phone: '250-555-0100',
      address: '',
      fit: '7/10 — Outdoor specialty. Apparel likely.',
    });

    const result = await createEnrichedProspect(supabase, {
      companyName: 'Smoke Test Outfitters',
      contactName: 'Alex Buyer',
      phone: '250-555-0100',
      email: 'alex@example.com',
      city: 'Kelowna',
      retailChannelHint: 'Outdoor / sporting goods',
      websiteUrl: 'https://example.com',
    });

    expect(result.ok).toBe(true);
    expect(researchCompanyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: 'Smoke Test Outfitters',
        city: 'Kelowna',
        retailCategoryHint: 'Outdoor / sporting goods',
        contactName: 'Alex Buyer',
        websiteUrl: 'https://example.com',
      }),
    );
    if (result.ok) {
      expect(result.prospect.phone).toBe('250-555-0100');
      expect(result.prospect.city).toBe('Kelowna');
    }
  });
});

describe('createEnrichedProspect buyer contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    researchCompanyMock.mockResolvedValue({ brief: 'Some outdoor store', error: null });
    generateObjectMock.mockResolvedValue({
      object: {
        name: 'Smoke Test Outfitters',
        category: 'hardware_farm_rural',
        region: 'Okanagan',
        city: 'Kelowna',
        fitScore: 7,
        notes: 'Outdoor specialty. Apparel likely.',
        address: null,
        phone: null,
      },
    });
  });

  function mockRecordingSupabase(row: unknown) {
    const inserts: Array<{ table: string; payload: unknown }> = [];
    const from = vi.fn((table: string) => {
      if (table === 'territories') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'terr-bc' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { id: 10 }, error: null }),
            }),
          }),
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          const result = { data: null, error: null };
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
            then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve(result).then(onFulfilled, onRejected),
          };
        },
      };
    });
    return { supabase: { from } as unknown as AgentSupabase, inserts };
  }

  it('inserts the buyer as primary contact by default', async () => {
    const { supabase, inserts } = mockRecordingSupabase(insertedRow);

    await createEnrichedProspect(supabase, {
      companyName: 'Smoke Test Outfitters',
      contactName: 'Alex Buyer',
      email: 'alex@example.com',
    });

    const contactInsert = inserts.find((i) => i.table === 'account_contacts');
    expect(contactInsert?.payload).toMatchObject({
      full_name: 'Alex Buyer',
      email: 'alex@example.com',
      is_primary: true,
    });
  });

  it('skips the buyer contact when the caller creates its own primary', async () => {
    const { supabase, inserts } = mockRecordingSupabase(insertedRow);

    await createEnrichedProspect(supabase, {
      companyName: 'Smoke Test Outfitters',
      contactName: 'Alex Buyer',
      email: 'alex@example.com',
      createBuyerContact: false,
    });

    expect(inserts.some((i) => i.table === 'account_contacts')).toBe(false);
  });
});
