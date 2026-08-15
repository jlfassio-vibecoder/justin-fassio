import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Field, FieldLabel, Input, Select, Textarea } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { supabase } from '@/lib/supabase';
import {
  ACQUISITION_STAGES,
  PROSPECTIVE_LINE_SOFT_CAP,
  PROSPECTIVE_TARGETS_BLOCK_PROMOTE,
  TARGET_STATUSES,
  createProspectiveLineClient,
  createProspectiveTargetClient,
  deleteProspectiveLineClient,
  deleteProspectiveTargetClient,
  fetchProspectiveLineClient,
  fetchProspectiveLinesClient,
  patchProspectiveLineClient,
  patchProspectiveTargetClient,
  promoteProspectiveLineClient,
  type ProspectiveLineRecord,
  type ProspectivePromoteStatus,
  type ProspectiveTargetRecord,
} from '@/lib/prospectiveLines';
import type { AcquisitionStage, RetailerLineTargetStatus } from '@/types/database';

const HEADER_CELL =
  'border-ink/15 text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase';

const STAGE_LABELS: Record<AcquisitionStage, string> = {
  identified: 'Identified',
  researching: 'Researching',
  contact_requested: 'Contact requested',
  conversation: 'Conversation',
  evaluating: 'Evaluating',
  negotiating: 'Negotiating',
  decision_pending: 'Decision pending',
};

const TARGET_LABELS: Record<RetailerLineTargetStatus, string> = {
  watching: 'Watching',
  shortlist: 'Shortlist',
  dropped: 'Dropped',
};

function targetVariant(
  status: RetailerLineTargetStatus,
): 'accent' | 'accent-2' | 'neutral' | 'outline' {
  if (status === 'shortlist') return 'accent';
  if (status === 'watching') return 'outline';
  return 'neutral';
}

type ProspectHit = { id: number; name: string };

async function searchProspects(query: string): Promise<ProspectHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (/^\d+$/.test(trimmed)) {
    const { data, error } = await supabase
      .from('prospects')
      .select('id, name')
      .eq('id', Number(trimmed))
      .maybeSingle();
    if (error || !data) return [];
    return [{ id: data.id, name: data.name }];
  }
  const { data, error } = await supabase
    .from('prospects')
    .select('id, name')
    .ilike('name', `%${trimmed}%`)
    .limit(8);
  if (error) return [];
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

