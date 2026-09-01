/**
 * Client-safe copy-context summary helpers (no Node / gateway / DB imports).
 * Used by the composer island after AI Add copy.
 */

import { primaryRetailChannelLabel } from '@/lib/crmRetailTaxonomy';

export type OutreachCopyContextFlags = {
  hasWebsiteHost: boolean;
  acceptedNoteCount: number;
  lockedSourceCount: number;
  hasContactRole: boolean;
  hasBriefBullets: boolean;
  hasDirectorySignals: boolean;
  hasPurchaseHistory?: boolean;
};

/** Thin research: no accepted citations and no locked sources (Slice C banner). */
export function isThinOutreachCopyContext(flags: OutreachCopyContextFlags): boolean {
  return flags.acceptedNoteCount === 0 && flags.lockedSourceCount === 0;
}

/** Compact read-only summary for the composer after AI copy. */
export function formatOutreachCopyContextSummary(
  flags: OutreachCopyContextFlags,
  primaryChannel?: string | null,
): string {
  const parts: string[] = [];
  if (flags.hasWebsiteHost) parts.push('website host');
  if (flags.acceptedNoteCount > 0) {
    parts.push(
      `${flags.acceptedNoteCount} research note${flags.acceptedNoteCount === 1 ? '' : 's'}`,
    );
  }
  if (flags.lockedSourceCount > 0) {
    parts.push(
      `${flags.lockedSourceCount} locked source${flags.lockedSourceCount === 1 ? '' : 's'}`,
    );
  }
  if (flags.hasContactRole) parts.push('contact role');
  if (flags.hasBriefBullets) parts.push('research brief');
  if (flags.hasDirectorySignals) parts.push('directory signals');
  if (flags.hasPurchaseHistory) parts.push('purchase history');
  const channel = primaryChannel?.trim();
  if (channel) {
    const label = primaryRetailChannelLabel(channel).trim();
    if (label) parts.push(`channel ${label.toLowerCase()}`);
  }
  if (parts.length === 0) return 'Used: no research context';
  return `Used: ${parts.join(' · ')}`;
}
