import type { APIRoute } from 'astro';
import {
  gateImportSalesLine,
  jsonAccountImport,
  parseUploadedWorkbook,
  requireAccountImportOwner,
} from '@/lib/accountImport/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireAccountImportOwner(request);
  if (!gate.ok) return gate.response;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonAccountImport({ ok: false, error: 'Expected multipart form data' }, 400);
  }

  const form = await request.formData();
  const file = form.get('file');
  const salesLineId = form.get('sales_line_id');
  const clientHash = form.get('content_sha256');

  if (!(file instanceof File)) {
    return jsonAccountImport({ ok: false, error: 'File is required' }, 400);
  }

  const line = await gateImportSalesLine(gate.supabase, salesLineId);
  if (!line.ok) return line.response;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseUploadedWorkbook({
    bytes,
    filename: file.name,
    clientSha256: typeof clientHash === 'string' ? clientHash : null,
  });
  if (!parsed.ok) return jsonAccountImport({ ok: false, error: parsed.error }, 400);

  return jsonAccountImport({
    ok: true,
    salesLineId: line.salesLineId,
    filename: file.name,
    contentSha256: parsed.contentSha256,
    headers: parsed.workbook.headers,
    rows: parsed.workbook.rows,
    sheetName: parsed.workbook.sheetName,
  });
};
