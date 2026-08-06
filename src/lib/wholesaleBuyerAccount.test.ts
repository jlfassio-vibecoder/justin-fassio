import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { ensureWholesaleBuyerAccount } from '@/lib/wholesaleBuyerAccount';

describe('ensureWholesaleBuyerAccount', () => {
  it('links an existing buyer profile to the prospect', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'user-1',
          role: 'buyer',
          prospect_id: null,
          email: 'sam@example.com',
          display_name: null,
        },
      ],
      error: null,
    });
    const ilike = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ ilike }));
    const from = vi.fn(() => ({ select, update }));
    const admin = {
      from,
      auth: { admin: { inviteUserByEmail: vi.fn() } },
    } as unknown as SupabaseClient<Database>;

    const result = await ensureWholesaleBuyerAccount(admin, {
      email: 'sam@example.com',
      buyerName: 'Sam Buyer',
      prospectId: 42,
    });

    expect(result).toEqual({
      ok: true,
      userId: 'user-1',
      invited: false,
      linkedExisting: true,
    });
    expect(update).toHaveBeenCalledWith({
      prospect_id: 42,
      display_name: 'Sam Buyer',
    });
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('skips when buyer is already linked to a different prospect', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'user-2',
          role: 'buyer',
          prospect_id: 7,
          email: 'sam@example.com',
          display_name: 'Sam',
        },
      ],
      error: null,
    });
    const ilike = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ ilike }));
    const update = vi.fn();
    const from = vi.fn(() => ({ select, update }));
    const admin = {
      from,
      auth: { admin: { inviteUserByEmail: vi.fn() } },
    } as unknown as SupabaseClient<Database>;

    const result = await ensureWholesaleBuyerAccount(admin, {
      email: 'sam@example.com',
      buyerName: 'Sam Buyer',
      prospectId: 42,
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: 'Buyer already linked to a different prospect',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
