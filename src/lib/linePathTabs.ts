import type { TabKey } from '@/types';

const PATH_TAB_BY_SEGMENT: Record<string, TabKey> = {
  briefing: 'briefing',
  prospects: 'prospects',
  accounts: 'accounts',
  contacts: 'contacts',
  catalog: 'catalog',
  dashboard: 'dashboard',
  territories: 'dashboard',
};

/** Map a trailing path segment under /app/lines/:slug/:segment to a TabKey. */
export function tabFromLinePathSegment(segment: string | undefined): TabKey | undefined {
  if (!segment) return undefined;
  return PATH_TAB_BY_SEGMENT[segment];
}
