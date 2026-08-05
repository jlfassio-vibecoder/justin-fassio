import { describe, expect, it, vi, beforeEach } from 'vitest';

const updateMock = vi.fn();
const eqMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: updateMock,
    })),
  },
}));

import { confirmThreadMapping, fingerprintFromPayload } from '@/lib/messages';

describe('confirmThreadMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });
  });

  it('updates prospect_id, mapping_status, and confirmed_fingerprint', async () => {
    const result = await confirmThreadMapping({
      threadId: 'thread-1',
      prospectId: 42,
      confirmedFingerprint: 'sam@example.com|store|buyer',
    });
    expect(result).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith({
      prospect_id: 42,
      mapping_status: 'confirmed',
      confirmed_fingerprint: 'sam@example.com|store|buyer',
    });
    expect(eqMock).toHaveBeenCalledWith('id', 'thread-1');
  });
});

describe('fingerprintFromPayload', () => {
  it('returns null when identity fields are missing', () => {
    expect(fingerprintFromPayload({})).toBeNull();
  });

  it('builds fingerprint from payload identity fields', () => {
    expect(
      fingerprintFromPayload({
        email: 'a@b.com',
        businessName: 'Store',
        buyerName: 'Pat',
      }),
    ).toBe('a@b.com|store|pat');
  });
});
