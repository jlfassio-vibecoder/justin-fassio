import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { useAiAssist } from '@/hooks/useAiAssist';
import { buildCallDraft, buildObjectionDraft } from '@/lib/aiAssistPrefill';
import {
  filterCalls,
  prospectForCall,
  storeName,
  CALL_CHANNEL_FILTER_OPTIONS,
  type ChannelFilter,
  type OutcomeFilter,
} from '@/lib/callAggregates';
import { fetchCalls, type CallRow } from '@/lib/calls';
import type { Prospect } from '@/lib/prospects';

interface CallsTabProps {
  prospects: Prospect[];
  onLogCall: () => void;
  reloadToken?: number;
}

export function CallsTab({ prospects, onLogCall, reloadToken = 0 }: CallsTabProps) {
  const { openAssist } = useAiAssist();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('All Retail Channels');
  const [outcome, setOutcome] = useState<OutcomeFilter>('All Call Outcomes');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await fetchCalls(500);

      if (!active) return;
      if (error) {
        setCalls([]);
        setFetchError(error);
        setLoading(false);
        return;
      }
      setCalls(data);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const filtered = useMemo(
    () => filterCalls(calls, { search, channel, outcome }, prospects),
    [calls, search, channel, outcome, prospects],
  );

  return (
    <section className="flex flex-col gap-5" data-screen-label="calls">
      <Card row className="flex-wrap items-center gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Search calls by store, contact, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-auto"
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChannelFilter)}
        >
          {CALL_CHANNEL_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}
        >
          <option>All Call Outcomes</option>
          <option>Closed PO</option>
          <option>Sample Requested</option>
          <option>Follow-up Scheduled</option>
          <option>Gatekeeper</option>
          <option>Not Interested</option>
        </Select>
        <Button variant="primary" onClick={onLogCall}>
          <Plus size={16} strokeWidth={2.75} />
          <span>Log New Call</span>
        </Button>
      </Card>

      {loading && <p className="text-ink/60 m-0 text-sm">Loading calls…</p>}

      {fetchError && (
        <p className="text-accent-800 m-0 text-sm">Could not load calls: {fetchError}</p>
      )}

      {!loading && !fetchError && calls.length === 0 && (
        <Card elevation="md" className="items-center gap-3 px-5 py-14 text-center">
          <ListChecks size={36} strokeWidth={2.75} className="text-sage-500" />
          <CardTitle className="text-[19px]">Your pipeline is empty</CardTitle>
          <p className="max-w-[46ch] text-[13px] opacity-70">
            Every call you log — outcome, PMF score, buyer feedback, order value — will build your
            pipeline here, searchable and filterable by channel and outcome.
          </p>
          <Button variant="primary" onClick={onLogCall} className="mt-1">
            Log New Call
          </Button>
        </Card>
      )}

      {!loading && !fetchError && calls.length > 0 && filtered.length === 0 && (
        <Card elevation="md" className="items-center gap-3 px-5 py-10 text-center">
          <CardTitle className="text-[17px]">No calls match these filters</CardTitle>
          <p className="max-w-[40ch] text-[13px] opacity-70">
            Try clearing search or switching channel / outcome back to All.
          </p>
        </Card>
      )}

      {!loading && !fetchError && filtered.length > 0 && (
        <Card elevation="md" className="gap-0 overflow-hidden p-0">
          <ul className="divide-ink/10 m-0 list-none divide-y p-0">
            {filtered.map((call) => {
              const channelLabel = prospectForCall(call, prospects)?.category;
              const tags = (call.objection_tags ?? []).filter(Boolean);
              const name = storeName(call.prospect_id, prospects);
              return (
                <li
                  key={call.id}
                  className="px-4.1 py-3.1 flex flex-wrap items-baseline justify-between gap-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-heading text-ink text-[15px]">{name}</span>
                    <span className="text-ink/70 text-[13px]">
                      {call.outcome}
                      {channelLabel ? ` · ${channelLabel}` : ''}
                      {call.contact_name ? ` · ${call.contact_name}` : ''}
                    </span>
                    {tags.length > 0 ? (
                      <span className="text-ink/55 text-[12px]">{tags.join(' · ')}</span>
                    ) : null}
                  </div>
                  <div className="text-ink/65 flex flex-wrap items-center gap-3 text-[12px]">
                    <span>PMF {call.pmf_score ?? '—'}</span>
                    <span>
                      $
                      {Number(call.order_value_cad ?? 0).toLocaleString('en-CA', {
                        maximumFractionDigits: 0,
                      })}{' '}
                      CAD
                    </span>
                    <span>{call.call_date}</span>
                    <Button
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      onClick={() => {
                        const chips = {
                          prospectId: call.prospect_id,
                          prospectName: name,
                          outcome: call.outcome,
                          objectionTags: tags.length > 0 ? tags : undefined,
                        };
                        openAssist({ chips, draft: buildCallDraft(chips, 'email') });
                      }}
                    >
                      Draft
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      onClick={() => {
                        const chips = {
                          prospectId: call.prospect_id,
                          prospectName: name,
                          objectionTags: tags.length > 0 ? tags : undefined,
                        };
                        openAssist({ chips, draft: buildObjectionDraft(chips) });
                      }}
                    >
                      Coach
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
