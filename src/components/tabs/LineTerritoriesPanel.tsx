import { useEffect, useMemo, useState } from 'react';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select, Textarea } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { useOptionalLineContext } from '@/lib/lineContext';
import {
  allowedGeoCodesForLine,
  assertTerritoryAdminWrite,
  fetchAssignableGeosClient,
  fetchSalesLineTerritoriesClient,
  saveSalesLineTerritoryClient,
  type AssignableGeo,
  type SalesLineTerritoryAssignment,
} from '@/lib/salesLineTerritories';
import type { SalesLineTerritoryRightsType, SalesLineTerritoryStatus } from '@/types/database';

const HEADER_CELL =
  'border-ink/15 text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase';

const RIGHTS_LABELS: Record<SalesLineTerritoryRightsType, string> = {
  exclusive: 'Exclusive',
  limited_exclusive: 'Limited exclusive',
  non_exclusive: 'Non-exclusive',
  unconfirmed: 'Unconfirmed',
};

const STATUS_LABELS: Record<SalesLineTerritoryStatus, string> = {
  proposed: 'Proposed',
  active: 'Active',
  expired: 'Expired',
  disputed: 'Disputed',
};

function statusVariant(
  status: SalesLineTerritoryStatus,
): 'accent' | 'accent-2' | 'neutral' | 'outline' {
  if (status === 'active') return 'accent';
  if (status === 'proposed') return 'outline';
  if (status === 'disputed') return 'accent-2';
  return 'neutral';
}

function geoLabel(input: {
  territoryName: string;
  territoryCode: string;
  parentTerritoryName: string | null;
}): string {
  const parent = input.parentTerritoryName ? ` under ${input.parentTerritoryName}` : '';
  return `${input.territoryName} (${input.territoryCode})${parent}`;
}

type FormState = {
  assignmentId?: string;
  territoryCode: string;
  rightsType: SalesLineTerritoryRightsType;
  status: SalesLineTerritoryStatus;
  effectiveDate: string;
  expirationDate: string;
  contractSource: string;
  notes: string;
};

function emptyForm(defaultGeo: string): FormState {
  return {
    territoryCode: defaultGeo,
    rightsType: 'unconfirmed',
    status: 'proposed',
    effectiveDate: '',
    expirationDate: '',
    contractSource: '',
    notes: '',
  };
}

function formFromAssignment(row: SalesLineTerritoryAssignment): FormState {
  return {
    assignmentId: row.id,
    territoryCode: row.territoryCode,
    rightsType: row.rightsType,
    status: row.status,
    effectiveDate: row.effectiveDate ?? '',
    expirationDate: row.expirationDate ?? '',
    contractSource: row.contractSource ?? '',
    notes: row.notes ?? '',
  };
}

