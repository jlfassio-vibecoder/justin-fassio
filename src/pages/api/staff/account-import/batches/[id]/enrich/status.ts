import type { APIRoute } from 'astro';
import { getEnrichmentSnapshot } from '@/lib/accountImport/enrich';
import { jsonAccountImport, requireAccountImportBatch } from '@/lib/accountImport/http';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const gate = await requireAccountImportBatch(
    request,
    params,
    new URL(request.url).searchParams.get('sales_line_id'),
  );
  if (!gate.ok) return gate.response;

  const result = await getEnrichmentSnapshot(gate.supabase, {
    salesLineId: gate.salesLineId,
    batchId: gate.batchId,
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);
  return jsonAccountImport({ ok: true, snapshot: result.snapshot });
};
