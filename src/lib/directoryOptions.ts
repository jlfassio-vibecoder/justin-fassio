import { RETAIL_CHANNEL_OPTIONS } from '@/lib/retailChannels';

export const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Regions (6 corridors)' },
  { value: 'Okanagan', label: 'Okanagan Valley' },
  { value: 'Shuswap', label: 'Shuswap & Thompson-Nicola' },
  { value: 'Vancouver Island', label: 'Vancouver Island & Gulf Islands' },
  { value: 'Sea-to-Sky', label: 'Sea-to-Sky & Sunshine Coast' },
  { value: 'Kootenays', label: 'Kootenays & Columbia-Shuswap' },
  { value: 'Fraser Valley', label: 'Lower Mainland / Fraser Valley' },
];

export const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Retail Channels' },
  ...RETAIL_CHANNEL_OPTIONS,
];
