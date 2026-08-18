import type { APIRoute } from 'astro';
import {
  jsonAccountImport,
  parseSourceType,
  requireAccountImportOwner,
} from '@/lib/accountImport/http';
import { previewAccountImport } from '@/lib/accountImport/preview';
import type { CollapsedImportRow } from '@/lib/accountImport/types';

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

  const result = await previewAccountImport(gate.supabase, {
    salesLineId: body.sales_line_id,
    sourceType,
    contentSha256: typeof body.content_sha256 === 'string' ? body.content_sha256 : null,
    uploadedRows: typeof body.uploaded_rows === 'number' ? body.uploaded_rows : body.rows.length,
    rows: body.rows as CollapsedImportRow[],
  });
  if (!result.ok) return jsonAccountImport({ ok: false, error: result.error }, result.status);

  return jsonAccountImport({
    ok: true,
    counts: result.counts,
    rows: result.rows,
    existingCommittedBatchId: result.existingCommittedBatchId,
  });
};
