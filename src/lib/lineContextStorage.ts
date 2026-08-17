import type { LineKey } from '@/types';
import type { LineStatus } from '@/types/database';

export const LAST_LINE_SLUG_KEY = 'rcc.lastLineSlug';

export function readLastLineSlug(): LineKey | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_LINE_SLUG_KEY)?.trim().toLowerCase() ?? '';
    if (!raw || raw === 'bkg') return null;
    return raw;
  } catch {
    return null;
  }
}

export function persistLastLineSlug(slug: LineKey): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LAST_LINE_SLUG_KEY, slug);
  } catch {
    // ignore quota / private mode
  }
}

export function lineStatusBadgeLabel(status: LineStatus | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Live';
    case 'onboarding':
      return 'Onboarding';
    case 'confirmed':
      return 'Confirmed';
    default:
      return status ? status : '';
  }
}
