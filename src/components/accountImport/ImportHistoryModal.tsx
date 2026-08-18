import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  ImportCommitReport,
  ImportCountChips,
} from '@/components/accountImport/ImportCommitReport';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { ACCOUNT_IMPORT_SOURCE_OPTIONS } from '@/lib/accountImport/classification';
import {
  getAccountImportBatchClient,
  listAccountImportBatchesClient,
} from '@/lib/accountImport/client';
import { commitReportToPreviewCounts } from '@/lib/accountImport/commitReportView';
import type {
  ImportHistoryBatchDetail,
  ImportHistoryBatchListItem,
} from '@/lib/accountImport/history';
import { assertImportLineAllowed } from '@/lib/accountImport/lineGate';
import { fetchRepresentedLines, type LinePortfolio } from '@/lib/lines';
import { useOptionalLineContext } from '@/lib/lineContext';
import type { AccountImportSourceType } from '@/types/database';

interface ImportHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

function sourceLabel(sourceType: AccountImportSourceType): string {
  return ACCOUNT_IMPORT_SOURCE_OPTIONS.find((opt) => opt.value === sourceType)?.label ?? sourceType;
}

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ImportHistoryModal({ open, onClose }: ImportHistoryModalProps) {
  const lineCtx = useOptionalLineContext();
  const [lines, setLines] = useState<LinePortfolio[]>([]);
  const [salesLineId, setSalesLineId] = useState('');
  const [batches, setBatches] = useState<ImportHistoryBatchListItem[]>([]);
  const [detail, setDetail] = useState<ImportHistoryBatchDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetchRepresentedLines().then((result) => {
      if (!active) return;
      const allowed = result.data.filter((line) => assertImportLineAllowed(line).ok);
      setLines(allowed);
      const current = allowed.find((line) => line.id === lineCtx.salesLineId);
      const fallback = allowed.find((line) => line.code === 'ogr') ?? allowed[0];
      setBusy(true);
      setDetail(null);
      setError(null);
      setSalesLineId((current ?? fallback)?.id ?? '');
    });
    return () => {
      active = false;
    };
  }, [open, lineCtx.salesLineId]);

  useEffect(() => {
    if (!open || !salesLineId) return;
    let active = true;
    void listAccountImportBatchesClient({ salesLineId }).then((result) => {
      if (!active) return;
      setBusy(false);
      if (!result.ok) {
        setBatches([]);
        setError(result.error);
        return;
      }
      setError(null);
      setBatches(result.batches);
    });
    return () => {
      active = false;
    };
  }, [open, salesLineId]);

  if (!open) return null;

  function handleClose() {
    setDetail(null);
    setError(null);
    setBusy(true);
    onClose();
  }

  async function openDetail(batchId: string) {
    setBusy(true);
    setError(null);
    const result = await getAccountImportBatchClient({ salesLineId, batchId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDetail(result.batch);
  }

  return (
    <DialogBackdrop open={open} onClose={handleClose} panelClassName="max-w-[960px]">
      <div className="gap-3.1 bg-surface p-4.1 flex max-h-[90vh] flex-col overflow-auto rounded-xl shadow-lg">
        <div className="flex items-center justify-between">
          <DialogTitle>Import history</DialogTitle>
          <Button type="button" variant="icon" aria-label="Close" onClick={handleClose}>
            <X strokeWidth={2.75} className="h-5 w-5" />
          </Button>
        </div>

        {detail ? null : (
          <Field>
            <FieldLabel>Sales line</FieldLabel>
            <Select
              id="import-history-line"
              value={salesLineId}
              onChange={(e) => {
                setSalesLineId(e.target.value);
                setBusy(true);
                setDetail(null);
                setError(null);
              }}
            >
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {busy && !detail ? <p className="m-0 text-sm">Loading import history…</p> : null}

        {detail ? (
          <>
            <p className="text-ink/70 m-0 text-sm">
              {detail.sourceFilename} · {sourceLabel(detail.sourceType)} · {detail.status} ·{' '}
              {formatCreatedAt(detail.createdAt)}
            </p>
            {detail.status === 'previewed' ? (
              <p className="text-ink/70 m-0 text-sm">
                This batch is still previewed. Re-upload the same file in Import accounts to resume.
                Resume by batch id is not available.
              </p>
            ) : null}
            <ImportCommitReport report={detail.report} rows={detail.rows} />
            <p className="m-0 text-sm">
              <a className="text-accent" href="/app?tab=accounts&reactivation=1&territory=ALL">
                View reactivation candidates
              </a>
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setDetail(null)}>
                Back
              </Button>
            </div>
          </>
        ) : (
          <>
            {batches.length === 0 && !busy ? (
              <p className="text-ink/60 m-0 text-sm">No import batches yet.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {batches.map((batch) => (
                  <li key={batch.id} className="border-ink/10 border-b py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-semibold">{batch.sourceFilename}</span>
                        <span className="text-ink/70 text-xs">
                          {sourceLabel(batch.sourceType)} · {formatCreatedAt(batch.createdAt)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Tag variant="outline">{batch.status}</Tag>
                          {batch.report ? (
                            <ImportCountChips counts={commitReportToPreviewCounts(batch.report)} />
                          ) : null}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs whitespace-nowrap"
                        onClick={() => void openDetail(batch.id)}
                      >
                        Open report
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </DialogBackdrop>
  );
}
