import type { APIRoute } from 'astro';
import { commitAccountImport } from '@/lib/accountImport/commit';
import {
  jsonAccountImport,
  parseSourceType,
  requireAccountImportOwner,
} from '@/lib/accountImport/http';
import type { PreviewImportRow } from '@/lib/accountImport/types';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireAccountImportOwner(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonAccountImport({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const sourceType = parseSourceType(body.source_type);
  if (!sourceType) return jsonAccountImport({ ok: false, error: 'Invalid source type' }, 400);
  if (!Array.isArray(body.rows)) {
    return jsonAccountImport({ ok: false, error: 'rows is required' }, 400);
  }

  const result = await commitAccountImport(gate.supabase, gate.userId, {
    salesLineId: body.sales_line_id,
    sourceType,
    filename: typeof body.filename === 'string' ? body.filename : '',
    contentSha256: typeof body.content_sha256 === 'string' ? body.content_sha256 : '',
    uploadedRows: typeof body.uploaded_rows === 'number' ? body.uploaded_rows : body.rows.length,
    cancelRequested: body.cancel === true,
    classification: body.classification,
    rows: body.rows as PreviewImportRow[],
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);

  return jsonAccountImport({
    ok: true,
    resumed: result.resumed,
    batchId: result.batchId,
    report: result.report,
    rows: result.rows,
  });
};
