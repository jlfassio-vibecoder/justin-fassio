import { useMemo, useState } from 'react';
import { CATALOG_DATA } from '@/data/catalog';

export function useLandedCostCalculator() {
  const [fx, setFx] = useState(1.45);
  const [freight, setFreight] = useState(1.1);

  const marginRangeDisplay = useMemo(() => {
    const sellable = CATALOG_DATA.filter((it) => it.msrpCad > 0);
    if (!sellable.length) return '—';
    const margins = sellable.map((it) => ((it.msrpCad - it.priceUsd * fx * freight) / it.msrpCad) * 100);
    return `${Math.min(...margins).toFixed(1)}% – ${Math.max(...margins).toFixed(1)}%`;
  }, [fx, freight]);

  return { fx, setFx, freight, setFreight, marginRangeDisplay };
}
