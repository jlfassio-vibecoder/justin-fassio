import type { APIRoute } from 'astro';
import { cancelRemainingEnrichment } from '@/lib/accountImport/enrich';
import { jsonAccountImport, requireAccountImportBatch } from '@/lib/accountImport/http';

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

  const result = await cancelRemainingEnrichment(gate.supabase, {
    salesLineId: gate.salesLineId,
    batchId: gate.batchId,
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);
  return jsonAccountImport({ ok: true, snapshot: result.snapshot });
};
