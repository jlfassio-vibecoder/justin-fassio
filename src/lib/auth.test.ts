import { describe, expect, it } from 'vitest';
import { isApprovedOwner, isApprovedStaff } from '@/lib/auth';
import type { Profile } from '@/types/database';

function profile(partial: Partial<Profile>): Profile {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'test@example.com',
    display_name: 'Test',
    role: 'rep',
    status: 'pending',
    prospect_id: null,
    wholesale_pricing_unlocked: false,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...partial,
  };
}

describe('isApprovedStaff / isApprovedOwner', () => {
  it('treats approved owner and rep as staff', () => {
    expect(isApprovedStaff(profile({ role: 'owner', status: 'approved' }))).toBe(true);
    expect(isApprovedStaff(profile({ role: 'rep', status: 'approved' }))).toBe(true);
  });

  it('rejects pending and buyers', () => {
    expect(isApprovedStaff(profile({ role: 'rep', status: 'pending' }))).toBe(false);
    expect(isApprovedStaff(profile({ role: 'buyer', status: 'approved' }))).toBe(false);
    expect(isApprovedStaff(null)).toBe(false);
  });

  it('isApprovedOwner only for approved owners', () => {
    expect(isApprovedOwner(profile({ role: 'owner', status: 'approved' }))).toBe(true);
    expect(isApprovedOwner(profile({ role: 'rep', status: 'approved' }))).toBe(false);
    expect(isApprovedOwner(profile({ role: 'owner', status: 'pending' }))).toBe(false);
  });
});
