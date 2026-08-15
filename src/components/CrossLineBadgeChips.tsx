import { useEffect, useState } from 'react';
import { Tag } from '@/components/ui/Tag';
import { fetchCrossLineBadges, type CrossLineBadge } from '@/lib/retailerLineAccounts';
import { persistLastLineSlug } from '@/lib/lineContextStorage';
import { isRepresentedLineCode } from '@/lib/lines';
import type { LineKey } from '@/types';

type CrossLineBadgeChipsProps = {
  retailerId: number;
  currentSalesLineId: string | null;
};

/** Empty-safe chips: name + relationship_status only. */
export function CrossLineBadgeChips({ retailerId, currentSalesLineId }: CrossLineBadgeChipsProps) {
  const [badges, setBadges] = useState<CrossLineBadge[]>([]);

  useEffect(() => {
    if (!currentSalesLineId) return;
    let active = true;
    void fetchCrossLineBadges({ retailerId, currentSalesLineId }).then((result) => {
      if (!active) return;
      setBadges(result.error ? [] : result.data);
    });
    return () => {
      active = false;
    };
  }, [retailerId, currentSalesLineId]);

  if (!currentSalesLineId || badges.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badges.map((badge) => (
        <button
          key={`${badge.lineCode}-${badge.relationshipStatus}`}
          type="button"
          className="border-0 bg-transparent p-0"
          title={`${badge.lineName} · ${badge.relationshipStatus}`}
          onClick={() => {
            if (!isRepresentedLineCode(badge.lineCode)) return;
            const slug = badge.lineCode as LineKey;
            persistLastLineSlug(slug);
            window.location.assign(`/app/lines/${slug}`);
          }}
        >
          <Tag variant="outline">Also {badge.lineName}</Tag>
        </button>
      ))}
    </span>
  );
}
