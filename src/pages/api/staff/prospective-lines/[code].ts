import type { APIRoute } from 'astro';
import {
  deleteProspectiveLine,
  getProspectiveLineByCode,
  jsonProspective,
  listProspectiveTargets,
  parseAcquisitionStage,
  requireProspectiveLinesOwnerApi,
  updateProspectiveLine,
} from '@/lib/prospectiveLines';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  const existing = await getProspectiveLineByCode(gate.supabase, code);
  if (existing.error) return jsonProspective({ ok: false, error: existing.error }, 400);
  if (!existing.data) return jsonProspective({ ok: false, error: 'Line not found' }, 404);

  const targets = await listProspectiveTargets(gate.supabase, existing.data.id);
  if (targets.error) return jsonProspective({ ok: false, error: targets.error }, 400);
  return jsonProspective({ ok: true, line: existing.data, targets: targets.data });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonProspective({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const acquisitionStage =
    body.acquisitionStage === undefined ? undefined : parseAcquisitionStage(body.acquisitionStage);
  if (body.acquisitionStage !== undefined && acquisitionStage == null) {
    return jsonProspective({ ok: false, error: 'Invalid acquisition_stage' }, 400);
  }

  const result = await updateProspectiveLine(gate.supabase, code, {
    name: typeof body.name === 'string' ? body.name : undefined,
    acquisitionStage: acquisitionStage ?? undefined,
    legalName:
      typeof body.legalName === 'string' || body.legalName === null ? body.legalName : undefined,
    icp: typeof body.icp === 'string' ? body.icp : undefined,
    researchNotes: typeof body.researchNotes === 'string' ? body.researchNotes : undefined,
    geoInterest: typeof body.geoInterest === 'string' ? body.geoInterest : undefined,
  });
  if (result.error || !result.data) {
    return jsonProspective(
      { ok: false, error: result.error ?? 'Could not update line' },
      result.status ?? 400,
    );
  }
  return jsonProspective({ ok: true, line: result.data });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  const result = await deleteProspectiveLine(gate.supabase, code);
  if (!result.ok) return jsonProspective({ ok: false, error: result.error }, result.status);
  return jsonProspective({ ok: true });
};