function ProspectiveList() {
  const [lines, setLines] = useState<ProspectiveLineRecord[]>([]);
  const [warned, setWarned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [legalName, setLegalName] = useState('');
  const [stage, setStage] = useState<AcquisitionStage>('identified');

  useEffect(() => {
    let active = true;
    async function load() {
      const result = await fetchProspectiveLinesClient();
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setLines(result.lines);
      setWarned(result.warned);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const result = await createProspectiveLineClient({
      name,
      code: code.trim() || undefined,
      acquisitionStage: stage,
      legalName: legalName.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.assign(`/app/prospective-lines/${result.line.code}`);
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-7 py-6">
      <div>
        <p className="text-accent text-[10px] tracking-[0.1em] uppercase">Acquisition</p>
        <h1 className="m-0 text-2xl">Prospective Lines</h1>
        <p className="text-ink/70 m-0 mt-1 text-sm">
          Research and retailer targets only. Not a selling book.
        </p>
      </div>

      {warned || lines.length >= PROSPECTIVE_LINE_SOFT_CAP ? (
        <p className="text-accent-700 m-0 text-sm">
          Soft cap of {PROSPECTIVE_LINE_SOFT_CAP} prospective lines reached. Additional creates are
          allowed but will warn.
        </p>
      ) : null}
      {error ? <p className="text-accent-700 m-0 text-sm">{error}</p> : null}

      <Card>
        <CardTitle>Add candidate</CardTitle>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel>Display name</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Code (optional kebab)</FieldLabel>
            <Input value={code} onChange={(event) => setCode(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Legal name (optional)</FieldLabel>
            <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Acquisition stage</FieldLabel>
            <Select
              value={stage}
              onChange={(event) => setStage(event.target.value as AcquisitionStage)}
            >
              {ACQUISITION_STAGES.map((value) => (
                <option key={value} value={value}>
                  {STAGE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            variant="primary"
            disabled={busy || !name.trim()}
            onClick={() => void handleCreate()}
          >
            <Plus strokeWidth={2.75} className="h-4 w-4" />
            Create
          </Button>
        </div>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={HEADER_CELL}>Name</th>
              <th className={HEADER_CELL}>Code</th>
              <th className={HEADER_CELL}>Stage</th>
              <th className={HEADER_CELL}>Targets</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="border-ink/10 border-b p-2">
                  <a
                    href={`/app/prospective-lines/${line.code}`}
                    className="font-heading text-accent-700 no-underline"
                  >
                    {line.name}
                  </a>
                </td>
                <td className="border-ink/10 border-b p-2">{line.code}</td>
                <td className="border-ink/10 border-b p-2">
                  {line.acquisitionStage ? STAGE_LABELS[line.acquisitionStage] : '—'}
                </td>
                <td className="border-ink/10 border-b p-2">{line.targetCount}</td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <tr>
                <td className="text-ink/60 p-3" colSpan={4}>
                  No prospective lines yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProspectiveDetail({ code }: { code: string }) {
  const [line, setLine] = useState<ProspectiveLineRecord | null>(null);
  const [targets, setTargets] = useState<ProspectiveTargetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [stage, setStage] = useState<AcquisitionStage>('identified');
  const [icp, setIcp] = useState('');
  const [researchNotes, setResearchNotes] = useState('');
  const [geoInterest, setGeoInterest] = useState('');
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProspectHit[]>([]);
  const [interest, setInterest] = useState('');
  const [fitNotes, setFitNotes] = useState('');
  const [suggestedGeo, setSuggestedGeo] = useState('');

  async function refresh() {
    const result = await fetchProspectiveLineClient(code);
    if (!result.ok) {
      setError(result.error);
      setLine(null);
      return;
    }
    setError(null);
    setLine(result.line);
    setTargets(result.targets);
    setName(result.line.name);
    setLegalName(result.line.legalName ?? '');
    setStage(result.line.acquisitionStage ?? 'identified');
    setIcp(result.line.icp);
    setResearchNotes(result.line.researchNotes);
    setGeoInterest(result.line.geoInterest);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const result = await fetchProspectiveLineClient(code);
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setLine(null);
        return;
      }
      setError(null);
      setLine(result.line);
      setTargets(result.targets);
      setName(result.line.name);
      setLegalName(result.line.legalName ?? '');
      setStage(result.line.acquisitionStage ?? 'identified');
      setIcp(result.line.icp);
      setResearchNotes(result.line.researchNotes);
      setGeoInterest(result.line.geoInterest);
    }
    void load();
    return () => {
      active = false;
    };
  }, [code]);

  const hasTargets = targets.length > 0;

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await patchProspectiveLineClient(code, {
      name,
      acquisitionStage: stage,
      legalName: legalName.trim() || null,
      icp,
      researchNotes,
      geoInterest,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLine(result.line);
  }

  async function handlePromote(status: ProspectivePromoteStatus) {
    setBusy(true);
    setError(null);
    const result = await promoteProspectiveLineClient(code, status);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.assign('/app/prospective-lines');
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteProspectiveLineClient(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.assign('/app/prospective-lines');
  }

  async function handleSearch() {
    setHits(await searchProspects(search));
  }

  async function handleAddTarget(retailerId: number) {
    setBusy(true);
    setError(null);
    const result = await createProspectiveTargetClient(code, {
      retailerId,
      interest: interest.trim() || null,
      fitNotes: fitNotes.trim() || null,
      suggestedGeo: suggestedGeo.trim() || null,
      status: 'watching',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setHits([]);
    setSearch('');
    await refresh();
  }

  async function handleTargetStatus(targetId: string, status: RetailerLineTargetStatus) {
    const result = await patchProspectiveTargetClient(code, targetId, { status });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  async function handleDeleteTarget(targetId: string) {
    const result = await deleteProspectiveTargetClient(code, targetId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  if (!line && error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-3 px-7 py-10">
        <h1 className="m-0 text-2xl">Line not found</h1>
        <p className="text-ink/70 m-0 text-sm">{error}</p>
        <a href="/app/prospective-lines" className="font-heading text-accent-700 no-underline">
          Back to prospective lines
        </a>
      </div>
    );
  }

  if (!line) {
    return (
      <div className="text-ink/60 flex min-h-[40vh] items-center justify-center px-6 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-7 py-6">
      <a
        href="/app/prospective-lines"
        className="text-ink/80 hover:text-ink inline-flex items-center gap-1.5 no-underline"
      >
        <ArrowLeft strokeWidth={2.75} className="h-4 w-4" />
        All prospective lines
      </a>
      <div>
        <p className="text-accent text-[10px] tracking-[0.1em] uppercase">Research workspace</p>
        <h1 className="m-0 text-2xl">{line.name}</h1>
        <p className="text-ink/70 m-0 mt-1 text-sm">{line.code}</p>
      </div>
      {error ? <p className="text-accent-700 m-0 text-sm">{error}</p> : null}

      <Card>
        <CardTitle>Line research</CardTitle>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel>Display name</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Legal name</FieldLabel>
            <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Acquisition stage</FieldLabel>
            <Select
              value={stage}
              onChange={(event) => setStage(event.target.value as AcquisitionStage)}
            >
              {ACQUISITION_STAGES.map((value) => (
                <option key={value} value={value}>
                  {STAGE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel>Geographic interest</FieldLabel>
            <Input value={geoInterest} onChange={(event) => setGeoInterest(event.target.value)} />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>ICP draft</FieldLabel>
            <Textarea value={icp} onChange={(event) => setIcp(event.target.value)} rows={3} />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Research notes</FieldLabel>
            <Textarea
              value={researchNotes}
              onChange={(event) => setResearchNotes(event.target.value)}
              rows={4}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button type="button" variant="primary" disabled={busy} onClick={() => void handleSave()}>
            Save research
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Retailer targets</CardTitle>
        <p className="text-ink/70 m-0 mt-1 text-sm">
          Existing retailers only. Opening a target does not create a line account.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel>Find retailer (name or id)</FieldLabel>
            <div className="flex gap-2">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} />
              <Button type="button" onClick={() => void handleSearch()}>
                <Search strokeWidth={2.75} className="h-4 w-4" />
                Search
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel>Interest</FieldLabel>
            <Input value={interest} onChange={(event) => setInterest(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Fit notes</FieldLabel>
            <Input value={fitNotes} onChange={(event) => setFitNotes(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Suggested geo (text)</FieldLabel>
            <Input value={suggestedGeo} onChange={(event) => setSuggestedGeo(event.target.value)} />
          </Field>
        </div>
        {hits.length > 0 ? (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
            {hits.map((hit) => (
              <li key={hit.id} className="flex items-center justify-between gap-2">
                <span>
                  {hit.name} <span className="text-ink/50">#{hit.id}</span>
                </span>
                <Button type="button" disabled={busy} onClick={() => void handleAddTarget(hit.id)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={HEADER_CELL}>Retailer</th>
                <th className={HEADER_CELL}>Status</th>
                <th className={HEADER_CELL}>Interest</th>
                <th className={HEADER_CELL}>Geo</th>
                <th className={HEADER_CELL}></th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id}>
                  <td className="border-ink/10 border-b p-2">
                    {target.retailerName ?? `#${target.retailerId}`}
                  </td>
                  <td className="border-ink/10 border-b p-2">
                    <Select
                      className="w-36"
                      value={target.status}
                      onChange={(event) =>
                        void handleTargetStatus(
                          target.id,
                          event.target.value as RetailerLineTargetStatus,
                        )
                      }
                    >
                      {TARGET_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {TARGET_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                    <Tag variant={targetVariant(target.status)} className="ml-2">
                      {TARGET_LABELS[target.status]}
                    </Tag>
                  </td>
                  <td className="border-ink/10 border-b p-2">{target.interest ?? '—'}</td>
                  <td className="border-ink/10 border-b p-2">{target.suggestedGeo ?? '—'}</td>
                  <td className="border-ink/10 border-b p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void handleDeleteTarget(target.id)}
                    >
                      <Trash2 strokeWidth={2.75} className="h-4 w-4" />
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {targets.length === 0 ? (
                <tr>
                  <td className="text-ink/60 p-3" colSpan={5}>
                    No retailer targets.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle>Promote or decline</CardTitle>
        <p className="text-ink/70 m-0 mt-1 text-sm">
          {hasTargets
            ? PROSPECTIVE_TARGETS_BLOCK_PROMOTE
            : 'Targets are clear. Status change will not create line accounts.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={busy || hasTargets}
            onClick={() => void handlePromote('confirmed')}
          >
            Promote to confirmed
          </Button>
          <Button
            type="button"
            disabled={busy || hasTargets}
            onClick={() => void handlePromote('onboarding')}
          >
            Promote to onboarding
          </Button>
          <Button
            type="button"
            disabled={busy || hasTargets}
            onClick={() => void handlePromote('declined')}
          >
            Decline
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || hasTargets}
            onClick={() => void handleDelete()}
          >
            <Trash2 strokeWidth={2.75} className="h-4 w-4" />
            Delete candidate
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function ProspectiveLinesWorkspace({ lineSlug }: { lineSlug?: string | null }) {
  const code = lineSlug?.trim().toLowerCase() || null;
  return code ? <ProspectiveDetail code={code} /> : <ProspectiveList />;
}
