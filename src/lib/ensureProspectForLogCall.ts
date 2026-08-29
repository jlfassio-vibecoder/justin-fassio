/**
 * Ensure a prospect is available for Log Call (directory miss → fetch by id).
 */

import { fetchProspectById } from '@/lib/messages';
import type { Prospect } from '@/lib/prospects';

export type EnsureProspectForLogCallResult =
  | { ok: true; prospect: Prospect; alreadyPresent: boolean }
  | { ok: false; error: string };

export async function ensureProspectForLogCall(params: {
  prospectId: number;
  prospects: readonly Prospect[];
  fetchById?: (id: number) => Promise<{ data: Prospect | null; error: string | null }>;
}): Promise<EnsureProspectForLogCallResult> {
  const existing = params.prospects.find((p) => p.id === params.prospectId);
  if (existing) {
    return { ok: true, prospect: existing, alreadyPresent: true };
  }

  const fetchById = params.fetchById ?? fetchProspectById;
  const result = await fetchById(params.prospectId);
  if (result.error) {
    return { ok: false, error: result.error };
  }
  if (!result.data) {
    return { ok: false, error: 'Store not found. Refresh Accounts or try again.' };
  }
  return { ok: true, prospect: result.data, alreadyPresent: false };
}
