import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Card, CardBody, CardTitle } from '@/components/ui/Card';
import {
  PLAYBOOK_TAG_MATCH,
  tagCloud,
  type TagCloudItem,
} from '@/lib/callAggregates';
import { fetchCalls } from '@/lib/calls';

interface InsightsTabProps {
  marginRangeDisplay: string;
  reloadToken?: number;
}

function tagStyle(item: TagCloudItem, max: number): CSSProperties {
  const weight = max > 0 ? item.count / max : 0;
  const fontSize = 12 + weight * 10;
  const opacity = 0.55 + weight * 0.45;
  return { fontSize: `${fontSize}px`, opacity };
}

export function InsightsTab({ marginRangeDisplay, reloadToken = 0 }: InsightsTabProps) {
  const [tags, setTags] = useState<TagCloudItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await fetchCalls(500);

      if (!active) return;
      if (error) {
        setTags([]);
        setFetchError(error);
        setLoading(false);
        return;
      }
      setTags(tagCloud(data));
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const maxCount = tags[0]?.count ?? 0;
  const seenCounts = useMemo(() => {
    const map = new Map(tags.map((t) => [t.tag, t.count]));
    return {
      budget: map.get(PLAYBOOK_TAG_MATCH.budget) ?? 0,
      margin: map.get(PLAYBOOK_TAG_MATCH.margin) ?? 0,
    };
  }, [tags]);

  return (
    <section className="flex flex-col gap-5" data-screen-label="insights">
      {loading && <p className="m-0 text-sm text-ink/60">Loading insights…</p>}
      {fetchError && (
        <p className="m-0 text-sm text-accent-800">Could not load calls: {fetchError}</p>
      )}

      <Card>
        <CardTitle className="text-base">Buyer Reaction Cloud</CardTitle>
        {tags.length === 0 ? (
          <p className="mt-1 text-[13px] opacity-70">
            Feedback tags will collect here as calls are logged — spot recurring objections and wins
            at a glance.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            {tags.map((item) => (
              <span
                key={item.tag}
                className="font-heading text-ink"
                style={tagStyle(item, maxCount)}
                title={`${item.count} call${item.count === 1 ? '' : 's'}`}
              >
                {item.tag}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-[15px] text-accent-700">
              Objection: &quot;Our budget is already pre-booked&quot;
            </CardTitle>
            {seenCounts.budget > 0 && (
              <span className="text-[11px] uppercase tracking-wider text-ink/55">
                Seen in calls: {seenCounts.budget}
              </span>
            )}
          </div>
          <CardBody>
            Ship in 72 hours from Vista, CA with flexible 24-piece minimums. Offer a low-risk test
            order or a Father&apos;s Day impulse display tray so the buyer isn&apos;t waiting on next
            season&apos;s plan.
          </CardBody>
        </Card>
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-[15px] text-accent-700">
              Objection: &quot;We need bigger margin to cover FX&quot;
            </CardTitle>
            {seenCounts.margin > 0 && (
              <span className="text-[11px] uppercase tracking-wider text-ink/55">
                Seen in calls: {seenCounts.margin}
              </span>
            )}
          </div>
          <CardBody>
            Suggested CAD MSRP pricing already delivers a keystone margin in the{' '}
            {marginRangeDisplay} range on standard USD wholesale — walk the buyer through the
            landed-cost math live on the call.
          </CardBody>
        </Card>
        <Card>
          <CardTitle className="text-[15px] text-accent-700">
            Objection: &quot;Never heard of this brand&quot;
          </CardTitle>
          <CardBody>
            Lead with the category fit reason from the prospect record — most matches were sourced
            from a real store visit or regional research, not a cold list.
          </CardBody>
        </Card>
      </div>
    </section>
  );
}
