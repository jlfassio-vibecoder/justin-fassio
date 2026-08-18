import type { AgentSupabase } from '@/lib/agentAuth';
import {
  FINISHED_BATCH_STATUSES,
  loadFinishedCommitResult,
  type CommitReport,
  type CommittedImportRow,
} from '@/lib/accountImport/commit';
import type { AccountImportBatchStatus, AccountImportSourceType } from '@/types/database';

export const HISTORY_BATCH_STATUSES: readonly AccountImportBatchStatus[] = [
  'previewed',
  ...FINISHED_BATCH_STATUSES,
];

export type ImportHistoryBatchListItem = {
  id: string;
  sourceFilename: string;
  sourceType: AccountImportSourceType;
  status: AccountImportBatchStatus;
  report: CommitReport | null;
  createdAt: string;
};

export type ImportHistoryBatchDetail = ImportHistoryBatchListItem & {
  report: CommitReport;
  rows: CommittedImportRow[];
};

function isHistoryStatus(status: string): status is AccountImportBatchStatus {
  return (HISTORY_BATCH_STATUSES as readonly string[]).includes(status);
}

function reportFromUnknown(raw: unknown): CommitReport | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CommitReport;
}

export async function listImportHistoryBatches(
  supabase: AgentSupabase,
  salesLineId: string,
): Promise<{ ok: true; batches: ImportHistoryBatchListItem[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('account_import_batches')
    .select('id, source_filename, source_type, status, report, created_at')
    .eq('sales_line_id', salesLineId)
    .in('status', [...HISTORY_BATCH_STATUSES])
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    batches: (data ?? []).map((row) => ({
      id: row.id,
      sourceFilename: row.source_filename,
      sourceType: row.source_type,
      status: row.status,
      report: reportFromUnknown(row.report),
      createdAt: row.created_at,
    })),
  };
}

export async function getImportHistoryBatch(
  supabase: AgentSupabase,
  input: { salesLineId: string; batchId: string },
): Promise<
  { ok: true; batch: ImportHistoryBatchDetail } | { ok: false; error: string; status: number }
> {
  const { data: row, error } = await supabase
    .from('account_import_batches')
    .select('id, source_filename, source_type, status, report, created_at')
    .eq('id', input.batchId)
    .eq('sales_line_id', input.salesLineId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!row || row.status === 'cancelled' || !isHistoryStatus(row.status)) {
    return { ok: false, error: 'Batch not found', status: 404 };
  }
  const snapshot = await loadFinishedCommitResult(
    supabase,
    { id: row.id, report: row.report },
    reportFromUnknown(row.report)?.uploadedRows ?? 0,
  );
  return {
    ok: true,
    batch: {
      id: row.id,
      sourceFilename: row.source_filename,
      sourceType: row.source_type,
      status: row.status,
      report: snapshot.report,
      createdAt: row.created_at,
      rows: snapshot.rows,
    },
  };
}
