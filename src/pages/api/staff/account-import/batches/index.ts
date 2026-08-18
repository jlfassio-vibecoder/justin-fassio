import type { APIRoute } from 'astro';
import { listImportHistoryBatches } from '@/lib/accountImport/history';
import {
  gateImportSalesLine,
  jsonAccountImport,
  requireAccountImportOwner,
} from '@/lib/accountImport/http';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireAccountImportOwner(request);
  if (!gate.ok) return gate.response;

  const salesLineIdRaw = new URL(request.url).searchParams.get('sales_line_id');
  const line = await gateImportSalesLine(gate.supabase, salesLineIdRaw);
  if (!line.ok) return line.response;

  const result = await listImportHistoryBatches(gate.supabase, line.salesLineId);
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, 500);
  return jsonAccountImport({ ok: true, batches: result.batches });
};
