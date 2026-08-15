import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { assignRetailerLineTerritory } from '@/lib/salesLineTerritories';
import { isLineTerritoryAdminEnabled } from '@/lib/staffFeatures';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;
  if (!isLineTerritoryAdminEnabled()) {
    return json({ ok: false, error: 'Territory admin is not enabled' }, 403);
  }

  const retailerLineAccountId = params.id?.trim() ?? '';
  if (!retailerLineAccountId) {
    return json({ ok: false, error: 'Line account id is required' }, 400);
  }

  let body: { salesLineTerritoryId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const raw = body.salesLineTerritoryId;
  const salesLineTerritoryId =
    raw === null || raw === '' ? null : typeof raw === 'string' ? raw.trim() : null;
  if (raw !== null && raw !== '' && !salesLineTerritoryId) {
    return json({ ok: false, error: 'salesLineTerritoryId must be a UUID or null' }, 400);
  }

  const result = await assignRetailerLineTerritory(gate.supabase, {
    retailerLineAccountId,
    salesLineTerritoryId,
    actorId: gate.userId,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true });
};
