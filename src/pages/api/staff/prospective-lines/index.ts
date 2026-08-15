import type { APIRoute } from 'astro';
import {
  countProspectiveLines,
  createProspectiveLine,
  jsonProspective,
  listProspectiveLines,
  parseAcquisitionStage,
  requireProspectiveLinesOwnerApi,
  warnedAtSoftCap,
} from '@/lib/prospectiveLines';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const result = await listProspectiveLines(gate.supabase);
  if (result.error) return jsonProspective({ ok: false, error: result.error }, 400);
  return jsonProspective({
    ok: true,
    lines: result.data,
    warned: warnedAtSoftCap(result.data.length),
  });
};

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonProspective({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name : '';
  const code = typeof body.code === 'string' ? body.code : undefined;
  const legalName = typeof body.legalName === 'string' ? body.legalName : null;
  const acquisitionStage =
    body.acquisitionStage === undefined ? undefined : parseAcquisitionStage(body.acquisitionStage);

  if (body.acquisitionStage !== undefined && acquisitionStage == null) {
    return jsonProspective({ ok: false, error: 'acquisition_stage is required' }, 400);
  }

  const result = await createProspectiveLine(gate.supabase, {
    name,
    code,
    acquisitionStage,
    legalName,
  });
  if (result.error || !result.data) {
    return jsonProspective(
      { ok: false, error: result.error ?? 'Could not create line', warned: result.warned },
      result.status ?? 400,
    );
  }
  const counted = await countProspectiveLines(gate.supabase);
  return jsonProspective(
    {
      ok: true,
      line: result.data,
      warned: result.warned || warnedAtSoftCap(counted.count),
    },
    201,
  );
};
