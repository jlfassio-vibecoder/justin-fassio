import { supabase } from '@/lib/supabase';
import type {
  ConfirmClassification,
  PreviewCounts,
  PreviewImportRow,
} from '@/lib/accountImport/types';
import type { CommitReport, CommittedImportRow } from '@/lib/accountImport/commit';
import type {
  ImportHistoryBatchDetail,
  ImportHistoryBatchListItem,
} from '@/lib/accountImport/history';
import type { AccountImportSourceType } from '@/types/database';

async function bearerHeaders(
  json = true,
): Promise<{ ok: true; headers: HeadersInit } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };
  return {
    ok: true,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
  };
}

export async function sha256FileHex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type ParseAccountImportResult =
  | {
      ok: true;
      filename: string;
      contentSha256: string;
      headers: string[];
      rows: Record<string, string>[];
      sheetName: string;
    }
  | { ok: false; error: string };

export async function parseAccountImportFile(input: {
  file: File;
  salesLineId: string;
}): Promise<ParseAccountImportResult> {
  const auth = await bearerHeaders(false);
  if (!auth.ok) return auth;
  const hash = await sha256FileHex(input.file);
  const form = new FormData();
  form.set('file', input.file);
  form.set('sales_line_id', input.salesLineId);
  form.set('content_sha256', hash);
  const res = await fetch('/api/staff/account-import/parse', {
    method: 'POST',
    headers: auth.headers,
    body: form,
  });
  const payload = (await res.json().catch(() => ({}))) as ParseAccountImportResult & {
    error?: string;
  };
  if (!res.ok || !payload.ok) {
    return { ok: false, error: payload.error || `Parse failed (${res.status})` };
  }
  return payload;
}

export async function previewAccountImportClient(input: {
  salesLineId: string;
  sourceType: AccountImportSourceType;
  contentSha256: string;
  uploadedRows: number;
  rows: unknown[];
}): Promise<
  | {
      ok: true;
      counts: PreviewCounts;
      rows: PreviewImportRow[];
      existingCommittedBatchId: string | null;
    }
  | { ok: false; error: string }
> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const res = await fetch('/api/staff/account-import/preview', {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify({
      sales_line_id: input.salesLineId,
      source_type: input.sourceType,
      content_sha256: input.contentSha256,
      uploaded_rows: input.uploadedRows,
      rows: input.rows,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    counts?: PreviewCounts;
    rows?: PreviewImportRow[];
    existingCommittedBatchId?: string | null;
  };
  if (!res.ok || !payload.ok || !payload.counts || !payload.rows) {
    return { ok: false, error: payload.error || `Preview failed (${res.status})` };
  }
  return {
    ok: true,
    counts: payload.counts,
    rows: payload.rows,
    existingCommittedBatchId: payload.existingCommittedBatchId ?? null,
  };
}

export async function commitAccountImportClient(input: {
  salesLineId: string;
  sourceType: AccountImportSourceType;
  filename: string;
  contentSha256: string;
  uploadedRows: number;
  classification: ConfirmClassification;
  rows: PreviewImportRow[];
}): Promise<
  | {
      ok: true;
      resumed: boolean;
      batchId: string;
      report: CommitReport;
      rows: CommittedImportRow[];
    }
  | { ok: false; error: string }
> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const res = await fetch('/api/staff/account-import/commit', {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify({
      sales_line_id: input.salesLineId,
      source_type: input.sourceType,
      filename: input.filename,
      content_sha256: input.contentSha256,
      uploaded_rows: input.uploadedRows,
      classification: input.classification,
      rows: input.rows,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    resumed?: boolean;
    batchId?: string;
    report?: CommitReport;
    rows?: CommittedImportRow[];
  };
  if (!res.ok || !payload.ok || !payload.report || !payload.rows || !payload.batchId) {
    return { ok: false, error: payload.error || `Commit failed (${res.status})` };
  }
  return {
    ok: true,
    resumed: Boolean(payload.resumed),
    batchId: payload.batchId,
    report: payload.report,
    rows: payload.rows,
  };
}

export async function listAccountImportBatchesClient(input: {
  salesLineId: string;
}): Promise<{ ok: true; batches: ImportHistoryBatchListItem[] } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const params = new URLSearchParams({ sales_line_id: input.salesLineId });
  const res = await fetch(`/api/staff/account-import/batches?${params.toString()}`, {
    headers: auth.headers,
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    batches?: ImportHistoryBatchListItem[];
  };
  if (!res.ok || !payload.ok || !payload.batches) {
    return { ok: false, error: payload.error || `History list failed (${res.status})` };
  }
  return { ok: true, batches: payload.batches };
}

export async function getAccountImportBatchClient(input: {
  salesLineId: string;
  batchId: string;
}): Promise<{ ok: true; batch: ImportHistoryBatchDetail } | { ok: false; error: string }> {
  const auth = await bearerHeaders();
  if (!auth.ok) return auth;
  const params = new URLSearchParams({ sales_line_id: input.salesLineId });
  const res = await fetch(
    `/api/staff/account-import/batches/${encodeURIComponent(input.batchId)}?${params.toString()}`,
    { headers: auth.headers },
  );
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    batch?: ImportHistoryBatchDetail;
  };
  if (!res.ok || !payload.ok || !payload.batch) {
    return { ok: false, error: payload.error || `History detail failed (${res.status})` };
  }
  return { ok: true, batch: payload.batch };
}
