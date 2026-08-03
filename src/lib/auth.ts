import type { Profile } from '@/types/database';

export function isApprovedStaff(profile: Profile | null | undefined): boolean {
  return (
    !!profile &&
    profile.status === 'approved' &&
    (profile.role === 'owner' || profile.role === 'rep')
  );
}

export function isApprovedOwner(profile: Profile | null | undefined): boolean {
  return !!profile && profile.status === 'approved' && profile.role === 'owner';
}
