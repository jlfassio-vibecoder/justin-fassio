import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { EnrichmentProgress } from '@/components/accountImport/EnrichmentProgress';
import {
  ImportCommitReport,
  ImportCountChips,
} from '@/components/accountImport/ImportCommitReport';
import {
  ACCOUNT_IMPORT_SOURCE_OPTIONS,
  HISTORICAL_OGR_IMPORT_DEFAULTS,
} from '@/lib/accountImport/classification';
import {
  commitAccountImportClient,
  parseAccountImportFile,
  previewAccountImportClient,
  processAccountImportEnrichClient,
  startAccountImportEnrichClient,
  cancelAccountImportEnrichClient,
  retryAccountImportEnrichClient,
} from '@/lib/accountImport/client';
import { collapseInFileDuplicates } from '@/lib/accountImport/collapseDuplicates';
import { isBusinessNameMapped, proposeColumnMap } from '@/lib/accountImport/columnMap';
import type { CommitReport, CommittedImportRow } from '@/lib/accountImport/commit';
import { shouldAcceptImportCommit } from '@/lib/accountImport/confirmGuard';
import { assertImportLineAllowed } from '@/lib/accountImport/lineGate';
import { applyNormalizedEdits, normalizeWorkbookRows } from '@/lib/accountImport/normalize';
import type {
  AccountImportColumnMap,
  AccountImportTargetField,
  ConfirmClassification,
  PreviewCounts,
  PreviewImportRow,
} from '@/lib/accountImport/types';
import { RUNNING_JOB_POLL_MS, type EnrichmentSnapshot } from '@/lib/accountImport/enrichStatus';
import { ACCOUNT_IMPORT_TARGET_FIELDS } from '@/lib/accountImport/types';
import { fetchRepresentedLines, type LinePortfolio } from '@/lib/lines';
import { useOptionalLineContext } from '@/lib/lineContext';
import { STAFF_AI_ERRORS } from '@/lib/aiLineContext';
import type { AccountImportSourceType } from '@/types/database';

export type ImportWizardState =
  'select' | 'map' | 'normalize' | 'preview' | 'confirm' | 'importing' | 'imported' | 'enriching';

const FIELD_LABELS: Record<AccountImportTargetField, string> = {
  businessName: 'Business name',
  shipTo: 'Ship To / address',
  street: 'Street',
  city: 'City',
  state: 'State',
  postalCode: 'ZIP',
  formerRepCode: 'Former rep',
  storeType: 'Store type',
  contactName: 'Contact',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  externalId: 'External ID',
};

function defaultClassification(): ConfirmClassification {
  return {
    relationshipStatus: HISTORICAL_OGR_IMPORT_DEFAULTS.relationshipStatus,
    markers: [...HISTORICAL_OGR_IMPORT_DEFAULTS.markers],
    existingOgr: HISTORICAL_OGR_IMPORT_DEFAULTS.existingOgr,
    nextAction: null,
    runAiAfterImport: true,
  };
}

