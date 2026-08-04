import { useEffect, useMemo, useState } from 'react';
import type { CatalogItem } from '@/lib/catalog';
import { formatMarginRange, type LandedCostFactors } from '@/lib/landedCost';
import { loadLandedRatesPersistence, saveLandedRatesPersistence } from '@/lib/landedRatesStorage';
import { DEFAULT_KEYSTONE_MARGIN_RATE } from '@/lib/retailPricing';

export function useLandedCostCalculator(catalog: CatalogItem[]) {
  const [initial] = useState(() => loadLandedRatesPersistence());
  const [fx, setFx] = useState(initial.fx);
  const [freightRate, setFreightRate] = useState(initial.freightRate);
  const [gstRate, setGstRate] = useState(initial.gstRate);
  const [otherTaxRate, setOtherTaxRate] = useState(initial.otherTaxRate);
  const [researchBrief, setResearchBrief] = useState<string | null>(initial.brief);
  const [ratesAsOf, setRatesAsOf] = useState<string | null>(initial.asOf);
  const [keystoneMarginRate, setKeystoneMarginRate] = useState(
    initial.keystoneMarginRate ?? DEFAULT_KEYSTONE_MARGIN_RATE,
  );

  const factors: LandedCostFactors = useMemo(
    () => ({ fx, freightRate, gstRate, otherTaxRate }),
    [fx, freightRate, gstRate, otherTaxRate],
  );

  const marginRangeDisplay = useMemo(() => formatMarginRange(catalog, factors), [catalog, factors]);

  useEffect(() => {
    saveLandedRatesPersistence({
      ...factors,
      asOf: ratesAsOf,
      brief: researchBrief,
      keystoneMarginRate,
    });
  }, [factors, ratesAsOf, researchBrief, keystoneMarginRate]);

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
    researchBrief,
    setResearchBrief,
    ratesAsOf,
    setRatesAsOf,
    keystoneMarginRate,
    setKeystoneMarginRate,
    marginRangeDisplay,
  };
}
