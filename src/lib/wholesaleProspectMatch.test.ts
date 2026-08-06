import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  buildWholesaleActivityNote,
  categoryFromRetailChannel,
  matchOrCreateWholesaleProspect,
} from '@/lib/wholesaleProspectMatch';

type Admin = SupabaseClient<Database>;

const input = {
  businessName: 'Kelowna Outfitters',
  buyerName: 'Sam Buyer',
  email: 'sam@kelowna.example',
  phone: '250-555-0100',
  city: 'Kelowna',
  province: 'BC',
  retailChannel: 'Outdoor / sporting goods',
};

/** Awaitable query end that also supports chained methods used by the helper. */
function query(result: { data: unknown; error: unknown | null }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = vi.fn(self);
  api.insert = vi.fn(self);
  api.ilike = vi.fn(self);
  api.eq = vi.fn(self);
  api.order = vi.fn(self);
  api.limit = vi.fn(self);
  api.maybeSingle = vi.fn(async () => result);
  api.single = vi.fn(async () => result);
  // Make the builder thenable so `await admin.from().select().ilike()` resolves.
  api.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return api;
}

describe('categoryFromRetailChannel', () => {
  it('maps common channels', () => {
    expect(categoryFromRetailChannel('Golf / resort')).toBe('Golf');
    expect(categoryFromRetailChannel('Gift / lifestyle')).toBe('Resort Gift');
    expect(categoryFromRetailChannel('Independent specialty retail')).toBe('Hardware');
  });
});

describe('buildWholesaleActivityNote', () => {
  it('summarizes request', () => {
    const note = buildWholesaleActivityNote({
      requestNumber: 'W-2026-000001',
      totalUnits: 24,
      merchandiseSubtotalUsd: 312,
      skus: ['OG1', 'OG2'],
    });
    expect(note).toContain('W-2026-000001');
    expect(note).toContain('24 units');
    expect(note).toContain('OG1, OG2');
  });

  it('summarizes inquiry without units', () => {
    const note = buildWholesaleActivityNote({
      requestNumber: 'W-2026-000002',
      totalUnits: 0,
      merchandiseSubtotalUsd: 0,
      skus: [],
      requestType: 'inquiry',
    });
    expect(note).toBe('Wholesale inquiry W-2026-000002: no products selected.');
  });
});

describe('matchOrCreateWholesaleProspect', () => {
  it('matches unique email contact', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'account_contacts') {
        return query({ data: [{ account_id: 42 }], error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    const result = await matchOrCreateWholesaleProspect({ from } as unknown as Admin, input);
    expect(result).toEqual({ ok: true, prospectId: 42, matched: 'email' });
  });

  it('matches unique business name when email misses', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'account_contacts') {
        return query({ data: [], error: null });
      }
      if (table === 'prospects') {
        return query({ data: [{ id: 77 }], error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    const result = await matchOrCreateWholesaleProspect({ from } as unknown as Admin, input);
    expect(result).toEqual({ ok: true, prospectId: 77, matched: 'name' });
  });

  it('creates inbound prospect when no confident match', async () => {
    let prospectSelectCalls = 0;
    const prospectInsert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: 100 }, error: null }),
      }),
    }));
    const from = vi.fn((table: string) => {
      if (table === 'account_contacts') {
        // First call: email search (empty). Later: contact insert.
        const q = query({ data: [], error: null });
        q.insert = vi.fn(async () => ({ data: null, error: null }));
        return q;
      }
      if (table === 'territories') {
        return query({ data: { id: 'terr-bc' }, error: null });
      }
      if (table === 'prospects') {
        prospectSelectCalls += 1;
        if (prospectSelectCalls === 1) {
          // name match miss
          return query({ data: [], error: null });
        }
        // allocate max id
        const q = query({ data: { id: 99 }, error: null });
        q.insert = prospectInsert;
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await matchOrCreateWholesaleProspect({ from } as unknown as Admin, input);
    expect(result).toEqual({ ok: true, prospectId: 100, matched: 'created' });
    expect(prospectInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Kelowna Outfitters',
        source_note: 'Inbound wholesale (old-guys-rule-wholesale)',
        territory_id: 'terr-bc',
      }),
    );
    expect(prospectInsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ account_status: 'active_account' }),
    );
  });

  it('creates when email match is ambiguous', async () => {
    let prospectSelectCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === 'account_contacts') {
        const q = query({
          data: [{ account_id: 1 }, { account_id: 2 }],
          error: null,
        });
        q.insert = vi.fn(async () => ({ data: null, error: null }));
        return q;
      }
      if (table === 'territories') {
        return query({ data: { id: 'terr-bc' }, error: null });
      }
      if (table === 'prospects') {
        prospectSelectCalls += 1;
        if (prospectSelectCalls === 1) {
          return query({ data: [], error: null });
        }
        const q = query({ data: { id: 5 }, error: null });
        q.insert = vi.fn(() => ({
          select: () => ({
            single: async () => ({ data: { id: 6 }, error: null }),
          }),
        }));
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await matchOrCreateWholesaleProspect({ from } as unknown as Admin, input);
    expect(result).toEqual({ ok: true, prospectId: 6, matched: 'created' });
  });
});
