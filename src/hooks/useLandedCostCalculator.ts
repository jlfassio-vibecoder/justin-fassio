import { useMemo, useState } from 'react';
import type { CatalogItem } from '@/lib/catalog';
import { formatMarginRange } from '@/lib/landedCost';

export function useLandedCostCalculator(catalog: CatalogItem[]) {
  const [fx, setFx] = useState(1.45);
  const [freight, setFreight] = useState(1.1);

  const marginRangeDisplay = useMemo(
    () => formatMarginRange(catalog, fx, freight),
    [catalog, fx, freight],
  );

  return { fx, setFx, freight, setFreight, marginRangeDisplay };
}
