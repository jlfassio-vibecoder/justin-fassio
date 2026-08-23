import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { createAccountProductMatch } from '@/lib/accountProductMatch';
import { jsonAccountProductMatch } from '@/lib/accountProductMatch/http';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonAccountProductMatch({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const retailerId = Number(record.retailerId);
  const salesLineId = typeof record.salesLineId === 'string' ? record.salesLineId.trim() : '';
  const researchRunId = typeof record.researchRunId === 'string' ? record.researchRunId.trim() : '';

  if (!Number.isInteger(retailerId) || retailerId <= 0) {
    return jsonAccountProductMatch({ ok: false, error: 'retailerId is required' }, 400);
  }
  if (!salesLineId || !isUuid(salesLineId)) {
    return jsonAccountProductMatch({ ok: false, error: 'salesLineId must be a valid UUID' }, 400);
  }
  if (!researchRunId || !isUuid(researchRunId)) {
    return jsonAccountProductMatch({ ok: false, error: 'researchRunId must be a valid UUID' }, 400);
  }

  let ignoreRecentSendDedup = false;
  if (record.ignoreRecentSendDedup !== undefined) {
    if (record.ignoreRecentSendDedup === true) ignoreRecentSendDedup = true;
    else if (record.ignoreRecentSendDedup === false) ignoreRecentSendDedup = false;
    else {
      return jsonAccountProductMatch(
        { ok: false, error: 'ignoreRecentSendDedup must be a boolean' },
        400,
      );
    }
  }

  const result = await createAccountProductMatch({
    supabase: auth.supabase,
    retailerId,
    salesLineId,
    researchRunId,
    ignoreRecentSendDedup,
  });

  if (!result.ok) {
    return jsonAccountProductMatch(
      {
        ok: false,
        outcome: result.outcome,
        error: result.error,
        run: result.run ?? null,
      },
      result.status,
    );
  }

  if (result.outcome === 'empty') {
    const status =
      result.empty_reason === 'identity_unresolved' ||
      result.empty_reason === 'no_accepted_evidence'
        ? 409
        : 200;
    return jsonAccountProductMatch(
      {
        ok: true,
        outcome: 'empty',
        empty_reason: result.empty_reason,
        run: result.run,
        items: [],
      },
      status,
    );
  }

  return jsonAccountProductMatch({
    ok: true,
    outcome: 'matched',
    run: result.run,
    items: result.items,
  });
};
