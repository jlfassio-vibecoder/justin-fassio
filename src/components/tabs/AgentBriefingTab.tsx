import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { AccountDetailDrawer } from '@/components/AccountDetailDrawer';
import {
  OgrProductEmailComposerModal,
  type OgrProductEmailComposerDraft,
} from '@/components/OgrProductEmailComposerModal';
import { ProspectDetailDrawer } from '@/components/ProspectDetailDrawer';
import { Button } from '@/components/ui/Button';
import { Card, CardKicker, CardMeta, CardTitle } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import {
  getAgentProductOutreachDraftClient,
  createFollowUpDraftClient,
  cancelAgentProductOutreachDraftClient,
  composerDraftFromAgentDto,
} from '@/lib/agentProductOutreachDraftClient';
import type { CatalogItem } from '@/lib/catalog';
import { buildCatalogItemEmailCardHtml } from '@/lib/catalogItemEmailCardHtml';
import { useOptionalLineContext } from '@/lib/lineContext';
import {
  formatFollowUpRelativeTime,
  formatRegionalPoolMessage,
  regionalPrepAvailableCount,
  TOP_LEADS_QUICK_VIEW_VISIBLE,
  type OutreachBriefingDto,
  type OutreachFollowUpRow,
} from '@/lib/outreachBriefingShared';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import { FOLLOW_UP_QUEUE_VISIBLE } from '@/lib/outreachFollowUpQueue';
import type { Prospect } from '@/lib/prospects';
import { Tag } from '@/components/ui/Tag';
import {
  fetchOperationalTerritories,
  type OperationalTerritoryOption,
} from '@/lib/operationalTerritories/fetchOperationalTerritories';
import { OGR_OPERATIONAL_TERRITORY_CODES } from '@/lib/operationalTerritories/resolve';
import {
  opsCodeForBriefingRegion,
  prospectMatchesCrmRegion,
  regionOptionsForTerritory,
} from '@/lib/geoCatalog';
import { CHANNEL_OPTIONS } from '@/lib/directoryOptions';
import { primaryRetailChannelLabel } from '@/lib/crmRetailTaxonomy';
import { supabase } from '@/lib/supabase';

const ICON_STROKE = 2.75;
const OGR_OPS_SET = new Set<string>(OGR_OPERATIONAL_TERRITORY_CODES);
/** Keep in sync with OUTREACH_REGIONAL_PREP_* in outreachNightlyPrep. */
const REGIONAL_PREP_DEFAULT_LIMIT = 25;
const REGIONAL_PREP_MAX_LIMIT = 50;
const OGR_BRIEFING_TERRITORIES = [
  { code: 'or' as const, label: 'Oregon' },
  { code: 'wa' as const, label: 'Washington' },
];

function clampPrepLimit(value: number): number {
  if (!Number.isFinite(value)) return REGIONAL_PREP_DEFAULT_LIMIT;
  return Math.min(REGIONAL_PREP_MAX_LIMIT, Math.max(1, Math.floor(value)));
}

type DraftReviewTarget = {
  draftId: string;
  catalogItemId: string;
  productName: string;
  prospectName?: string;
};

type BriefingLogCallContext = {
  talkTrackHint: string | null;
  lastProductName: string | null;
};

type AgentBriefingTabProps = {
  catalog: CatalogItem[];
  prospects: Prospect[];
  deepLinkSku?: string | null;
  deepLinkDraftId?: string | null;
  onDeepLinkConsumed?: () => void;
  onProductEmailSent?: () => void;
  onLogCallForLead: (
    prospectId: number,
    context?: BriefingLogCallContext,
  ) => void | boolean | Promise<void | boolean>;
  briefingReloadToken?: number;
  onLogCall: (prospect: Prospect) => void;
  onNotesSaved?: (id: number, notes: string | null) => void;
  onProspectUpdated?: (prospect: Prospect) => void;
};

type OpenBriefingStoreArgs = {
  prospectId: number;
  accountStatus?: string;
  openResearch?: boolean;
};

async function staffGet(
  path: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Request failed (${res.status})` };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, data: payload };
}

async function staffPost(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Request failed (${res.status})` };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, data: payload };
}

function followUpActionLabel(action: OutreachFollowUpRow['recommendedAction']): string {
  if (action === 'call') return 'Call';
  if (action === 'email') return 'Email';
  return 'Watch';
}

function callTodayReasonChip(reasons: OutreachLeadRow['callTodayReasons']): string | null {
  if (reasons.includes('attributed_reply')) return 'Replied';
  if (reasons.includes('hot_intent')) return 'Hot';
  if (reasons.includes('follow_up_overdue')) return 'Overdue';
  if (reasons.includes('follow_up_due_today')) return 'Due today';
  return null;
}

