import { useMemo, useState } from 'react';
import { CATALOG_DATA } from '@/data/catalog';
import { formatMarginRange } from '@/lib/landedCost';

export function useLandedCostCalculator() {
  const [fx, setFx] = useState(1.45);
  const [freight, setFreight] = useState(1.1);

  const marginRangeDisplay = useMemo(
    () => formatMarginRange(CATALOG_DATA, fx, freight),
    [fx, freight],
  );

  return { fx, setFx, freight, setFreight, marginRangeDisplay };
}
