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
  const from = vi.fn(() => ({
    select: () => ({
      order: () => ({
        limit: () => ({
          maybeSingle: async () => ({ data: { id: 10 }, error: null }),
        }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({ data: row, error: null }),
      }),
    }),
  }));
  return { from } as unknown as AgentSupabase;
}

const insertedRow = {
  id: 11,
  name: 'Kelowna Golf',
  category: 'Golf',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '1297 Glenmore Dr',
  phone: '250-762-2531',
  fit: '8/10 — Strong summer traffic.',
  account_status: 'prospect',
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
        category: 'Golf',
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
        category: 'Golf',
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
        category: 'Golf',
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