export function LineTerritoriesPanel() {
  const line = useOptionalLineContext();
  const lineCode = line.lineSlug;
  const lineStatus = line.status;
  const canAdmin = line.multiLineTerritoryAdmin;
  const writeGate =
    lineCode && lineStatus
      ? assertTerritoryAdminWrite({ code: lineCode, status: lineStatus })
      : null;
  const canWrite = Boolean(canAdmin && writeGate?.ok);
  const allowedGeos = lineCode ? allowedGeoCodesForLine(lineCode) : null;

  const [assignments, setAssignments] = useState<SalesLineTerritoryAssignment[]>([]);
  const [geos, setGeos] = useState<AssignableGeo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!line.multiLineUi || !lineCode) return;
    const code = lineCode;
    let active = true;
    async function load() {
      const [list, geoList] = await Promise.all([
        fetchSalesLineTerritoriesClient(code),
        canWrite
          ? fetchAssignableGeosClient(code)
          : Promise.resolve({ ok: true as const, geos: [] }),
      ]);
      if (!active) return;
      if (!list.ok) {
        setAssignments([]);
        setError(list.error);
        setLoading(false);
        return;
      }
      if (!geoList.ok) {
        setAssignments(list.assignments);
        setError(geoList.error);
        setLoading(false);
        return;
      }
      setAssignments(list.assignments);
      setGeos(geoList.geos);
      setError(null);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [canWrite, line.multiLineUi, lineCode]);

  const defaultGeo = useMemo(() => allowedGeos?.[0] ?? '', [allowedGeos]);

  async function handleSave(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!lineCode || !form) return;
    setSaving(true);
    setError(null);
    const result = await saveSalesLineTerritoryClient(lineCode, {
      assignmentId: form.assignmentId,
      territoryCode: form.territoryCode,
      rightsType: form.rightsType,
      status: form.status,
      effectiveDate: form.effectiveDate || null,
      expirationDate: form.expirationDate || null,
      contractSource: form.contractSource.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(null);
    const refreshed = await fetchSalesLineTerritoriesClient(lineCode);
    if (refreshed.ok) setAssignments(refreshed.assignments);
  }

  if (!line.multiLineUi || !lineCode) {
    return (
      <section className="flex flex-col gap-4" data-screen-label="territories">
        <Card>
          <CardTitle>Line territories</CardTitle>
          <p className="text-ink/70 m-0 text-sm">
            Open a represented line workspace to view sales-line rights. Retailer location filters
            stay on store geography.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-screen-label="territories">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading m-0 text-xl">Territories</h2>
          <p className="text-ink/65 m-0 mt-1 text-sm">
            Line rights for {line.name ?? lineCode}. Store location stays on the retailer record.
          </p>
        </div>
        {canWrite ? (
          <Button type="button" variant="primary" onClick={() => setForm(emptyForm(defaultGeo))}>
            <Plus size={16} strokeWidth={2.75} />
            <span>Add assignment</span>
          </Button>
        ) : null}
      </div>

      {!canAdmin ? (
        <p className="text-ink/60 m-0 text-sm">Territory admin is off. This list is read-only.</p>
      ) : null}
      {canAdmin && writeGate && !writeGate.ok ? (
        <p className="text-ink/60 m-0 text-sm">{writeGate.error}.</p>
      ) : null}

      {loading ? <p className="text-ink/60 m-0 text-sm">Loading line territories…</p> : null}
      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Card elevation="md" className="overflow-hidden p-0">
        {assignments.length === 0 && !loading ? (
          <p className="text-ink/60 m-0 px-4 py-8 text-center text-sm">
            No line-rights assignments yet.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={HEADER_CELL}>Geography</th>
                  <th className={HEADER_CELL}>Rights</th>
                  <th className={HEADER_CELL}>Status</th>
                  <th className={HEADER_CELL}>Effective</th>
                  <th className={HEADER_CELL}>Expires</th>
                  <th className={HEADER_CELL}>Contract</th>
                  <th className={HEADER_CELL}>Notes</th>
                  {canWrite ? <th className={`${HEADER_CELL} text-right`}>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {assignments.map((row) => (
                  <tr key={row.id} className="hover:bg-ink/[0.04]">
                    <td className="border-ink/10 border-b p-2">
                      <div className="flex items-start gap-1.5">
                        <MapPin size={14} strokeWidth={2.75} className="text-ink/50 mt-0.5" />
                        <span>{geoLabel(row)}</span>
                      </div>
                    </td>
                    <td className="border-ink/10 border-b p-2">{RIGHTS_LABELS[row.rightsType]}</td>
                    <td className="border-ink/10 border-b p-2">
                      <Tag variant={statusVariant(row.status)}>{STATUS_LABELS[row.status]}</Tag>
                    </td>
                    <td className="border-ink/10 border-b p-2">{row.effectiveDate ?? '—'}</td>
                    <td className="border-ink/10 border-b p-2">{row.expirationDate ?? '—'}</td>
                    <td className="border-ink/10 border-b p-2">{row.contractSource ?? '—'}</td>
                    <td className="border-ink/10 max-w-[16rem] border-b p-2">
                      {row.notes ||
                        (Object.keys(row.restrictions).length > 0
                          ? JSON.stringify(row.restrictions)
                          : '—')}
                    </td>
                    {canWrite ? (
                      <td className="border-ink/10 border-b p-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setForm(formFromAssignment(row))}
                        >
                          <Pencil size={14} strokeWidth={2.75} />
                          <span>Edit</span>
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DialogBackdrop
        open={Boolean(form)}
        onClose={() => {
          if (!saving) setForm(null);
        }}
      >
        {form ? (
          <form
            className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg"
            onSubmit={(event) => void handleSave(event)}
          >
            <DialogTitle>{form.assignmentId ? 'Edit assignment' : 'Add assignment'}</DialogTitle>
            <p className="text-ink/65 m-0 text-sm">
              Northern California is not the California parent. Allowed geos for this line:{' '}
              {(allowedGeos ?? []).join(', ') || 'none'}.
            </p>
            <Field>
              <FieldLabel>Geography</FieldLabel>
              <Select
                value={form.territoryCode}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, territoryCode: event.target.value } : current,
                  )
                }
                required
              >
                {geos.map((geo) => (
                  <option key={geo.id} value={geo.code}>
                    {geoLabel({
                      territoryName: geo.name,
                      territoryCode: geo.code,
                      parentTerritoryName: geo.parentName,
                    })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Rights type</FieldLabel>
              <Select
                value={form.rightsType}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          rightsType: event.target.value as SalesLineTerritoryRightsType,
                        }
                      : current,
                  )
                }
              >
                {Object.entries(RIGHTS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, status: event.target.value as SalesLineTerritoryStatus }
                      : current,
                  )
                }
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Effective date</FieldLabel>
                <Input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, effectiveDate: event.target.value } : current,
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Expiration date</FieldLabel>
                <Input
                  type="date"
                  value={form.expirationDate}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, expirationDate: event.target.value } : current,
                    )
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Contract source</FieldLabel>
              <Input
                value={form.contractSource}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, contractSource: event.target.value } : current,
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, notes: event.target.value } : current,
                  )
                }
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setForm(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogBackdrop>
    </section>
  );
}
