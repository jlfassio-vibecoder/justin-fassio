import type { APIRoute } from 'astro';
import {
  createProspectiveTarget,
  getProspectiveLineByCode,
  jsonProspective,
  listProspectiveTargets,
  parseTargetStatus,
  requireProspectiveLinesOwnerApi,
} from '@/lib/prospectiveLines';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  const existing = await getProspectiveLineByCode(gate.supabase, code);
  if (existing.error) return jsonProspective({ ok: false, error: existing.error }, 400);
  if (!existing.data) return jsonProspective({ ok: false, error: 'Line not found' }, 404);

  const result = await listProspectiveTargets(gate.supabase, existing.data.id);
  if (result.error) return jsonProspective({ ok: false, error: result.error }, 400);
  return jsonProspective({ ok: true, targets: result.data });
};

export const POST: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  const existing = await getProspectiveLineByCode(gate.supabase, code);
  if (existing.error) return jsonProspective({ ok: false, error: existing.error }, 400);
  if (!existing.data) return jsonProspective({ ok: false, error: 'Line not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonProspective({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const retailerId =
    typeof body.retailerId === 'number'
      ? body.retailerId
      : typeof body.retailerId === 'string'
        ? Number(body.retailerId)
        : NaN;
  const status = body.status === undefined ? undefined : parseTargetStatus(body.status);
  if (body.status !== undefined && status == null) {
    return jsonProspective({ ok: false, error: 'Invalid target status' }, 400);
  }

  const result = await createProspectiveTarget(gate.supabase, {
    salesLineId: existing.data.id,
    retailerId,
    interest: typeof body.interest === 'string' ? body.interest : null,
    fitNotes: typeof body.fitNotes === 'string' ? body.fitNotes : null,
    suggestedGeo: typeof body.suggestedGeo === 'string' ? body.suggestedGeo : null,
    status: status ?? undefined,
  });
  if (result.error || !result.data) {
    return jsonProspective(
      { ok: false, error: result.error ?? 'Could not create target' },
      result.status ?? 400,
    );
  }
  return jsonProspective({ ok: true, target: result.data }, 201);
};
