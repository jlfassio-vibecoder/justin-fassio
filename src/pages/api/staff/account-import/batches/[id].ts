import type { APIRoute } from 'astro';
import { getImportHistoryBatch } from '@/lib/accountImport/history';
import {
  gateImportSalesLine,
  jsonAccountImport,
  requireAccountImportOwner,
} from '@/lib/accountImport/http';
import { isUuid } from '@/lib/resolveSalesLineQuery';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const gate = await requireAccountImportOwner(request);
  if (!gate.ok) return gate.response;

  const batchId = typeof params.id === 'string' ? params.id.trim() : '';
  if (!batchId || !isUuid(batchId)) {
    return jsonAccountImport({ ok: false, error: 'Invalid batch id' }, 400);
  }

  const salesLineIdRaw = new URL(request.url).searchParams.get('sales_line_id');
  const line = await gateImportSalesLine(gate.supabase, salesLineIdRaw);
  if (!line.ok) return line.response;

  const result = await getImportHistoryBatch(gate.supabase, {
    salesLineId: line.salesLineId,
    batchId,
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);
  return jsonAccountImport({ ok: true, batch: result.batch });
};
