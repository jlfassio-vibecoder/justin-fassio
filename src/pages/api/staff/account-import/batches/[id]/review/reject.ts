import type { APIRoute } from 'astro';
import {
  jsonAccountImport,
  parseChangeIds,
  requireAccountImportBatch,
} from '@/lib/accountImport/http';
import { rejectBatchReviewChanges } from '@/lib/accountImport/review';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonAccountImport({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const gate = await requireAccountImportBatch(request, params, body.sales_line_id);
  if (!gate.ok) return gate.response;
  const changeIds = parseChangeIds(body.change_ids);
  if (!changeIds) {
    return jsonAccountImport({ ok: false, error: 'No field changes selected' }, 400);
  }

  const result = await rejectBatchReviewChanges(gate.supabase, {
    salesLineId: gate.salesLineId,
    batchId: gate.batchId,
    changeIds,
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);
  return jsonAccountImport({
    ok: true,
    review: result.review,
    conflicts: result.conflicts,
  });
};
