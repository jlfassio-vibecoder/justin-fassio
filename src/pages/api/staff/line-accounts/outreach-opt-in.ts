import type { APIRoute } from 'astro';
import { requireApprovedOwnerClient } from '@/lib/agentAuth';
import { gateImportSalesLine, jsonAccountImport } from '@/lib/accountImport/http';
import { setOutreachEligible } from '@/lib/setOutreachEligible';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const owner = await requireApprovedOwnerClient(request);
  if (!owner.ok) return owner.response;

  let body: { sales_line_id?: unknown; retailer_id?: unknown; eligible?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonAccountImport({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  let salesLineId: string;
  if (typeof body.sales_line_id === 'string' && body.sales_line_id.trim()) {
    const line = await gateImportSalesLine(owner.supabase, body.sales_line_id);
    if (!line.ok) return line.response;
    salesLineId = line.salesLineId;
  } else {
    const { data: ogr, error: ogrError } = await owner.supabase
      .from('lines')
      .select('id')
      .eq('code', 'ogr')
      .maybeSingle();
    if (ogrError) return jsonAccountImport({ ok: false, error: ogrError.message }, 500);
    if (!ogr) return jsonAccountImport({ ok: false, error: 'OGR sales line not found' }, 400);
    salesLineId = ogr.id;
  }

  const retailerId =
    typeof body.retailer_id === 'number'
      ? body.retailer_id
      : typeof body.retailer_id === 'string'
        ? Number(body.retailer_id)
        : NaN;
  if (!Number.isFinite(retailerId) || retailerId <= 0) {
    return jsonAccountImport({ ok: false, error: 'retailer_id is required' }, 400);
  }
  if (typeof body.eligible !== 'boolean') {
    return jsonAccountImport({ ok: false, error: 'eligible must be a boolean' }, 400);
  }

  const result = await setOutreachEligible(owner.supabase, {
    salesLineId,
    retailerId,
    eligible: body.eligible,
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);
  return jsonAccountImport({ ok: true, markers: result.markers });
};
