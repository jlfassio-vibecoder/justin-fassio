import { Tag } from '@/components/ui/Tag';
import type { CrossLineBadge } from '@/lib/retailerLineAccounts';
import { persistLastLineSlug } from '@/lib/lineContextStorage';
import type { LineKey } from '@/types';

type CrossLineBadgeChipsProps = {
  badges: CrossLineBadge[];
};

/** Empty-safe chips: name + relationship_status only. */
export function CrossLineBadgeChips({ badges }: CrossLineBadgeChipsProps) {
  if (badges.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {badges.map((badge) => (
        <button
          key={`${badge.lineCode}-${badge.relationshipStatus}`}
          type="button"
          className="border-0 bg-transparent p-0"
          title={`${badge.lineName} · ${badge.relationshipStatus}`}
          onClick={() => {
            const slug = badge.lineCode.trim().toLowerCase();
            if (!slug || slug === 'bkg') return;
            persistLastLineSlug(slug as LineKey);
            window.location.assign(`/app/lines/${slug}`);
          }}
        >
          <Tag variant="outline">Also {badge.lineName}</Tag>
        </button>
      ))}
    </span>
  );
}