function sampleValues(rows: Record<string, string>[], header: string): string {
  return rows
    .map((row) => row[header]?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');
}

interface ImportAccountsModalProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function ImportAccountsModal({ open, onClose, onImported }: ImportAccountsModalProps) {
  const lineCtx = useOptionalLineContext();
  const [step, setStep] = useState<ImportWizardState>('select');
  const [lines, setLines] = useState<LinePortfolio[]>([]);
  const [salesLineId, setSalesLineId] = useState('');
  const [sourceType, setSourceType] = useState<AccountImportSourceType>('historical_customer');
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState('');
  const [contentSha256, setContentSha256] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<AccountImportColumnMap>({});
  const [normalized, setNormalized] = useState<ReturnType<typeof normalizeWorkbookRows>>([]);
  const [previewRows, setPreviewRows] = useState<PreviewImportRow[]>([]);
  const [counts, setCounts] = useState<PreviewCounts | null>(null);
  const [existingBatchId, setExistingBatchId] = useState<string | null>(null);
  const [classification, setClassification] =
    useState<ConfirmClassification>(defaultClassification);
  const [report, setReport] = useState<CommitReport | null>(null);
  const [committedRows, setCommittedRows] = useState<CommittedImportRow[]>([]);
  const [importedBatchId, setImportedBatchId] = useState<string | null>(null);
  const [enrichSnapshot, setEnrichSnapshot] = useState<EnrichmentSnapshot | null>(null);
  const [selectedRetailerIds, setSelectedRetailerIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commitInFlightRef = useRef(false);
  const pumpAbortRef = useRef(false);
  const [pumpToken, setPumpToken] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetchRepresentedLines().then((result) => {
      if (!active) return;
      const allowed = result.data.filter((line) => assertImportLineAllowed(line).ok);
      setLines(allowed);
      const current = allowed.find((line) => line.id === lineCtx.salesLineId);
      const fallback = allowed.find((line) => line.code === 'ogr') ?? allowed[0];
      setSalesLineId((current ?? fallback)?.id ?? '');
    });
    return () => {
      active = false;
    };
  }, [open, lineCtx.salesLineId]);

  const selectedLine = lines.find((line) => line.id === salesLineId) ?? null;
  const lineBlocked = selectedLine ? !assertImportLineAllowed(selectedLine).ok : !salesLineId;
  const sourceEnabled = ACCOUNT_IMPORT_SOURCE_OPTIONS.find((s) => s.value === sourceType)?.enabled;

  const uniqueNormalized = useMemo(
    () => collapseInFileDuplicates(normalized).filter((row) => row.inFileDuplicateOf == null),
    [normalized],
  );

  useEffect(() => {
    if (!open || step !== 'enriching' || !importedBatchId || !salesLineId) return;
    pumpAbortRef.current = false;
    let cancelled = false;
    async function pump() {
      while (!cancelled && !pumpAbortRef.current && importedBatchId) {
        const next = await processAccountImportEnrichClient({
          salesLineId,
          batchId: importedBatchId,
        });
        if (cancelled) return;
        if (!next.ok) {
          setError(next.error);
          return;
        }
        setEnrichSnapshot(next.snapshot);
        if (next.snapshot.pauseReason === 'rate_limit') return;
        if (next.snapshot.jobs.queued + next.snapshot.jobs.running === 0) return;
        if (next.snapshot.jobs.running > 0) {
          await new Promise((resolve) => setTimeout(resolve, RUNNING_JOB_POLL_MS));
        }
      }
    }
    void pump();
    return () => {
      cancelled = true;
      pumpAbortRef.current = true;
    };
  }, [open, step, importedBatchId, salesLineId, pumpToken]);

  if (!open) return null;

  function reset() {
    setStep('select');
    setFile(null);
    setFilename('');
    setContentSha256('');
    setHeaders([]);
    setRawRows([]);
    setColumnMap({});
    setNormalized([]);
    setPreviewRows([]);
    setCounts(null);
    setExistingBatchId(null);
    setClassification(defaultClassification());
    setReport(null);
    setCommittedRows([]);
    setImportedBatchId(null);
    setEnrichSnapshot(null);
    setSelectedRetailerIds(new Set());
    setBusy(false);
    commitInFlightRef.current = false;
    pumpAbortRef.current = true;
    setError(null);
  }

  function handleClose() {
    if (busy || step === 'importing') return;
    pumpAbortRef.current = true;
    reset();
    onClose();
  }

  async function handleParse() {
    if (!file || !salesLineId || !sourceEnabled) return;
    setBusy(true);
    setError(null);
    const result = await parseAccountImportFile({ file, salesLineId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFilename(result.filename);
    setContentSha256(result.contentSha256);
    setHeaders(result.headers);
    setRawRows(result.rows);
    setColumnMap(proposeColumnMap(result.headers));
    setStep('map');
  }

  function handleNormalize() {
    if (!isBusinessNameMapped(columnMap)) {
      setError('Business name must be mapped');
      return;
    }
    setError(null);
    setNormalized(normalizeWorkbookRows(rawRows, columnMap));
    setStep('normalize');
  }

  async function handlePreview() {
    setBusy(true);
    setError(null);
    const collapsed = collapseInFileDuplicates(normalized);
    const result = await previewAccountImportClient({
      salesLineId,
      sourceType,
      contentSha256,
      uploadedRows: rawRows.length,
      rows: collapsed,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreviewRows(result.rows);
    setCounts(result.counts);
    setExistingBatchId(result.existingCommittedBatchId);
    setStep('preview');
  }

  async function handleCommit() {
    if (!shouldAcceptImportCommit({ inFlight: commitInFlightRef.current, step })) return;
    commitInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setStep('importing');
    const result = await commitAccountImportClient({
      salesLineId,
      sourceType,
      filename,
      contentSha256,
      uploadedRows: rawRows.length,
      classification,
      rows: previewRows,
    });
    setBusy(false);
    if (!result.ok) {
      commitInFlightRef.current = false;
      setError(result.error);
      setStep('confirm');
      return;
    }
    setReport(result.report);
    setCommittedRows(result.rows);
    setImportedBatchId(result.batchId);
    setSelectedRetailerIds(
      new Set(result.rows.flatMap((row) => (row.retailerId ? [row.retailerId] : []))),
    );
    onImported?.();
    if (classification.runAiAfterImport === false) {
      setStep('imported');
      return;
    }
    const started = await startAccountImportEnrichClient({
      salesLineId,
      batchId: result.batchId,
    });
    if (!started.ok) {
      setError(started.error);
      setStep('imported');
      return;
    }
    setEnrichSnapshot(started.snapshot);
    setPumpToken((token) => token + 1);
    setStep('enriching');
  }

  async function startEnrich(retailerIds?: number[]) {
    if (!importedBatchId) return;
    setError(null);
    const started = await startAccountImportEnrichClient({
      salesLineId,
      batchId: importedBatchId,
      retailerIds,
    });
    if (!started.ok) {
      setError(started.error);
      return;
    }
    setEnrichSnapshot(started.snapshot);
    setPumpToken((token) => token + 1);
    setStep('enriching');
  }

  return (
    <DialogBackdrop open={open} onClose={handleClose} panelClassName="max-w-[960px]">
      <div className="gap-3.1 bg-surface p-4.1 flex max-h-[90vh] flex-col overflow-auto rounded-xl shadow-lg">
        <div className="flex items-center justify-between">
          <DialogTitle>Import accounts</DialogTitle>
          <button
            type="button"
            className="text-ink/70 hover:text-ink"
            onClick={handleClose}
            aria-label="Close"
            disabled={busy || step === 'importing'}
          >
            <X strokeWidth={2.75} className="h-5 w-5" />
          </button>
        </div>
        <p className="text-ink/60 m-0 text-xs">
          {step === 'select' && 'Select a represented line, source, and spreadsheet.'}
          {step === 'map' && 'Map spreadsheet columns. Business name is required.'}
          {step === 'normalize' &&
            'Review parsed addresses. Oregon and Washington only — never defaults to BC.'}
          {step === 'preview' &&
            'Matching is deterministic. No retailers are written until confirm.'}
          {step === 'confirm' &&
            'Historical OGR defaults. Optionally run AI fill-blanks after import.'}
          {step === 'importing' && 'Importing accounts…'}
          {step === 'imported' && 'Import finished. Enrich now or done.'}
          {step === 'enriching' && 'Per-row AI fill-blanks. Retry failed or cancel remaining.'}
        </p>
        {error ? (
          <p className="m-0 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {lineBlocked && step === 'select' ? (
          <p className="m-0 text-sm text-red-700">{STAFF_AI_ERRORS.lineNotAllowed}</p>
        ) : null}

        {step === 'select' ? (
          <>
            <Field>
              <FieldLabel>Sales line</FieldLabel>
              <Select value={salesLineId} onChange={(e) => setSalesLineId(e.target.value)}>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Source type</FieldLabel>
              <Select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as AccountImportSourceType)}
              >
                {ACCOUNT_IMPORT_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={!opt.enabled}>
                    {opt.label}
                    {opt.enabled ? '' : ' (later)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Spreadsheet (.xlsx or .csv)</FieldLabel>
              <Input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!file || !salesLineId || !sourceEnabled || lineBlocked || busy}
                onClick={() => void handleParse()}
              >
                {busy ? 'Reading…' : 'Continue'}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'map' ? (
          <>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">CRM field</th>
                    <th className="p-2">Column</th>
                    <th className="p-2">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {ACCOUNT_IMPORT_TARGET_FIELDS.map((field) => (
                    <tr key={field}>
                      <td className="p-2">{FIELD_LABELS[field]}</td>
                      <td className="p-2">
                        <Select
                          value={columnMap[field] ?? ''}
                          onChange={(e) =>
                            setColumnMap((current) => ({
                              ...current,
                              [field]: e.target.value || undefined,
                            }))
                          }
                        >
                          <option value="">Not mapped</option>
                          {headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="text-ink/70 p-2">
                        {columnMap[field] ? sampleValues(rawRows, columnMap[field]) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!isBusinessNameMapped(columnMap)}
                onClick={handleNormalize}
              >
                Continue
              </Button>
            </div>
          </>
        ) : null}

        {step === 'normalize' ? (
          <>
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Raw Ship To</th>
                    <th className="p-2">Street</th>
                    <th className="p-2">City</th>
                    <th className="p-2">State</th>
                    <th className="p-2">ZIP</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueNormalized.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="p-2">{row.name}</td>
                      <td className="text-ink/70 p-2">{row.rawAddressText || '—'}</td>
                      <td className="p-2">
                        <Input
                          value={row.street ?? ''}
                          onChange={(e) =>
                            setNormalized((rows) =>
                              rows.map((item) =>
                                item.rowNumber === row.rowNumber
                                  ? applyNormalizedEdits(item, { street: e.target.value || null })
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.city ?? ''}
                          onChange={(e) =>
                            setNormalized((rows) =>
                              rows.map((item) =>
                                item.rowNumber === row.rowNumber
                                  ? applyNormalizedEdits(item, { city: e.target.value || null })
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          value={row.stateCode ?? ''}
                          onChange={(e) =>
                            setNormalized((rows) =>
                              rows.map((item) =>
                                item.rowNumber === row.rowNumber
                                  ? applyNormalizedEdits(item, {
                                      stateCode:
                                        e.target.value === 'or' || e.target.value === 'wa'
                                          ? e.target.value
                                          : null,
                                    })
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="">Unknown</option>
                          <option value="or">OR</option>
                          <option value="wa">WA</option>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.postalCode ?? ''}
                          onChange={(e) =>
                            setNormalized((rows) =>
                              rows.map((item) =>
                                item.rowNumber === row.rowNumber
                                  ? applyNormalizedEdits(item, {
                                      postalCode: e.target.value || null,
                                    })
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" onClick={() => setStep('map')}>
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void handlePreview()}
              >
                {busy ? 'Matching…' : 'Preview'}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'preview' && counts ? (
          <>
            {existingBatchId ? (
              <p className="m-0 text-sm">
                This file was already committed. Continue to view the report instead of importing
                again.
              </p>
            ) : null}
            <ImportCountChips counts={counts} />
            <div className="max-h-[40vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Row</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Decision</th>
                    <th className="p-2">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="p-2">{row.rowNumber}</td>
                      <td className="p-2">{row.name}</td>
                      <td className="p-2">{row.matchDecision}</td>
                      <td className="p-2">{row.match ? `#${row.match.retailerId}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" onClick={() => setStep('normalize')}>
                Back
              </Button>
              <Button type="button" variant="primary" onClick={() => setStep('confirm')}>
                Continue
              </Button>
            </div>
          </>
        ) : null}

        {step === 'confirm' ? (
          <>
            {counts ? <ImportCountChips counts={counts} /> : null}
            <Field>
              <FieldLabel>Relationship</FieldLabel>
              <Select
                value={classification.relationshipStatus}
                onChange={(e) =>
                  setClassification((current) => ({
                    ...current,
                    relationshipStatus: e.target
                      .value as ConfirmClassification['relationshipStatus'],
                  }))
                }
              >
                <option value="opened">Opened (dormant reactivation)</option>
                <option value="prospect">Prospect</option>
                <option value="qualified">Qualified</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Existing OGR</FieldLabel>
              <Input
                value={classification.existingOgr}
                onChange={(e) =>
                  setClassification((current) => ({ ...current, existingOgr: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>Next action</FieldLabel>
              <Input
                value={classification.nextAction ?? ''}
                onChange={(e) =>
                  setClassification((current) => ({
                    ...current,
                    nextAction: e.target.value || null,
                  }))
                }
              />
            </Field>
            <p className="text-ink/70 m-0 text-sm">
              Markers: {classification.markers.join(', ')}. Import-protected identity. No orders.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={classification.runAiAfterImport !== false}
                onChange={(e) =>
                  setClassification((current) => ({
                    ...current,
                    runAiAfterImport: e.target.checked,
                  }))
                }
              />
              Run AI fill-blanks after import
            </label>
            <div className="flex justify-between gap-2">
              <Button type="button" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void handleCommit()}
              >
                Import
              </Button>
            </div>
          </>
        ) : null}

        {step === 'importing' ? <p className="m-0 text-sm">Writing eligible rows…</p> : null}

        {step === 'imported' && report ? (
          <>
            <ImportCommitReport
              report={report}
              rows={committedRows}
              selectedRetailerIds={selectedRetailerIds}
              onToggleRetailer={(retailerId) =>
                setSelectedRetailerIds((current) => {
                  const next = new Set(current);
                  if (next.has(retailerId)) next.delete(retailerId);
                  else next.add(retailerId);
                  return next;
                })
              }
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" onClick={handleClose}>
                Done
              </Button>
              <Button
                type="button"
                disabled={selectedRetailerIds.size === 0}
                onClick={() => void startEnrich([...selectedRetailerIds])}
              >
                Enrich selected
              </Button>
              <Button type="button" variant="primary" onClick={() => void startEnrich()}>
                Enrich all
              </Button>
            </div>
          </>
        ) : null}

        {step === 'enriching' ? (
          <EnrichmentProgress
            snapshot={enrichSnapshot}
            busy={false}
            onRetryFailed={() => {
              if (!importedBatchId) return;
              void retryAccountImportEnrichClient({
                salesLineId,
                batchId: importedBatchId,
              }).then((result) => {
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setEnrichSnapshot(result.snapshot);
                setPumpToken((token) => token + 1);
                setStep('enriching');
              });
            }}
            onCancelRemaining={() => {
              if (!importedBatchId) return;
              void cancelAccountImportEnrichClient({
                salesLineId,
                batchId: importedBatchId,
              }).then((result) => {
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setEnrichSnapshot(result.snapshot);
              });
            }}
            onDone={handleClose}
          />
        ) : null}
      </div>
    </DialogBackdrop>
  );
}
