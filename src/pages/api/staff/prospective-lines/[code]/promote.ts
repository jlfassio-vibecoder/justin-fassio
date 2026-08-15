import type { APIRoute } from 'astro';
import {
  jsonProspective,
  parsePromoteStatus,
  promoteProspectiveLine,
  requireProspectiveLinesOwnerApi,
} from '@/lib/prospectiveLines';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const gate = await requireProspectiveLinesOwnerApi(request);
  if (!gate.ok) return gate.response;

  const code = typeof params.code === 'string' ? params.code : '';
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonProspective({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const nextStatus = parsePromoteStatus(body.status);
  if (!nextStatus) {
    return jsonProspective(
      { ok: false, error: 'status must be confirmed, onboarding, or declined' },
      400,
    );
  }

  const result = await promoteProspectiveLine(gate.supabase, code, nextStatus);
  if (result.error || !result.data) {
    return jsonProspective(
      { ok: false, error: result.error ?? 'Could not update status' },
      result.status ?? 400,
    );
  }
  return jsonProspective({ ok: true, line: result.data });
};
