import type { APIRoute } from 'astro';
import {
  deleteProspectiveTarget,
  getProspectiveLineByCode,
  jsonProspective,
  parseTargetStatus,
  requireProspectiveLinesOwnerApi,
  updateProspectiveTarget,
} from '@/lib/prospectiveLines';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  const targetId = typeof params.id === 'string' ? params.id : '';
  const existing = await getProspectiveLineByCode(gate.supabase, code);
  if (existing.error) return jsonProspective({ ok: false, error: existing.error }, 400);
  if (!existing.data) return jsonProspective({ ok: false, error: 'Line not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonProspective({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const status = body.status === undefined ? undefined : parseTargetStatus(body.status);
  if (body.status !== undefined && status == null) {
    return jsonProspective({ ok: false, error: 'Invalid target status' }, 400);
  }

  const result = await updateProspectiveTarget(gate.supabase, {
    salesLineId: existing.data.id,
    targetId,
    interest:
      typeof body.interest === 'string' || body.interest === null ? body.interest : undefined,
    fitNotes:
      typeof body.fitNotes === 'string' || body.fitNotes === null ? body.fitNotes : undefined,
    suggestedGeo:
      typeof body.suggestedGeo === 'string' || body.suggestedGeo === null
        ? body.suggestedGeo
        : undefined,
    status: status ?? undefined,
  });
  if (result.error || !result.data) {
    return jsonProspective(
      { ok: false, error: result.error ?? 'Could not update target' },
      result.status ?? 400,
    );
  }
  return jsonProspective({ ok: true, target: result.data });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  const targetId = typeof params.id === 'string' ? params.id : '';
  const existing = await getProspectiveLineByCode(gate.supabase, code);
  if (existing.error) return jsonProspective({ ok: false, error: existing.error }, 400);
  if (!existing.data) return jsonProspective({ ok: false, error: 'Line not found' }, 404);

  const result = await deleteProspectiveTarget(gate.supabase, {
    salesLineId: existing.data.id,
    targetId,
  });
  if (!result.ok) return jsonProspective({ ok: false, error: result.error }, result.status);
  return jsonProspective({ ok: true });
};
