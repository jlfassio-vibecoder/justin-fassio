import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  jsonError,
  jsonOk,
  rejectUnsupportedSendFields,
  requireDraftId,
  serializeAgentDraft,
} from '@/lib/ogrProductEmailDraftApi';
import { cancelAgentProductOutreachDraft } from '@/lib/systemMessages';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const id = requireDraftId(params.id);
  if (!id.ok) return jsonError(id.error, 400);

  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const unsupported = rejectUnsupportedSendFields(body);
      if (unsupported) return jsonError(unsupported, 400);
    } catch {
      return jsonError('Invalid JSON body', 400);
    }
  }

  const cancelled = await cancelAgentProductOutreachDraft(gate.supabase, id.value);
  if (!cancelled.ok) {
    const status =
      cancelled.error === 'Draft not found'
        ? 404
        : cancelled.error.includes('Only draft')
          ? 409
          : 400;
    return jsonError(cancelled.error, status);
  }

  return jsonOk({ draft: serializeAgentDraft(cancelled.draft) });
};
