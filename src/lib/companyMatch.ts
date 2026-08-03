import type { Prospect } from '@/lib/prospects';

/**
 * Find directory stores matching a company name.
 * Exact (case-insensitive) matches win; otherwise substring matches capped at 5.
 */
export function findCompanyMatches(companyName: string, prospects: Prospect[]): Prospect[] {
  const q = companyName.trim().toLowerCase();
  if (!q) return [];

  const exact = prospects.filter((p) => p.name.trim().toLowerCase() === q);
  if (exact.length > 0) return exact;

  return prospects.filter((p) => p.name.trim().toLowerCase().includes(q)).slice(0, 5);
}
