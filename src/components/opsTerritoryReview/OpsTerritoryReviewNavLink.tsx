import { useEffect, useState } from 'react';
import { fetchOpsTerritoryReviewCount } from '@/lib/operationalTerritories/reviewClient';
import { Tag } from '@/components/ui/Tag';

export function OpsTerritoryReviewNavLink({ reloadToken = 0 }: { reloadToken?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    void fetchOpsTerritoryReviewCount().then((result) => {
      if (!active) return;
      if (result.ok) setCount(result.count);
    });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  return (
    <a
      href="/app/ops-territory-review"
      className="text-ink/80 hover:text-ink inline-flex items-center gap-1.5 no-underline"
    >
      <span>Ops territory review</span>
      {count > 0 ? <Tag variant="accent">{count}</Tag> : null}
    </a>
  );
}
