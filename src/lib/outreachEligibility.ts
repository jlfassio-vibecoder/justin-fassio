/**
 * Phase 1 hard eligibility, contact pick, and deterministic ranking.
 * Bounce/cooldown/pending-draft signals are query-derived from system_messages (no schema in v1).
 */

import { hasMarker } from '@/lib/accountImport/classification';
import type { AccountContact } from '@/lib/accountContacts';
import {
  coercePrimaryRetailChannel,
  normalizePrimaryChannels,
  type PrimaryRetailChannel,
} from '@/lib/crmRetailTaxonomy';
import { isValidOgrProductEmailRecipient } from '@/lib/ogrProductEmailLimits';
import { AGENT_OUTREACH_COOLDOWN_DAYS } from '@/lib/outreachSelectionConstants';
import { crmChannelFromRetailCategory } from '@/lib/prospectEnrichment/crmChannelFromRetailCategory';
import type { Prospect } from '@/lib/prospects';
import { normalizeSystemMessageEmail } from '@/lib/systemMessages';

export type OutreachExclusionReason =
  | 'not_prospect'
  | 'no_usable_email'
  | 'contact_suppressed'
  | 'cooldown'
  | 'pending_agent_draft'
  | 'email_already_selected'
  | 'prospect_already_selected'
  | 'no_product_in_pool';

export type RankableOutreachProspect = {
  id: number;
  priority: string | null;
  fitScore: number | null;
  provisionalGrade: string | null;
  primaryChannel: PrimaryRetailChannel | null;
  secondaryChannels: PrimaryRetailChannel[];
  lastSentAt: string | null;
};

const PRIORITY_ORDER: Record<string, number> = {
  'Tier 1': 0,
  'Tier 2': 1,
  'Tier 3': 2,
};

function priorityRank(priority: string | null | undefined): number {
  if (!priority) return 99;
  return PRIORITY_ORDER[priority] ?? 50;
}

function provisionalGradeRank(grade: string | null | undefined): number {
  if (!grade?.trim()) return 99;
  const letter = grade.trim().charAt(0).toUpperCase();
  if (letter === 'A') return 0;
  if (letter === 'B') return 1;
  if (letter === 'C') return 2;
  return 50;
}

/** Resolve primary + secondary channels; coerce category first, else map retail_category. */
export function resolveProspectOutreachChannels(prospect: {
  category?: string | null;
  retailCategory?: string | null;
  secondaryChannels?: readonly string[] | null;
}): {
  primaryChannel: PrimaryRetailChannel | null;
  secondaryChannels: PrimaryRetailChannel[];
  allChannels: PrimaryRetailChannel[];
} {
  let primary: PrimaryRetailChannel | null = null;
  const rawCategory = prospect.category?.trim();
  if (rawCategory) {
    primary = coercePrimaryRetailChannel(rawCategory);
  } else {
    primary = crmChannelFromRetailCategory(prospect.retailCategory);
  }

  const secondary = normalizePrimaryChannels(prospect.secondaryChannels ?? []).filter(
    (ch) => ch !== primary,
  );
  const allChannels = normalizePrimaryChannels([...(primary ? [primary] : []), ...secondary]);

  return { primaryChannel: primary, secondaryChannels: secondary, allChannels };
}

/**
 * Prefer primary contact with valid email; else buyer; else first remaining with valid email.
 * Contacts should already be ordered is_primary DESC, full_name ASC when loaded.
 */
export function pickOutreachContact(
  contacts: AccountContact[],
): { contact: AccountContact; toEmail: string } | null {
  const usable = contacts
    .map((contact) => {
      const email = contact.email?.trim() ?? '';
      if (!email || !isValidOgrProductEmailRecipient(email)) return null;
      return { contact, toEmail: normalizeSystemMessageEmail(email) };
    })
    .filter((row): row is { contact: AccountContact; toEmail: string } => row != null);

  if (usable.length === 0) return null;

  const primary = usable.find((row) => row.contact.isPrimary);
  if (primary) return primary;

  const buyer = usable.find((row) => row.contact.role === 'buyer');
  if (buyer) return buyer;

  return usable[0] ?? null;
}