function TopLeadsQuickView({
  callToday,
  hotCount,
  warm,
  recentEngagement,
  followUpsById,
  emailBusyId,
  onOpenProspect,
  onFollowUpAction,
}: {
  callToday: OutreachLeadRow[];
  hotCount: number;
  warm: OutreachLeadRow[];
  recentEngagement: OutreachBriefingDto['recentEngagement'];
  followUpsById: ReadonlyMap<number, OutreachFollowUpRow>;
  emailBusyId: number | null;
  onOpenProspect: (args: OpenBriefingStoreArgs) => void;
  onFollowUpAction: (row: OutreachFollowUpRow) => void;
}) {
  const callRows = callToday.slice(0, TOP_LEADS_QUICK_VIEW_VISIBLE);
  const warmRows = warm.filter((row) => !row.callToday).slice(0, TOP_LEADS_QUICK_VIEW_VISIBLE);
  const engagedRows = recentEngagement.slice(0, TOP_LEADS_QUICK_VIEW_VISIBLE);

  function renderLeadActions(prospectId: number, prospectName: string, accountStatus?: string) {
    const queueRow = followUpsById.get(prospectId);
    const busy = emailBusyId === prospectId;
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        {queueRow && queueRow.recommendedAction !== 'watch' ? (
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1 text-xs"
            disabled={busy}
            aria-label={
              busy
                ? `Preparing follow-up for ${prospectName}`
                : `${followUpActionLabel(queueRow.recommendedAction)} ${prospectName}`
            }
            onClick={() => onFollowUpAction(queueRow)}
          >
            {busy ? 'Preparing…' : followUpActionLabel(queueRow.recommendedAction)}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="px-2 py-0.5 text-[11px]"
          aria-label={`Open ${prospectName}`}
          onClick={() => onOpenProspect({ prospectId, accountStatus })}
        >
          Open
        </Button>
      </div>
    );
  }

  return (
    <Card data-testid="top-leads-quick-view">
      <CardTitle className="text-[15px]">Top leads</CardTitle>
      <CardMeta className="mb-3">Quick view · work the queue below for today’s actions</CardMeta>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <div>
          <p className="text-ink/50 m-0 mb-2 text-xs uppercase">
            Call today
            {hotCount > 0 ? (
              <span className="text-ink/40 normal-case"> · {hotCount} hot</span>
            ) : null}
          </p>
          {callRows.length === 0 ? (
            <p className="text-ink/50 m-0 text-sm">None</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {callRows.map((row) => {
                const reason = callTodayReasonChip(row.callTodayReasons);
                const ago = formatFollowUpRelativeTime(row.engagement.lastEngagementAt);
                return (
                  <li
                    key={row.prospectId}
                    className="flex items-start justify-between gap-2"
                    data-testid={`top-lead-call-${row.prospectId}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{row.prospectName}</span>
                        {reason ? <Tag variant="accent">{reason}</Tag> : null}
                        {ago ? <span className="text-ink/45 text-xs">{ago}</span> : null}
                      </div>
                    </div>
                    {renderLeadActions(row.prospectId, row.prospectName, row.accountStatus)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="text-ink/50 m-0 mb-2 text-xs uppercase">Warm</p>
          {warmRows.length === 0 ? (
            <p className="text-ink/50 m-0 text-sm">None</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {warmRows.map((row) => {
                const ago = formatFollowUpRelativeTime(row.engagement.lastEngagementAt);
                return (
                  <li
                    key={row.prospectId}
                    className="flex items-start justify-between gap-2"
                    data-testid={`top-lead-warm-${row.prospectId}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{row.prospectName}</span>
                        <Tag variant="outline">Warm</Tag>
                        {ago ? <span className="text-ink/45 text-xs">{ago}</span> : null}
                      </div>
                    </div>
                    {renderLeadActions(row.prospectId, row.prospectName, row.accountStatus)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="text-ink/50 m-0 mb-2 text-xs uppercase">Engaged</p>
          {engagedRows.length === 0 ? (
            <p className="text-ink/50 m-0 text-sm">None</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {engagedRows.map((row) => {
                const ago = formatFollowUpRelativeTime(row.lastEngagedAt);
                return (
                  <li
                    key={row.prospectId}
                    className="flex items-start justify-between gap-2"
                    data-testid={`top-lead-engaged-${row.prospectId}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{row.prospectName}</span>
                        {row.clickCount > 0 ? (
                          <Tag variant="outline">
                            {row.clickCount} click{row.clickCount === 1 ? '' : 's'}
                          </Tag>
                        ) : row.openCount > 0 ? (
                          <Tag variant="neutral">
                            {row.openCount} open{row.openCount === 1 ? '' : 's'}
                          </Tag>
                        ) : null}
                        {ago ? <span className="text-ink/45 text-xs">{ago}</span> : null}
                      </div>
                    </div>
                    {renderLeadActions(row.prospectId, row.prospectName)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function FollowUpQueue({
  rows,
  emailBusyId,
  snoozeBusyId,
  onAction,
  onLogCall,
  onSnooze,
}: {
  rows: OutreachFollowUpRow[];
  emailBusyId: number | null;
  snoozeBusyId: number | null;
  onAction: (row: OutreachFollowUpRow) => void;
  onLogCall: (row: OutreachFollowUpRow) => void;
  onSnooze: (row: OutreachFollowUpRow) => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!query) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.prospectName,
        row.reasonLine,
        row.talkTrackHint ?? '',
        row.lastProductName ?? '',
        row.leadState,
        row.recommendedAction,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [query, rows]);

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-[15px]">Today’s follow-ups</CardTitle>
          <CardMeta className="mb-0">
            {rows.length} emailed (90d) · opens first · Call, email, watch, log call, or snooze
            {query ? ` · ${filteredRows.length} match${filteredRows.length === 1 ? '' : 'es'}` : ''}
          </CardMeta>
        </div>
        <label className="sr-only" htmlFor="briefing-follow-up-search">
          Search today’s follow-ups
        </label>
        <Input
          id="briefing-follow-up-search"
          type="search"
          className="w-full max-w-xs text-sm"
          placeholder="Search follow-ups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search today’s follow-ups"
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-ink/50 m-0 text-sm">None right now.</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-ink/50 m-0 text-sm">No follow-ups match “{search.trim()}”.</p>
      ) : (
        <ul
          className="m-0 flex list-none flex-col gap-2 overflow-y-auto p-0"
          style={{
            maxHeight: `calc(${FOLLOW_UP_QUEUE_VISIBLE} * 3.25rem + ${FOLLOW_UP_QUEUE_VISIBLE - 1} * 0.5rem)`,
          }}
        >
          {filteredRows.map((row) => {
            const ago = formatFollowUpRelativeTime(row.lastEngagedAt);
            const stateLabel =
              row.leadState === 'hot' ? 'Hot' : row.leadState === 'warm' ? 'Warm' : 'Cold';
            const stateVariant =
              row.leadState === 'hot' ? 'accent' : row.leadState === 'warm' ? 'outline' : 'neutral';
            const rowBusy = emailBusyId === row.prospectId || snoozeBusyId === row.prospectId;
            return (
              <li
                key={row.prospectId}
                className="flex items-start justify-between gap-3"
                data-testid={`follow-up-row-${row.prospectId}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.prospectName}</span>
                    <Tag variant={stateVariant}>{stateLabel}</Tag>
                    {row.followUpOverdueDays != null && row.followUpOverdueDays > 0 ? (
                      <Tag variant="outline">Overdue</Tag>
                    ) : null}
                    {ago ? <span className="text-ink/45 text-xs">{ago}</span> : null}
                  </div>
                  <p className="text-ink/55 m-0 mt-0.5 text-xs">{row.reasonLine}</p>
                  {row.talkTrackHint ? (
                    <p className="text-ink/45 m-0 mt-0.5 text-xs italic">{row.talkTrackHint}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Button
                    type="button"
                    variant={row.recommendedAction === 'watch' ? 'ghost' : 'secondary'}
                    className="px-3 py-1 text-xs"
                    disabled={rowBusy}
                    aria-label={
                      emailBusyId === row.prospectId
                        ? `Preparing follow-up for ${row.prospectName}`
                        : `${followUpActionLabel(row.recommendedAction)} ${row.prospectName}`
                    }
                    onClick={() => onAction(row)}
                  >
                    {emailBusyId === row.prospectId
                      ? 'Preparing…'
                      : followUpActionLabel(row.recommendedAction)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-ink/50 px-2 py-0.5 text-[11px]"
                    disabled={rowBusy}
                    aria-label={`Log Call ${row.prospectName}`}
                    onClick={() => onLogCall(row)}
                  >
                    Log Call
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-ink/50 px-2 py-0.5 text-[11px]"
                    disabled={rowBusy}
                    aria-label={`Snooze ${row.prospectName} until tomorrow`}
                    onClick={() => onSnooze(row)}
                  >
                    {snoozeBusyId === row.prospectId ? 'Snoozing…' : 'Snooze'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function AgentBriefingTab({
  catalog,
  prospects,
  deepLinkSku = null,
  deepLinkDraftId = null,
  onDeepLinkConsumed,
  onProductEmailSent,
  onLogCallForLead,
  briefingReloadToken = 0,
  onLogCall,
  onNotesSaved,
  onProspectUpdated,
}: AgentBriefingTabProps) {
  const lineCtx = useOptionalLineContext();
  const isOgrLine = !lineCtx.multiLineUi || lineCtx.lineSlug === 'ogr' || lineCtx.lineSlug == null;
  const [briefing, setBriefing] = useState<OutreachBriefingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prepBusy, setPrepBusy] = useState(false);
  const [prepMessage, setPrepMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [composerDraft, setComposerDraft] = useState<OgrProductEmailComposerDraft | null>(null);
  const [composerProduct, setComposerProduct] = useState<CatalogItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [emailBusyId, setEmailBusyId] = useState<number | null>(null);
  const [snoozeBusyId, setSnoozeBusyId] = useState<number | null>(null);
  const [rowRunPrepBusyKey, setRowRunPrepBusyKey] = useState<string | null>(null);
  const [rowRunPrepMessage, setRowRunPrepMessage] = useState<string | null>(null);
  const [rowDismissBusyId, setRowDismissBusyId] = useState<number | null>(null);
  const [draftDismissBusyId, setDraftDismissBusyId] = useState<string | null>(null);
  const [draftDismissMessage, setDraftDismissMessage] = useState<string | null>(null);
  const [appliedDeepLinkKey, setAppliedDeepLinkKey] = useState('');
  const [opsOptions, setOpsOptions] = useState<OperationalTerritoryOption[]>([]);
  const [storeTerritoryCode, setStoreTerritoryCode] = useState<'or' | 'wa'>('or');
  const [briefingRegion, setBriefingRegion] = useState('ALL');
  const [briefingCity, setBriefingCity] = useState('ALL');
  const [briefingChannel, setBriefingChannel] = useState('ALL');
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [prepLimit, setPrepLimit] = useState(REGIONAL_PREP_DEFAULT_LIMIT);
  const [detailStore, setDetailStore] = useState<Prospect | null>(null);
  const [openResearchForId, setOpenResearchForId] = useState<number | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const pendingSku = deepLinkSku?.trim() || null;
  const pendingDraftId = deepLinkDraftId?.trim() || null;
  const pendingDeepLinkKey = `${pendingSku ?? ''}:${pendingDraftId ?? ''}`;

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const prospectsById = useMemo(() => {
    const map = new Map<number, Prospect>();
    for (const p of prospects) map.set(p.id, p);
    return map;
  }, [prospects]);
  const followUpsById = useMemo(() => {
    const map = new Map<number, OutreachFollowUpRow>();
    for (const row of briefing?.followUps ?? []) {
      map.set(row.prospectId, row);
    }
    return map;
  }, [briefing?.followUps]);

  const cappedPrepLimit = clampPrepLimit(prepLimit);
  const regionalPool = briefing?.regionalPool;
  /** Eligible for prep under current filters (cooldown, pending drafts, etc.), capped by prep limit. */
  const runPrepBatchSize = regionalPool
    ? Math.min(cappedPrepLimit, regionalPrepAvailableCount(regionalPool))
    : cappedPrepLimit;

  const closeDetails = useCallback(() => {
    setDetailStore(null);
    setOpenResearchForId(null);
  }, []);

  const openBriefingStore = useCallback(
    (args: OpenBriefingStoreArgs) => {
      const found = prospectsById.get(args.prospectId);
      if (!found) {
        setDrawerError(
          `Account #${args.prospectId} is not in the loaded directory. Refresh and try again.`,
        );
        return;
      }
      setDrawerError(null);
      setDetailStore(found);
      setOpenResearchForId(args.openResearch ? found.id : null);
    },
    [prospectsById],
  );

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    setComposerDraft(null);
    setComposerProduct(null);
    setComposerError(null);
  }, []);

  const openDraftReview = useCallback(
    async (target: DraftReviewTarget) => {
      setComposerError(null);
      setComposerDraft(null);
      setComposerProduct(null);
      setComposerOpen(false);

      const catalogItem = catalogById.get(target.catalogItemId);
      if (!catalogItem) {
        setComposerError(`Product not found in catalog (${target.productName}).`);
        return;
      }

      const loaded = await getAgentProductOutreachDraftClient(target.draftId);
      if (!loaded.ok) {
        setComposerError(loaded.error);
        return;
      }

      const d = loaded.draft;
      setComposerProduct(catalogItem);
      setComposerDraft(
        composerDraftFromAgentDto(d, {
          prospectName: target.prospectName?.trim() || undefined,
        }),
      );
      setComposerOpen(true);
    },
    [catalogById],
  );

  const handleFollowUpAction = useCallback(
    async (row: OutreachFollowUpRow) => {
      if (row.recommendedAction === 'call') {
        setComposerError(null);
        const opened = await onLogCallForLead(row.prospectId, {
          talkTrackHint: row.talkTrackHint,
          lastProductName: row.lastProductName,
        });
        if (opened === false) {
          setComposerError(
            'Could not open Log Call for this store. Refresh Accounts or try again.',
          );
        }
        return;
      }
      if (row.recommendedAction === 'watch') {
        openBriefingStore({ prospectId: row.prospectId, accountStatus: row.accountStatus });
        return;
      }
      setComposerError(null);
      setEmailBusyId(row.prospectId);
      const created = await createFollowUpDraftClient(row.prospectId, {
        salesLineId: lineCtx.salesLineId,
      });
      if (!created.ok) {
        setComposerError(created.error);
        setEmailBusyId(null);
        return;
      }
      await openDraftReview({
        draftId: created.draftId,
        catalogItemId: created.catalogItemId,
        productName: created.productName,
        prospectName: row.prospectName,
      });
      setEmailBusyId(null);
    },
    [lineCtx.salesLineId, onLogCallForLead, openBriefingStore, openDraftReview],
  );

  const handleFollowUpLogCall = useCallback(
    async (row: OutreachFollowUpRow) => {
      setComposerError(null);
      const opened = await onLogCallForLead(row.prospectId, {
        talkTrackHint: row.talkTrackHint,
        lastProductName: row.lastProductName,
      });
      if (opened === false) {
        setComposerError('Could not open Log Call for this store. Refresh Accounts or try again.');
      }
    },
    [onLogCallForLead],
  );

  const handleFollowUpSnooze = useCallback(async (row: OutreachFollowUpRow) => {
    setSnoozeBusyId(row.prospectId);
    const result = await staffPost('/api/staff/outreach/follow-up-snooze', {
      prospectId: row.prospectId,
    });
    setSnoozeBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReloadToken((n) => n + 1);
  }, []);

  async function dismissResearchQueueRow(row: { prospectId: number }) {
    setRowDismissBusyId(row.prospectId);
    setRowRunPrepMessage(null);
    try {
      const result = await staffPost('/api/staff/outreach/research-queue-dismiss', {
        prospectId: row.prospectId,
      });
      if (!result.ok) {
        setRowRunPrepMessage(result.error);
        return;
      }
      setReloadToken((n) => n + 1);
    } catch {
      setRowRunPrepMessage('Request failed. Try again.');
    } finally {
      setRowDismissBusyId(null);
    }
  }

  async function dismissDraftRow(row: { draftId: string; prospectName: string }) {
    setDraftDismissBusyId(row.draftId);
    setDraftDismissMessage(null);
    try {
      const result = await cancelAgentProductOutreachDraftClient(row.draftId);
      if (!result.ok) {
        setDraftDismissMessage(result.error);
        return;
      }
      setBriefing((prev) =>
        prev
          ? {
              ...prev,
              drafts: prev.drafts.filter((d) => d.draftId !== row.draftId),
            }
          : prev,
      );
      if (composerDraft?.id === row.draftId) {
        setComposerOpen(false);
        setComposerDraft(null);
        setComposerProduct(null);
      }
      setDraftDismissMessage(`Dismissed draft for ${row.prospectName}.`);
      setReloadToken((n) => n + 1);
    } catch {
      setDraftDismissMessage('Request failed. Try again.');
    } finally {
      setDraftDismissBusyId(null);
    }
  }

  useEffect(() => {
    if (!isOgrLine) return;
    let active = true;
    void fetchOperationalTerritories().then((result) => {
      if (!active) return;
      if (result.error) return;
      const ogrOps = result.data.filter((row) => OGR_OPS_SET.has(row.code));
      setOpsOptions(ogrOps);
    });
    return () => {
      active = false;
    };
  }, [isOgrLine]);

  const briefingRegionOptions = useMemo(
    () => regionOptionsForTerritory(storeTerritoryCode),
    [storeTerritoryCode],
  );

  const resolvedOpsTerritoryId = useMemo(() => {
    const opsCode = opsCodeForBriefingRegion(storeTerritoryCode, briefingRegion);
    if (!opsCode) return '';
    return opsOptions.find((row) => row.code === opsCode)?.id ?? '';
  }, [opsOptions, storeTerritoryCode, briefingRegion]);

  useEffect(() => {
    if (!isOgrLine) return;
    let active = true;
    // Copilot suggestion ignored: distinct-city RPC would add a new staff endpoint for a small OGR directory filter already scoped client-side.
    async function loadCities() {
      try {
        const { data, error } = await supabase
          .from('prospects')
          .select('city, region, territories!inner(code)')
          .eq('territories.code', storeTerritoryCode);
        if (!active) return;
        if (error || !data) {
          setCityOptions([]);
          setBriefingCity('ALL');
          return;
        }
        const storeCode =
          storeTerritoryCode === 'or' || storeTerritoryCode === 'wa' ? storeTerritoryCode : '';
        const expectedOps = opsCodeForBriefingRegion(storeCode, briefingRegion);
        const cities = new Set<string>();
        for (const row of data) {
          const city = typeof row.city === 'string' ? row.city.trim() : '';
          if (!city) continue;
          if (
            briefingRegion !== 'ALL' &&
            !prospectMatchesCrmRegion(row.region ?? '', briefingRegion, storeTerritoryCode)
          ) {
            continue;
          }
          if (expectedOps) {
            const rowOps = opsCodeForBriefingRegion(storeCode, row.region ?? '');
            if (rowOps && rowOps !== expectedOps) continue;
          }
          cities.add(city);
        }
        const sorted = [...cities].sort((a, b) => a.localeCompare(b));
        setCityOptions(sorted);
        setBriefingCity((prev) => (prev !== 'ALL' && !sorted.includes(prev) ? 'ALL' : prev));
      } catch {
        if (!active) return;
        setCityOptions([]);
      }
    }
    void loadCities();
    return () => {
      active = false;
    };
  }, [isOgrLine, storeTerritoryCode, briefingRegion]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const qsParams = new URLSearchParams();
      if (lineCtx.multiLineUi && lineCtx.salesLineId) {
        qsParams.set('sales_line_id', lineCtx.salesLineId);
      }
      if (isOgrLine && storeTerritoryCode) {
        qsParams.set('store_territory_code', storeTerritoryCode);
      }
      if (isOgrLine && resolvedOpsTerritoryId) {
        qsParams.set('operational_territory_id', resolvedOpsTerritoryId);
      }
      if (isOgrLine && briefingRegion && briefingRegion !== 'ALL') {
        qsParams.set('crm_region', briefingRegion);
      }
      if (isOgrLine && briefingCity && briefingCity !== 'ALL') {
        qsParams.set('city', briefingCity);
      }
      if (isOgrLine && briefingChannel && briefingChannel !== 'ALL') {
        qsParams.set('channel', briefingChannel);
      }
      const qs = qsParams.toString() ? `?${qsParams.toString()}` : '';
      const result = await staffGet(`/api/staff/outreach/briefing${qs}`);
      if (!active) return;
      if (!result.ok) {
        setBriefing(null);
        setError(result.error);
        setLoading(false);
        return;
      }
      const payload = result.data as { briefing?: OutreachBriefingDto };
      setBriefing(payload.briefing ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [
    reloadToken,
    briefingReloadToken,
    lineCtx.multiLineUi,
    lineCtx.salesLineId,
    isOgrLine,
    storeTerritoryCode,
    resolvedOpsTerritoryId,
    briefingRegion,
    briefingCity,
    briefingChannel,
  ]);

  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  // Copilot suggestion ignored: a new event/token deep-link protocol is out of scope; drawer close now clears its applied deep-link state.
  if (pendingDraftId && pendingDeepLinkKey !== appliedDeepLinkKey && !loading && briefing) {
    setAppliedDeepLinkKey(pendingDeepLinkKey);
    const row = briefing.drafts.find((d) => d.draftId === pendingDraftId);
    const catalogItemId =
      row?.catalogItemId ??
      (pendingSku ? catalog.find((item) => item.sku === pendingSku)?.id : undefined);

    if (!catalogItemId) {
      queueMicrotask(() => {
        setComposerError('Could not resolve product for draft deep link.');
        onDeepLinkConsumed?.();
      });
    } else {
      queueMicrotask(() => {
        void openDraftReview({
          draftId: pendingDraftId,
          catalogItemId,
          productName: row?.productName ?? pendingSku ?? 'Product',
          prospectName: row?.prospectName,
        }).finally(() => {
          onDeepLinkConsumed?.();
        });
      });
    }
  }

  async function runIdentifiedTargetPrep(row: {
    prospectId: number;
    catalogItemId: string;
    prospectName: string;
  }) {
    if (!isOgrLine) {
      setRowRunPrepMessage('Row prep is available on OGR only.');
      return;
    }
    if (!resolvedOpsTerritoryId) {
      setRowRunPrepMessage('Select a territory first.');
      return;
    }
    const busyKey = `${row.prospectId}-${row.catalogItemId}`;
    setRowRunPrepBusyKey(busyKey);
    setRowRunPrepMessage(null);
    const body: Record<string, unknown> = {
      prospectId: row.prospectId,
      catalogItemId: row.catalogItemId,
      operationalTerritoryId: resolvedOpsTerritoryId,
      storeTerritoryCode,
    };
    if (briefingRegion && briefingRegion !== 'ALL') {
      body.crmRegion = briefingRegion;
    }
    if (briefingCity && briefingCity !== 'ALL') {
      body.city = briefingCity;
    }
    if (briefingChannel && briefingChannel !== 'ALL') {
      body.channel = briefingChannel;
    }
    if (briefing?.sellingDate) body.preparationDate = briefing.sellingDate;
    try {
      const result = await staffPost('/api/staff/outreach/identified-target-draft', body);
      if (!result.ok) {
        const err = result.error;
        if (/emailed within the last|cooldown/i.test(err)) {
          setBriefing((prev) =>
            prev
              ? {
                  ...prev,
                  identifiedTargets: prev.identifiedTargets.filter(
                    (t) => t.prospectId !== row.prospectId,
                  ),
                }
              : prev,
          );
          setRowRunPrepMessage(
            `${row.prospectName} was emailed recently — removed from this queue until cooldown ends.`,
          );
          setReloadToken((n) => n + 1);
          return;
        }
        setRowRunPrepMessage(
          /no usable outreach email/i.test(err)
            ? `Add a contact email first for ${row.prospectName}.`
            : /suppressed/i.test(err)
              ? `Contact email for ${row.prospectName} is suppressed (bounce or complaint).`
              : err,
        );
        return;
      }
      setReloadToken((n) => n + 1);
    } catch {
      setRowRunPrepMessage('Request failed. Try again.');
    } finally {
      setRowRunPrepBusyKey(null);
    }
  }

  async function runPrepNow() {
    if (!isOgrLine) {
      setPrepMessage('Regional prep is available on OGR only.');
      return;
    }
    if (!resolvedOpsTerritoryId) {
      setPrepMessage('Select a territory first.');
      return;
    }
    setPrepBusy(true);
    setPrepMessage(null);
    const body: Record<string, unknown> = {
      operationalTerritoryId: resolvedOpsTerritoryId,
      storeTerritoryCode,
      limit: runPrepBatchSize,
    };
    if (briefingRegion && briefingRegion !== 'ALL') {
      body.crmRegion = briefingRegion;
    }
    if (briefingCity && briefingCity !== 'ALL') {
      body.city = briefingCity;
    }
    if (briefingChannel && briefingChannel !== 'ALL') {
      body.channel = briefingChannel;
    }
    if (briefing?.sellingDate) body.preparationDate = briefing.sellingDate;
    const result = await staffPost('/api/staff/outreach/prep', body);
    setPrepBusy(false);
    if (!result.ok) {
      setPrepMessage(result.error);
      return;
    }
    const data = result.data as {
      noop?: boolean;
      run?: { producedCount?: number; status?: string; reason?: string | null };
    };
    if (data.noop) {
      setPrepMessage('Prep already complete for that region and selling day.');
    } else if (data.run?.reason === 'open_batch_full') {
      setPrepMessage(
        'Pending drafts still open for this region — finish or send them before running prep again.',
      );
    } else if (data.run?.status === 'empty_pool') {
      setPrepMessage(
        'No sendable accounts today — see the regional pool breakdown on the prep card.',
      );
    } else {
      setPrepMessage(
        `Prep finished (${data.run?.status ?? 'done'}${
          typeof data.run?.producedCount === 'number'
            ? `, ${data.run.producedCount} new drafts`
            : ''
        }).`,
      );
    }
    setReloadToken((n) => n + 1);
  }

  const goal = briefing?.goal;
  const prep = briefing?.prep;
  const composerCardHtml =
    composerOpen && composerProduct ? buildCatalogItemEmailCardHtml(composerProduct, 'ca') : '';

  return (
    <section className="flex flex-col gap-5" data-screen-label="briefing">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList
            className="text-accent-700 h-5 w-5"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <h2 className="text-ink m-0 text-lg font-semibold">Daily Agent Briefing</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            Refresh
          </Button>
          {isOgrLine ? (
            <>
              <label className="sr-only" htmlFor="briefing-territory">
                Territory
              </label>
              <Select
                id="briefing-territory"
                className="w-auto min-w-[7rem]"
                value={storeTerritoryCode}
                onChange={(e) => {
                  const next =
                    e.target.value === 'wa' || e.target.value === 'or' ? e.target.value : 'or';
                  setStoreTerritoryCode(next);
                  setBriefingRegion('ALL');
                  setBriefingCity('ALL');
                  setBriefingChannel('ALL');
                }}
                disabled={prepBusy || loading}
                aria-label="Territory"
              >
                {OGR_BRIEFING_TERRITORIES.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.label}
                  </option>
                ))}
              </Select>
              <label className="sr-only" htmlFor="briefing-region">
                Region
              </label>
              <Select
                id="briefing-region"
                className="w-auto min-w-[10rem]"
                value={briefingRegion}
                onChange={(e) => {
                  setBriefingRegion(e.target.value);
                  setBriefingCity('ALL');
                }}
                disabled={prepBusy || loading || opsOptions.length === 0}
                aria-label="Region"
              >
                {briefingRegionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <label className="sr-only" htmlFor="briefing-city">
                City
              </label>
              <Select
                id="briefing-city"
                className="w-auto min-w-[8rem]"
                value={briefingCity}
                onChange={(e) => setBriefingCity(e.target.value)}
                disabled={prepBusy || loading}
                aria-label="City"
              >
                <option value="ALL">All cities</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </Select>
              <label className="sr-only" htmlFor="briefing-channel">
                Channel
              </label>
              <Select
                id="briefing-channel"
                className="w-auto min-w-[10rem]"
                value={briefingChannel}
                onChange={(e) => setBriefingChannel(e.target.value)}
                disabled={prepBusy || loading}
                aria-label="Channel"
              >
                {CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <label className="sr-only" htmlFor="briefing-prep-limit">
                Prep limit
              </label>
              <Input
                id="briefing-prep-limit"
                type="number"
                min={1}
                max={REGIONAL_PREP_MAX_LIMIT}
                className="w-16"
                value={prepLimit}
                onChange={(e) => setPrepLimit(clampPrepLimit(Number(e.target.value)))}
                disabled={prepBusy || loading}
                aria-label="Prep limit"
              />
              <Button
                type="button"
                onClick={() => void runPrepNow()}
                disabled={prepBusy || loading || !resolvedOpsTerritoryId || runPrepBatchSize === 0}
              >
                {prepBusy
                  ? 'Running prep…'
                  : runPrepBatchSize === 0
                    ? 'Run prep now (0)'
                    : `Run prep now (${runPrepBatchSize})`}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {loading && <p className="text-ink/60 m-0 text-sm">Loading briefing…</p>}
      {error && <p className="text-accent-800 m-0 text-sm">Could not load briefing: {error}</p>}
      {prepMessage && <p className="text-ink/70 m-0 text-sm">{prepMessage}</p>}
      {composerError && <p className="text-accent-800 m-0 text-sm">{composerError}</p>}

      {briefing && (
        <>
          <Card
            className={
              prep?.status === 'failed' || prep?.status === 'partial'
                ? 'border-accent-300 bg-accent-50/40'
                : prep?.status === 'missing'
                  ? 'border-ink/15 bg-bg'
                  : 'border-emerald-200 bg-emerald-50/40'
            }
          >
            <CardKicker>Prep · {briefing.sellingDate}</CardKicker>
            <CardTitle className="text-[16px]">{prep?.message}</CardTitle>
            <CardMeta>
              As of {briefing.asOfDate}
              {prep?.run
                ? ` · capacity ${prep.run.capacity} · pending before ${prep.run.pendingBefore} · produced ${prep.run.producedCount}`
                : null}
              {briefing.regionalPool && briefingRegion !== 'ALL' ? (
                <>
                  <br />
                  {formatRegionalPoolMessage(
                    briefing.regionalPool,
                    briefingRegionOptions.find((o) => o.value === briefingRegion)?.label ??
                      briefingRegion,
                  )}
                </>
              ) : briefing.regionalPool ? (
                <>
                  <br />
                  {formatRegionalPoolMessage(
                    briefing.regionalPool,
                    storeTerritoryCode === 'wa' ? 'Washington' : 'Oregon',
                  )}
                </>
              ) : null}
            </CardMeta>
          </Card>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <Card>
              <CardKicker>Monthly target</CardKicker>
              <CardTitle className="text-2xl">{goal?.monthlyTarget ?? '—'}</CardTitle>
            </Card>
            <Card>
              <CardKicker>MTD Active Accounts</CardKicker>
              <CardTitle className="text-2xl">{goal?.mtdAccounts ?? '—'}</CardTitle>
            </Card>
            <Card>
              <CardKicker>Remaining goal</CardKicker>
              <CardTitle className="text-2xl">{goal?.remainingGoal ?? '—'}</CardTitle>
            </Card>
            <Card>
              <CardKicker>Recommended sends today</CardKicker>
              <CardTitle className="text-2xl">{goal?.recommendedDailySends ?? '—'}</CardTitle>
              <CardMeta>
                {goal?.rateSource ?? ''}
                {goal?.goalMet ? ' · goal met' : ''}
              </CardMeta>
            </Card>
            <Card>
              <CardKicker>Projected attainment</CardKicker>
              <CardTitle className="text-2xl">
                {goal ? Math.round(goal.projectedAttainment * 10) / 10 : '—'}
              </CardTitle>
            </Card>
          </div>

          <Card>
            <CardTitle className="text-[15px]">Outreach queue — research email</CardTitle>
            <CardMeta className="mb-2">
              {briefing.identifiedTargets.length} identified · use Research to find a contact email,
              then Run prep on the row · Dismiss if no email can be found
            </CardMeta>
            {rowRunPrepMessage ? (
              <p className="text-accent-800 m-0 mb-2 text-sm" role="status">
                {rowRunPrepMessage}
              </p>
            ) : null}
            {briefing.identifiedTargets.length === 0 ? (
              <p className="text-ink/50 m-0 text-sm">
                No identified accounts for this region yet. Run prep to rank up to 25 accounts.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-ink/50 text-xs uppercase">
                      <th className="border-ink/10 border-b p-2 font-medium">Prospect</th>
                      <th className="border-ink/10 border-b p-2 font-medium">Product</th>
                      <th className="border-ink/10 border-b p-2 font-medium">Channel</th>
                      <th className="border-ink/10 border-b p-2 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {briefing.identifiedTargets.map((t) => {
                      const rowKey = `${t.prospectId}-${t.catalogItemId}`;
                      const rowBusy = rowRunPrepBusyKey === rowKey;
                      const dismissBusy = rowDismissBusyId === t.prospectId;
                      const anyRowBusy = Boolean(rowRunPrepBusyKey) || Boolean(rowDismissBusyId);
                      const canRunPrep = t.hasUsableEmail;
                      return (
                        <tr key={rowKey} className="hover:bg-bg/80">
                          <td className="border-ink/[0.06] border-b p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="text-accent-800 font-medium hover:underline"
                                onClick={() =>
                                  openBriefingStore({
                                    prospectId: t.prospectId,
                                    accountStatus: 'prospect',
                                  })
                                }
                              >
                                {t.prospectName}
                              </button>
                              <button
                                type="button"
                                className="text-ink/55 hover:text-accent-800 text-xs hover:underline"
                                onClick={() =>
                                  openBriefingStore({
                                    prospectId: t.prospectId,
                                    accountStatus: 'prospect',
                                    openResearch: true,
                                  })
                                }
                              >
                                Research
                              </button>
                              <button
                                type="button"
                                className="text-ink/55 hover:text-accent-800 text-xs hover:underline disabled:opacity-50"
                                disabled={
                                  rowBusy || anyRowBusy || !resolvedOpsTerritoryId || !canRunPrep
                                }
                                title={
                                  canRunPrep
                                    ? 'Create a prep draft with the contact email on file'
                                    : 'Add a contact email (Research) before Run prep'
                                }
                                onClick={() =>
                                  void runIdentifiedTargetPrep({
                                    prospectId: t.prospectId,
                                    catalogItemId: t.catalogItemId,
                                    prospectName: t.prospectName,
                                  })
                                }
                              >
                                {rowBusy ? 'Running…' : 'Run prep'}
                              </button>
                              <button
                                type="button"
                                className="text-ink/55 hover:text-accent-800 text-xs hover:underline disabled:opacity-50"
                                disabled={dismissBusy || anyRowBusy}
                                aria-label={
                                  dismissBusy
                                    ? `Dismissing ${t.prospectName} from research queue`
                                    : `Dismiss ${t.prospectName} from research queue`
                                }
                                onClick={() =>
                                  void dismissResearchQueueRow({ prospectId: t.prospectId })
                                }
                              >
                                {dismissBusy ? 'Dismissing…' : 'Dismiss'}
                              </button>
                            </div>
                          </td>
                          <td className="border-ink/[0.06] border-b p-2">{t.productName}</td>
                          <td className="border-ink/[0.06] border-b p-2">
                            {t.primaryChannel ? primaryRetailChannelLabel(t.primaryChannel) : '—'}
                          </td>
                          <td className="border-ink/[0.06] border-b p-2">
                            {t.hasUsableEmail ? (
                              <span className="text-ink/60">On file</span>
                            ) : (
                              <span className="text-accent-800">Needs research</span>
                            )}
                            {t.sharedEmailStoreNames.length > 0 ? (
                              <p className="text-ink/45 m-0 mt-1 text-xs">
                                Also on: {t.sharedEmailStoreNames.join(', ')}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle className="text-[15px]">Drafts ready for review</CardTitle>
            <CardMeta className="mb-2">
              {briefing.drafts.length} pending · open a draft and use Add copy for personalized
              intro/closing (prep leaves generic stubs)
              {briefing.drafts.some((d) => d.fromEarlierPrep)
                ? ' · includes drafts from earlier prep'
                : ''}
            </CardMeta>
            {draftDismissMessage ? (
              <p className="text-ink/60 m-0 mb-2 text-sm" role="status">
                {draftDismissMessage}
              </p>
            ) : null}
            {briefing.drafts.length === 0 ? (
              <p className="text-ink/50 m-0 text-sm">No pending drafts.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-ink/50 text-xs uppercase">
                      <th className="border-ink/10 border-b p-2 font-medium">Prospect</th>
                      <th className="border-ink/10 border-b p-2 font-medium">Product</th>
                      <th className="border-ink/10 border-b p-2 font-medium">Channel</th>
                      <th className="border-ink/10 border-b p-2 font-medium">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {briefing.drafts.map((d) => {
                      const dismissBusy = draftDismissBusyId === d.draftId;
                      return (
                        <tr key={d.draftId} className="hover:bg-bg/80">
                          <td className="border-ink/[0.06] border-b p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="text-accent-800 font-medium hover:underline"
                                onClick={() =>
                                  openBriefingStore({
                                    prospectId: d.prospectId,
                                    accountStatus: d.accountStatus ?? 'prospect',
                                  })
                                }
                              >
                                {d.prospectName}
                              </button>
                              {d.fromEarlierPrep ? (
                                <span className="text-ink/45 text-xs">from earlier prep</span>
                              ) : null}
                              <button
                                type="button"
                                className="text-ink/55 hover:text-accent-800 text-xs hover:underline"
                                onClick={() =>
                                  openBriefingStore({
                                    prospectId: d.prospectId,
                                    accountStatus: d.accountStatus ?? 'prospect',
                                    openResearch: true,
                                  })
                                }
                              >
                                Research
                              </button>
                              <button
                                type="button"
                                className="text-ink/55 hover:text-accent-800 text-xs hover:underline disabled:opacity-50"
                                disabled={dismissBusy || Boolean(draftDismissBusyId)}
                                aria-label={
                                  dismissBusy
                                    ? `Dismissing draft for ${d.prospectName}`
                                    : `Dismiss draft for ${d.prospectName}`
                                }
                                onClick={() =>
                                  void dismissDraftRow({
                                    draftId: d.draftId,
                                    prospectName: d.prospectName,
                                  })
                                }
                              >
                                {dismissBusy ? 'Dismissing…' : 'Dismiss'}
                              </button>
                            </div>
                          </td>
                          <td className="border-ink/[0.06] border-b p-2">
                            <button
                              type="button"
                              className="text-accent-800 hover:underline"
                              onClick={() =>
                                void openDraftReview({
                                  draftId: d.draftId,
                                  catalogItemId: d.catalogItemId,
                                  productName: d.productName,
                                  prospectName: d.prospectName,
                                })
                              }
                            >
                              {d.productName}{' '}
                              <span className="text-ink/45 text-xs">({d.productSku})</span>
                            </button>
                          </td>
                          <td className="border-ink/[0.06] border-b p-2 text-xs">
                            {d.primaryChannel ? primaryRetailChannelLabel(d.primaryChannel) : '—'}
                          </td>
                          <td className="border-ink/[0.06] border-b p-2 text-xs">{d.toEmail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {briefing.channelAllocation && (
            <Card>
              <CardTitle className="text-[15px]">Channel allocation</CardTitle>
              <CardMeta className="mb-2">
                From last prep run
                {briefing.channelAllocation.meta?.weightSource === 'measured'
                  ? ' · measured conversion weights'
                  : briefing.channelAllocation.meta?.weightSource === 'uniform'
                    ? briefing.adaptiveWeightsEnabled
                      ? ' · even rotation (insufficient data)'
                      : ' · even rotation (adaptive weights off)'
                    : ' (informational)'}
              </CardMeta>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm">
                {Object.entries(briefing.channelAllocation.slotsByChannel)
                  .filter(([, n]) => n > 0)
                  .map(([ch, n]) => (
                    <li key={ch} className="bg-bg rounded-md px-2.5 py-1">
                      {primaryRetailChannelLabel(ch)}: <strong>{n}</strong>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <TopLeadsQuickView
            callToday={briefing.callToday ?? []}
            hotCount={(briefing.hot ?? []).length}
            warm={briefing.warm ?? []}
            recentEngagement={briefing.recentEngagement ?? []}
            followUpsById={followUpsById}
            emailBusyId={emailBusyId}
            onOpenProspect={openBriefingStore}
            onFollowUpAction={(row) => void handleFollowUpAction(row)}
          />

          <FollowUpQueue
            rows={briefing.followUps ?? []}
            emailBusyId={emailBusyId}
            snoozeBusyId={snoozeBusyId}
            onAction={(row) => void handleFollowUpAction(row)}
            onLogCall={(row) => void handleFollowUpLogCall(row)}
            onSnooze={(row) => void handleFollowUpSnooze(row)}
          />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
            <Card>
              <CardTitle className="text-[15px]">Recent conversions (7d)</CardTitle>
              {briefing.recentConversions.length === 0 ? (
                <p className="text-ink/50 m-0 text-sm">No conversions in the last 7 days.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {briefing.recentConversions.map((c) => (
                    <li key={`${c.prospectId}-${c.convertedAt}`}>
                      <button
                        type="button"
                        className="text-accent-800 hover:underline"
                        onClick={() =>
                          openBriefingStore({
                            prospectId: c.prospectId,
                            accountStatus: 'active_account',
                          })
                        }
                      >
                        {c.prospectName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {briefing.performance && (
            <Card>
              <CardTitle className="text-[15px]">Learning slices</CardTitle>
              <CardMeta className="mb-2">
                {briefing.channelAllocation?.meta?.weightSource === 'measured'
                  ? 'Channel allocation, product selection, and prospect ranking use blended conversion rates'
                  : briefing.channelAllocation?.meta?.weightSource === 'uniform'
                    ? briefing.adaptiveWeightsEnabled
                      ? 'Insufficient attributed conversions — even channel rotation, rank-based product picks, and CRM fit-score ranking'
                      : 'Adaptive weights disabled in goals settings — even channel rotation, rank-based product picks, and CRM fit-score ranking'
                    : 'Performance data shown for review — run nightly prep to apply learning weights'}
                {' · '}
                {briefing.leadRules.source === 'measured'
                  ? 'Lead rules calibrated from attributed Warm/Hot performance'
                  : 'Provisional lead rules — insufficient attributed conversions'}
                {briefing.leadRules.adjustedFields.length > 0
                  ? ` · tuned: ${briefing.leadRules.adjustedFields.slice(0, 4).join(', ')}`
                  : ''}
                {' · lookback '}
                {briefing.performance.lookbackDays}d
              </CardMeta>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By channel</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Channel</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byChannel.slice(0, 8).map((s) => (
                        <tr key={s.key}>
                          <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                          <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                          <td className="border-ink/[0.06] border-b p-2">
                            {s.attributedConversions}
                          </td>
                          <td className="border-ink/[0.06] border-b p-2 text-xs">{s.confidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By product</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Product</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byProduct.length === 0 ? (
                        <tr>
                          <td className="border-ink/[0.06] text-ink/60 border-b p-2" colSpan={4}>
                            No product outreach data yet.
                          </td>
                        </tr>
                      ) : (
                        [...briefing.performance.byProduct]
                          .sort(
                            (a, b) =>
                              b.attributedConversions - a.attributedConversions ||
                              b.sends - a.sends,
                          )
                          .slice(0, 6)
                          .map((s) => (
                            <tr key={s.key}>
                              <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                              <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                              <td className="border-ink/[0.06] border-b p-2">
                                {s.attributedConversions}
                              </td>
                              <td className="border-ink/[0.06] border-b p-2 text-xs">
                                {s.confidence}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By fit band</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Fit band</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byFitBand.length === 0 ? (
                        <tr>
                          <td className="border-ink/[0.06] text-ink/60 border-b p-2" colSpan={4}>
                            No fit-band outreach data yet.
                          </td>
                        </tr>
                      ) : (
                        [...briefing.performance.byFitBand]
                          .sort(
                            (a, b) =>
                              b.attributedConversions - a.attributedConversions ||
                              b.sends - a.sends,
                          )
                          .map((s) => (
                            <tr key={s.key}>
                              <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                              <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                              <td className="border-ink/[0.06] border-b p-2">
                                {s.attributedConversions}
                              </td>
                              <td className="border-ink/[0.06] border-b p-2 text-xs">
                                {s.confidence}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <p className="text-ink/50 m-0 mb-2 text-xs uppercase">By lead state</p>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-ink/50 text-xs uppercase">
                        <th className="border-ink/10 border-b p-2 font-medium">Lead state</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Sends</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Attributed</th>
                        <th className="border-ink/10 border-b p-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {briefing.performance.byLeadState.length === 0 ? (
                        <tr>
                          <td className="border-ink/[0.06] text-ink/60 border-b p-2" colSpan={4}>
                            No lead-state outreach data yet.
                          </td>
                        </tr>
                      ) : (
                        [...briefing.performance.byLeadState]
                          .sort(
                            (a, b) =>
                              b.attributedConversions - a.attributedConversions ||
                              b.sends - a.sends,
                          )
                          .map((s) => (
                            <tr key={s.key}>
                              <td className="border-ink/[0.06] border-b p-2">{s.label}</td>
                              <td className="border-ink/[0.06] border-b p-2">{s.sends}</td>
                              <td className="border-ink/[0.06] border-b p-2">
                                {s.attributedConversions}
                              </td>
                              <td className="border-ink/[0.06] border-b p-2 text-xs">
                                {s.confidence}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {composerProduct && composerDraft ? (
        <OgrProductEmailComposerModal
          open={composerOpen}
          onClose={closeComposer}
          onSent={() => {
            closeComposer();
            setReloadToken((n) => n + 1);
            onProductEmailSent?.();
          }}
          onDraftCancelled={() => {
            closeComposer();
            setReloadToken((n) => n + 1);
          }}
          onDraftSaved={(nextDraft) => {
            setComposerDraft(nextDraft);
          }}
          onProductReplaced={({ item, draft: nextDraft }) => {
            setComposerProduct(item);
            setComposerDraft(nextDraft);
            setBriefing((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                drafts: prev.drafts.map((row) =>
                  row.draftId === nextDraft.id
                    ? {
                        ...row,
                        catalogItemId: item.id,
                        productName: item.name,
                        productSku: item.sku,
                        productSlug: item.publicSlug ?? row.productSlug,
                      }
                    : row,
                ),
              };
            });
          }}
          productId={composerProduct.id}
          productName={composerProduct.name.trim()}
          cardHtml={composerCardHtml}
          draft={composerDraft}
          accountId={composerDraft.prospectId}
          salesLineId={lineCtx.salesLineId}
          lineSlug={lineCtx.lineSlug}
          publicMarket="ca"
        />
      ) : null}

      {drawerError ? (
        <p className="text-danger m-0 text-sm" role="alert">
          {drawerError}
        </p>
      ) : null}

      {detailStore?.accountStatus === 'active_account' ? (
        <AccountDetailDrawer
          account={detailStore}
          initialSection={openResearchForId === detailStore.id ? 'research' : undefined}
          onClose={closeDetails}
          onLogCall={(account) => {
            onLogCall(account);
            closeDetails();
          }}
          onLogOrder={() => {
            closeDetails();
          }}
          onNotesSaved={(notes) => {
            setDetailStore({ ...detailStore, notes });
            onNotesSaved?.(detailStore.id, notes);
          }}
          onTaxonomySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
          onIdentitySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
          onDemoted={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
          onProductEmailSent={onProductEmailSent}
        />
      ) : (
        <ProspectDetailDrawer
          prospect={detailStore}
          initialScrollToResearch={detailStore != null && openResearchForId === detailStore.id}
          onClose={closeDetails}
          onLogCall={(prospect) => {
            onLogCall(prospect);
            closeDetails();
          }}
          onNotesSaved={(notes) => {
            if (!detailStore) return;
            setDetailStore({ ...detailStore, notes });
            onNotesSaved?.(detailStore.id, notes);
          }}
          onTaxonomySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
          onIdentitySaved={(prospect) => {
            setDetailStore(prospect);
            onProspectUpdated?.(prospect);
          }}
        />
      )}
    </section>
  );
}
