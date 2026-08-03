import { useMemo, useState } from 'react';
import type { CatalogItem } from '@/lib/catalog';
import {
  DEFAULT_LANDED_COST_FACTORS,
  formatMarginRange,
  type LandedCostFactors,
} from '@/lib/landedCost';

export function useLandedCostCalculator(catalog: CatalogItem[]) {
  const [fx, setFx] = useState(DEFAULT_LANDED_COST_FACTORS.fx);
  const [freightRate, setFreightRate] = useState(DEFAULT_LANDED_COST_FACTORS.freightRate);
  const [gstRate, setGstRate] = useState(DEFAULT_LANDED_COST_FACTORS.gstRate);
  const [otherTaxRate, setOtherTaxRate] = useState(DEFAULT_LANDED_COST_FACTORS.otherTaxRate);

  const factors: LandedCostFactors = useMemo(
    () => ({ fx, freightRate, gstRate, otherTaxRate }),
    [fx, freightRate, gstRate, otherTaxRate],
  );

  const marginRangeDisplay = useMemo(() => formatMarginRange(catalog, factors), [catalog, factors]);

  return {
    fx,
    setFx,
    freightRate,
    setFreightRate,
    gstRate,
    setGstRate,
    otherTaxRate,
    setOtherTaxRate,
    factors,
    marginRangeDisplay,
  };
}
