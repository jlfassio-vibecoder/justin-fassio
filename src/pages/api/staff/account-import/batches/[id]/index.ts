import type { APIRoute } from 'astro';
import { getImportHistoryBatch } from '@/lib/accountImport/history';
import { jsonAccountImport, requireAccountImportBatch } from '@/lib/accountImport/http';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const gate = await requireAccountImportBatch(
    request,
    params,
    new URL(request.url).searchParams.get('sales_line_id'),
  );
  if (!gate.ok) return gate.response;

  const result = await getImportHistoryBatch(gate.supabase, {
    salesLineId: gate.salesLineId,
    batchId: gate.batchId,
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);
  return jsonAccountImport({ ok: true, batch: result.batch });
};