export function isWithinOutreachCooldown(
  lastSentAt: string | null | undefined,
  options: { asOf?: Date; cooldownDays?: number } = {},
): boolean {
  if (!lastSentAt) return false;
  const cooldownDays = options.cooldownDays ?? AGENT_OUTREACH_COOLDOWN_DAYS;
  const asOf = options.asOf ?? new Date();
  const sent = Date.parse(lastSentAt);
  if (!Number.isFinite(sent)) return false;
  const windowMs = cooldownDays * 24 * 60 * 60 * 1000;
  return asOf.getTime() - sent < windowMs;
}

/** Channel match cost: 0 when prospect channel is in today's allocation order set, else 1. */
export function channelMatchCost(
  prospectChannels: PrimaryRetailChannel[],
  allocatedChannels: ReadonlySet<PrimaryRetailChannel> | readonly PrimaryRetailChannel[],
): number {
  const set = allocatedChannels instanceof Set ? allocatedChannels : new Set(allocatedChannels);
  if (set.size === 0) return 1;
  return prospectChannels.some((ch) => set.has(ch)) ? 0 : 1;
}

/**
 * Deterministic ascending sort tuple among hard-eligible prospects.
 * Lower is better.
 */
export function compareOutreachProspectRank(
  a: RankableOutreachProspect,
  b: RankableOutreachProspect,
  options: {
    allocatedChannels: ReadonlySet<PrimaryRetailChannel> | readonly PrimaryRetailChannel[];
  },
): number {
  const channelA = channelMatchCost(
    normalizePrimaryChannels([
      ...(a.primaryChannel ? [a.primaryChannel] : []),
      ...a.secondaryChannels,
    ]),
    options.allocatedChannels,
  );
  const channelB = channelMatchCost(
    normalizePrimaryChannels([
      ...(b.primaryChannel ? [b.primaryChannel] : []),
      ...b.secondaryChannels,
    ]),
    options.allocatedChannels,
  );

  const fitA = a.fitScore;
  const fitB = b.fitScore;
  const fitCmp =
    fitA == null && fitB == null ? 0 : fitA == null ? 1 : fitB == null ? -1 : fitB - fitA;

  const sentA = a.lastSentAt ? Date.parse(a.lastSentAt) : Number.NEGATIVE_INFINITY;
  const sentB = b.lastSentAt ? Date.parse(b.lastSentAt) : Number.NEGATIVE_INFINITY;

  return (
    priorityRank(a.priority) - priorityRank(b.priority) ||
    fitCmp ||
    provisionalGradeRank(a.provisionalGrade) - provisionalGradeRank(b.provisionalGrade) ||
    channelA - channelB ||
    sentA - sentB ||
    a.id - b.id
  );
}

export function prospectPassesAccountStatus(prospect: Pick<Prospect, 'accountStatus'>): boolean {
  return prospect.accountStatus === 'prospect';
}

/**
 * Hard account-status gate for the nightly outreach pool.
 * Prospects stay eligible; owner-opted reactivation rows are active_account.
 * Inactive stays excluded.
 */
export function prospectPassesOutreachPool(prospect: Pick<Prospect, 'accountStatus'>): boolean {
  if (prospect.accountStatus === 'inactive') return false;
  return prospect.accountStatus === 'prospect' || prospect.accountStatus === 'active_account';
}

/** OGR RLA rows that may enter loadProspectAccounts. */
export function isRlaInOutreachPool(row: {
  relationshipStatus: string;
  markers?: readonly string[] | null;
}): boolean {
  if (row.relationshipStatus === 'prospect') return true;
  if (row.relationshipStatus !== 'opened') return false;
  if (hasMarker(row.markers, 'reactivation_unresponsive')) return false;
  return (
    hasMarker(row.markers, 'reactivation_candidate') && hasMarker(row.markers, 'outreach_eligible')
  );
}
