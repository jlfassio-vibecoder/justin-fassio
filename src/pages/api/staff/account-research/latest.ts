import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { isAccountResearchV1Scope } from '@/lib/accountResearch/constants';
import { jsonAccountResearch, snapshotPayload } from '@/lib/accountResearch/http';
import { loadSourceLocks } from '@/lib/accountResearch/locks';
import { findLatestAccountResearch } from '@/lib/accountResearch/orchestrate';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const retailerId = Number(url.searchParams.get('retailerId'));
  const scope = url.searchParams.get('scope') ?? 'all';

  if (!Number.isInteger(retailerId) || retailerId <= 0) {
    return jsonAccountResearch({ ok: false, error: 'retailerId is required' }, 400);
  }
  if (!isAccountResearchV1Scope(scope)) {
    return jsonAccountResearch({ ok: false, error: 'Invalid scope' }, 400);
  }

  const snapshot = await findLatestAccountResearch(auth.supabase, retailerId, scope);
  if (!snapshot) {
    const locksBySourceType = await loadSourceLocks(auth.supabase, retailerId);
    return jsonAccountResearch({ ok: true, outcome: 'none', run: null, locksBySourceType }, 200);
  }

  return jsonAccountResearch({
    ok: true,
    outcome: 'found',
    ...snapshotPayload(snapshot),
  });
};
