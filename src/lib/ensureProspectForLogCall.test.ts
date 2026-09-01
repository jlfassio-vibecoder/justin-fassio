import { describe, expect, it, vi } from 'vitest';
import { ensureProspectForLogCall } from '@/lib/ensureProspectForLogCall';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';

function stubProspect(id: number, name: string): Prospect {
  return {
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    ...BC_PROSPECT_TERRITORY,
    id,
    name,
    city: 'Newport',
    region: 'Oregon Coast',
    category: 'apparel_specialty',
    address: '',
    phone: '',
    fit: '',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
  };
}

describe('ensureProspectForLogCall', () => {
  it('returns the in-memory prospect without fetching', async () => {
    const fetchById = vi.fn();
    const prospect = stubProspect(7, 'Local Shop');
    const result = await ensureProspectForLogCall({
      prospectId: 7,
      prospects: [prospect],
      fetchById,
    });
    expect(result).toEqual({ ok: true, prospect, alreadyPresent: true });
    expect(fetchById).not.toHaveBeenCalled();
  });

  it('fetches and returns when missing from the list', async () => {
    const fetched = stubProspect(42, 'Fetched Shop');
    const fetchById = vi.fn().mockResolvedValue({ data: fetched, error: null });
    const result = await ensureProspectForLogCall({
      prospectId: 42,
      prospects: [],
      fetchById,
    });
    expect(result).toEqual({ ok: true, prospect: fetched, alreadyPresent: false });
    expect(fetchById).toHaveBeenCalledWith(42);
  });

  it('returns an error when fetch fails or returns null', async () => {
    const fetchById = vi.fn().mockResolvedValue({ data: null, error: 'network' });
    const fail = await ensureProspectForLogCall({
      prospectId: 1,
      prospects: [],
      fetchById,
    });
    expect(fail).toEqual({ ok: false, error: 'network' });

    fetchById.mockResolvedValue({ data: null, error: null });
    const missing = await ensureProspectForLogCall({
      prospectId: 1,
      prospects: [],
      fetchById,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/not found/i);
  });
});
