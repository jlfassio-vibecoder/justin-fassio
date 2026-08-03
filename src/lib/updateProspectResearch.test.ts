import { beforeEach, describe, expect, it, vi } from 'vitest';

const inferMock = vi.fn();

vi.mock('@/lib/createEnrichedProspect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/createEnrichedProspect')>();
  return {
    ...actual,
    inferEnrichedProspectFields: (...args: unknown[]) => inferMock(...args),
  };
});

import type { AgentSupabase } from '@/lib/agentAuth';
import {
  applyProspectResearchUpdate,
  previewProspectResearchUpdate,
} from '@/lib/updateProspectResearch';
import { buildResearchUpdateDiffs } from '@/lib/researchUpdateDiffs';
import type { Prospect } from '@/lib/prospects';

const currentRow = {
  id: 42,
  name: 'Old Store',
  category: 'Golf',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '1 Main St',
  phone: '250-111-1111',
  fit: '6/10 — Older notes.',
  account_status: 'prospect',
  converted_at: null,
  initial_order_date: null,
  notes: 'Keep these account notes',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const updatedRow = {
  ...currentRow,
  name: 'New Store',
  category: 'Hardware',
  region: 'Shuswap',
  city: 'Salmon Arm',
  address: '9 Lake Ave',
  phone: '250-222-2222',
  fit: '8/10 — Strong hardware traffic.',
};

function mockSupabasePreview() {
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: currentRow, error: null }),
      }),
    }),
    update: vi.fn(),
  }));
  return { from } as unknown as AgentSupabase;
}

function mockSupabaseApply() {
  const update = vi.fn(() => ({
    eq: () => ({
      select: () => ({
        single: async () => ({ data: updatedRow, error: null }),
      }),
    }),
  }));
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: currentRow, error: null }),
      }),
    }),
    update,
  }));
  return { from, update } as unknown as AgentSupabase & { update: typeof update };
}

describe('buildResearchUpdateDiffs', () => {
  it('returns only changed fields with labels', () => {
    const current: Prospect = {
      id: 1,
      name: 'A',
      category: 'Golf',
      region: 'Okanagan',
      city: 'Kelowna',
      address: '',
      phone: '',
      fit: '5/10 — x',
      accountStatus: 'prospect',
      convertedAt: null,
      initialOrderDate: null,
      notes: null,
    };
    const proposed: Prospect = {
      ...current,
      name: 'B',
      city: 'Vernon',
      fit: '8/10 — y',
    };
    const diffs = buildResearchUpdateDiffs(current, proposed);
    expect(diffs.map((d) => d.key)).toEqual(['name', 'city', 'fit']);
    expect(diffs.find((d) => d.key === 'name')).toMatchObject({ from: 'A', to: 'B' });
  });
});

describe('previewProspectResearchUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current vs proposed without calling update', async () => {
    inferMock.mockResolvedValue({
      ok: true,
      fields: {
        name: 'New Store',
        category: 'Hardware',
        region: 'Shuswap',
        city: 'Salmon Arm',
        fitScore: 8,
        notes: 'Strong hardware traffic.',
        address: '9 Lake Ave',
        phone: '250-222-2222',
      },
      researchBrief: 'brief',
    });

    const supabase = mockSupabasePreview();
    const result = await previewProspectResearchUpdate(supabase, { id: 42 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.current.name).toBe('Old Store');
    expect(result.preview.proposed.name).toBe('New Store');
    expect(result.preview.proposed.notes).toBe('Keep these account notes');
    expect(result.preview.proposed.accountStatus).toBe('prospect');
    expect(supabase.from).toHaveBeenCalledWith('prospects');
    const chain = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
      update?: unknown;
    };
    expect(chain.update).toBeDefined();
    expect(vi.mocked(chain.update as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe('applyProspectResearchUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates mapped columns and returns prospect', async () => {
    const supabase = mockSupabaseApply();
    const result = await applyProspectResearchUpdate(supabase, {
      id: 42,
      fields: {
        name: 'New Store',
        category: 'Hardware',
        region: 'Shuswap',
        city: 'Salmon Arm',
        fitScore: 8,
        notes: 'Strong hardware traffic.',
        address: '9 Lake Ave',
        phone: '250-222-2222',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prospect.name).toBe('New Store');
    expect(result.prospect.fit).toBe('8/10 — Strong hardware traffic.');
    expect(supabase.update).toHaveBeenCalledWith({
      name: 'New Store',
      category: 'Hardware',
      region: 'Shuswap',
      city: 'Salmon Arm',
      address: '9 Lake Ave',
      phone: '250-222-2222',
      fit: '8/10 — Strong hardware traffic.',
    });
  });
});
