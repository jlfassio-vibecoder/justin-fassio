import type { AccountContactRole } from '@/types/database';

/** Map a verified job title string to account_contacts.role. */
export function mapContactRole(roleText: string | null | undefined): AccountContactRole {
  const r = (roleText ?? '').toLowerCase();
  if (r.includes('owner') || r.includes('founder') || r.includes('president')) return 'owner';
  if (r.includes('buyer') || r.includes('purchasing')) return 'buyer';
  if (r.includes('manager') || r.includes('gm') || r.includes('general manager')) return 'manager';
  return 'buyer';
}
