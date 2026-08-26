import { PRIMARY_RETAIL_CHANNELS } from '@/lib/crmRetailTaxonomy';
import { REGION_OPTIONS as GEO_REGION_OPTIONS } from '@/lib/geoCatalog';

/** @deprecated Prefer regionOptionsForTerritory from geoCatalog. */
export const REGION_OPTIONS = GEO_REGION_OPTIONS;

export const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Retail Channels' },
  ...PRIMARY_RETAIL_CHANNELS,
];
