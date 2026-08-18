import { PRIMARY_RETAIL_CHANNELS } from '@/lib/crmRetailTaxonomy';

export const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All regions' },
  { value: 'Okanagan', label: 'Okanagan Valley' },
  { value: 'Shuswap', label: 'Shuswap & Thompson-Nicola' },
  { value: 'Vancouver Island', label: 'Vancouver Island & Gulf Islands' },
  { value: 'Sea-to-Sky', label: 'Sea-to-Sky & Sunshine Coast' },
  { value: 'Kootenays', label: 'Kootenays & Columbia-Shuswap' },
  { value: 'Fraser Valley', label: 'Lower Mainland / Fraser Valley' },
  { value: 'Oregon', label: 'Oregon' },
  { value: 'Washington', label: 'Washington' },
];

export const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Retail Channels' },
  ...PRIMARY_RETAIL_CHANNELS,
];
