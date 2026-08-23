import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { isAccountResearchV1Scope } from '@/lib/accountResearch/constants';
import { jsonAccountResearch, snapshotPayload } from '@/lib/accountResearch/http';
import { startOrReuseAccountResearch } from '@/lib/accountResearch/orchestrate';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonAccountResearch({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const retailerId = Number(record.retailerId);
  const scope = record.scope;

  if (!Number.isInteger(retailerId) || retailerId <= 0) {
    return jsonAccountResearch({ ok: false, error: 'retailerId is required' }, 400);
  }
  if (!isAccountResearchV1Scope(scope)) {
    return jsonAccountResearch(
      {
        ok: false,
        error: 'scope must be one of all, website, shopify, instagram, facebook, tiktok, pinterest',
      },
      400,
    );
  }

  let forceRefresh = false;
  if (record.forceRefresh !== undefined) {
    if (record.forceRefresh === true) {
      forceRefresh = true;
    } else if (record.forceRefresh === false) {
      forceRefresh = false;
    } else {
      return jsonAccountResearch({ ok: false, error: 'forceRefresh must be a boolean' }, 400);
    }
  }

  const result = await startOrReuseAccountResearch({
    supabase: auth.supabase,
    userId: auth.userId,
    retailerId,
    scope,
    forceRefresh,
    trigger: 'manual',
  });

  if (!result.ok) {
    return jsonAccountResearch(
      { ok: false, outcome: result.outcome, error: result.error },
      result.status,
    );
  }

  return jsonAccountResearch({
    ok: true,
    outcome: result.outcome,
    ...snapshotPayload(result.snapshot),
  });
};
