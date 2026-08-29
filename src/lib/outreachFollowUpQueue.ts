/**
 * Daily Briefing follow-up queue: emailed accounts (90d) with Call / Email / Watch.
 * Pure ranking over Phase 3 lead rows — no DB, no Resend.
 */

import { isWithinOutreachCooldown } from '@/lib/outreachEligibility';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import type { OutreachLeadRules } from '@/lib/outreachLeadRules';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';
import type { OutreachMessageRow } from '@/lib/outreachEngagementAggregate';

export const FOLLOW_UP_WATCH_DAYS = 7;
/** Include prospects with a product outreach send in this many days. */
export const FOLLOW_UP_EMAILED_WINDOW_DAYS = 90;
/** Max rows returned to Briefing (server assemble). */
export const FOLLOW_UP_QUEUE_LIMIT = 500;
/** Visible rows before the Briefing list scrolls. */
export const FOLLOW_UP_QUEUE_VISIBLE = 15;

export type OutreachFollowUpAction = 'call' | 'email' | 'watch';

export type OutreachFollowUpRow = {
  prospectId: number;
  prospectName: string;
  accountStatus: OutreachLeadRow['accountStatus'];
  leadState: OutreachLeadRow['leadState'];
  recommendedAction: OutreachFollowUpAction;
  reasonLine: string;
  talkTrackHint: string | null;
  lastEngagedAt: string | null;
  lastOpenedAt: string | null;
  lastSentAt: string | null;
  lastProductName: string | null;
  lastProductId: string | null;
  score: number;
  followUpOverdueDays: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a >= b ? a : b;
}

function daysBetween(iso: string | null | undefined, asOf: Date): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (asOf.getTime() - ms) / MS_PER_DAY;
}

/** Catalog item on the most recently opened or clicked message. */
export function lastEngagedCatalogItemIdFromMessages(
  messages: OutreachMessageRow[],
): string | null {
  let bestId: string | null = null;
  let bestAt: string | null = null;
  for (const m of messages) {
    const at = maxIso(m.last_clicked_at, m.last_opened_at);
    if (!at) continue;
    if (!bestAt || at > bestAt) {
      bestAt = at;
      bestId =
        typeof m.catalog_item_id === 'string' && m.catalog_item_id.trim()
          ? m.catalog_item_id
          : null;
    }
  }
  if (bestId) return bestId;
  let lastSentAt: string | null = null;
  let lastSentId: string | null = null;
  for (const m of messages) {
    if (!m.sent_at) continue;
    if (!lastSentAt || m.sent_at > lastSentAt) {
      lastSentAt = m.sent_at;
      lastSentId =
        typeof m.catalog_item_id === 'string' && m.catalog_item_id.trim()
          ? m.catalog_item_id
          : null;
    }
  }
  return lastSentId;
}

export function lastClickedCatalogItemIdFromMessages(
  messages: OutreachMessageRow[],
): string | null {
  let bestId: string | null = null;
  let bestAt: string | null = null;
  for (const m of messages) {
    if (!m.last_clicked_at) continue;
    if (!bestAt || m.last_clicked_at > bestAt) {
      bestAt = m.last_clicked_at;
      bestId =
        typeof m.catalog_item_id === 'string' && m.catalog_item_id.trim()
          ? m.catalog_item_id
          : null;
    }
  }
  return bestId;
}

export function countMessagesSentSince(messages: OutreachMessageRow[], sinceIso: string): number {
  return messages.filter((m) => m.sent_at != null && m.sent_at >= sinceIso).length;
}

export function clickOrReplyInLeadWindow(input: {
  lastClickedAt: string | null;
  replyAttributed: boolean;
  replyLastMessageAt: string | null;
  asOf: Date;
  rules?: OutreachLeadRules;
}): boolean {
  const rules = input.rules ?? OUTREACH_LEAD_RULES;
  const windowDays = Math.max(rules.hotWindowDays, rules.warmWindowDays);
  const clickAge = daysBetween(input.lastClickedAt, input.asOf);
  if (clickAge != null && clickAge <= windowDays) return true;
  if (!input.replyAttributed) return false;
  const replyAge = daysBetween(input.replyLastMessageAt, input.asOf);
  return replyAge != null && replyAge <= windowDays;
}

export function canGenerateFollowUpEmail(input: {
  inCooldown: boolean;
  clickOrReplyInWindow: boolean;
  emailsSentInWindow: number;
  hasPendingDraft: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (input.hasPendingDraft) return { ok: true };
  if (input.emailsSentInWindow >= 2) {
    return { ok: false, error: 'Already sent a follow-up in this engagement window' };
  }
  if (input.inCooldown && !input.clickOrReplyInWindow) {
    return { ok: false, error: 'Cooldown is still in effect until a click or reply' };
  }
  return { ok: true };
}

export function resolveFollowUpProductId(input: {
  selectedCatalogItemId: string | null;
  lastClickedCatalogItemId: string | null;
  lastSentCatalogItemId: string | null;
}): { catalogItemId: string; bumped: boolean } | null {
  if (input.selectedCatalogItemId) {
    return { catalogItemId: input.selectedCatalogItemId, bumped: false };
  }
  const bump = input.lastClickedCatalogItemId ?? input.lastSentCatalogItemId;
  if (bump) return { catalogItemId: bump, bumped: true };
  return null;
}

function signalAt(lead: OutreachLeadRow): string | null {
  return maxIso(
    lead.engagement.lastClickedAt,
    maxIso(lead.engagement.lastOpenedAt, lead.engagement.reply.lastMessageAt),
  );
}

function withinWatchWindow(lead: OutreachLeadRow, asOf: Date): boolean {
  const age = daysBetween(lead.engagement.lastEngagementAt, asOf);
  return age != null && age <= FOLLOW_UP_WATCH_DAYS;
}

function engagementAfterCall(lead: OutreachLeadRow, lastCallAt: string): boolean {
  const signal = signalAt(lead);
  return Boolean(signal && signal > lastCallAt);
}

/** True when the prospect received a product outreach send within the emailed window. */
export function emailedWithinFollowUpWindow(
  lead: OutreachLeadRow,
  asOf: Date,
  windowDays: number = FOLLOW_UP_EMAILED_WINDOW_DAYS,
): boolean {
  const age = daysBetween(lead.engagement.lastSentAt, asOf);
  return age != null && age <= windowDays;
}

function warmOrWatchAction(input: {
  lead: OutreachLeadRow;
  asOf: Date;
  rules: OutreachLeadRules;
  hasPendingDraft: boolean;
}): OutreachFollowUpAction | null {
  const { lead } = input;
  const inCooldown = isWithinOutreachCooldown(lead.engagement.lastSentAt, { asOf: input.asOf });
  const exception = clickOrReplyInLeadWindow({
    lastClickedAt: lead.engagement.lastClickedAt,
    replyAttributed: lead.engagement.reply.attributed,
    replyLastMessageAt: lead.engagement.reply.lastMessageAt,
    asOf: input.asOf,
    rules: input.rules,
  });
  const generateOk = canGenerateFollowUpEmail({
    inCooldown,
    clickOrReplyInWindow: exception,
    emailsSentInWindow: lead.emailsSentInWindow ?? 0,
    hasPendingDraft: input.hasPendingDraft,
  });

  if (lead.leadState === 'warm') {
    return generateOk.ok ? 'email' : 'watch';
  }
  if (lead.leadState === 'cold' && withinWatchWindow(lead, input.asOf)) {
    return 'watch';
  }
  return null;
}

function baseRecommendedAction(input: {
  lead: OutreachLeadRow;
  asOf: Date;
  rules: OutreachLeadRules;
  hasPendingDraft: boolean;
}): OutreachFollowUpAction | null {
  const { lead } = input;
  if (lead.engagement.suppressed) return null;
  if (lead.callToday) return 'call';
  return warmOrWatchAction(input);
}

function applyWorkedTodaySuppression(input: {
  lead: OutreachLeadRow;
  action: OutreachFollowUpAction;
  asOf: Date;
  rules: OutreachLeadRules;
  hasPendingDraft: boolean;
}): OutreachFollowUpAction | null {
  if (input.action !== 'call') return input.action;
  const lastCallAt = input.lead.lastCallAtToday;
  if (!lastCallAt) return input.action;
  if (engagementAfterCall(input.lead, lastCallAt)) return input.action;
  return warmOrWatchAction(input);
}

function recommendedAction(input: {
  lead: OutreachLeadRow;
  asOf: Date;
  rules: OutreachLeadRules;
  hasPendingDraft: boolean;
}): OutreachFollowUpAction | null {
  const action = baseRecommendedAction(input);
  if (!action) return null;
  return applyWorkedTodaySuppression({ ...input, action });
}

export function buildFollowUpTalkTrackHint(
  lead: OutreachLeadRow,
  productName: string | null,
): string | null {
  const product = productName?.trim() || 'the product';
  if (lead.callTodayReasons.includes('attributed_reply')) {
    return `They replied recently — confirm interest in ${product}.`;
  }
  if (lead.engagement.maxClickCountOnMessage >= 2 || lead.engagement.clickCount >= 2) {
    return `They clicked ${product} more than once — ask what caught their eye.`;
  }
  if (lead.engagement.clickCount === 1) {
    return `They clicked ${product} — offer sizing and availability.`;
  }
  if (
    lead.callTodayReasons.includes('follow_up_due_today') ||
    lead.callTodayReasons.includes('follow_up_overdue')
  ) {
    return 'Follow-up scheduled — check in on your last conversation.';
  }
  if (lead.callTodayReasons.includes('hot_intent')) {
    return `Hot intent on ${product} — lead with what they viewed online.`;
  }
  return null;
}

function reasonLine(lead: OutreachLeadRow, productName: string | null): string {
  const parts: string[] = [];
  if (lead.callTodayReasons.includes('attributed_reply')) parts.push('Replied');
  if (lead.callTodayReasons.includes('hot_intent')) parts.push('Hot intent');
  if (lead.callTodayReasons.includes('follow_up_overdue')) {
    const days = lead.followUpOverdueDays ?? 0;
    parts.push(days > 0 ? `Follow-up overdue · ${days}d` : 'Follow-up overdue');
  } else if (lead.callTodayReasons.includes('follow_up_due_today')) {
    parts.push('Follow-up due today');
  }
  if (lead.engagement.clickCount > 0) {
    const n = lead.engagement.distinctProductsClicked;
    parts.push(`${n} product${n === 1 ? '' : 's'} clicked`);
  } else if (lead.engagement.openCount > 0) {
    const n = lead.engagement.distinctProductsOpened;
    parts.push(`${n} product${n === 1 ? '' : 's'} opened`);
  } else if (lead.engagement.emailsSent > 0) {
    parts.push(`${lead.engagement.emailsSent} sent`);
  }
  if (productName?.trim()) parts.push(productName.trim());
  return parts.join(' · ') || 'Engaged recently';
}

function compareFollowUpRows(
  a: { row: OutreachFollowUpRow; lead: OutreachLeadRow },
  b: { row: OutreachFollowUpRow; lead: OutreachLeadRow },
): number {
  const aOpened = Boolean(a.row.lastOpenedAt);
  const bOpened = Boolean(b.row.lastOpenedAt);
  if (aOpened !== bOpened) return aOpened ? -1 : 1;
  if (aOpened && bOpened) {
    const openCmp = (b.row.lastOpenedAt ?? '').localeCompare(a.row.lastOpenedAt ?? '');
    if (openCmp !== 0) return openCmp;
  } else {
    const sentCmp = (b.row.lastSentAt ?? '').localeCompare(a.row.lastSentAt ?? '');
    if (sentCmp !== 0) return sentCmp;
  }
  return a.row.prospectName.localeCompare(b.row.prospectName);
}

export function buildFollowUpQueue(input: {
  leads: OutreachLeadRow[];
  pendingProspectIds?: ReadonlySet<number>;
  snoozedProspectIds?: ReadonlySet<number>;
  productNamesById?: ReadonlyMap<string, string>;
  asOf?: Date;
  rules?: OutreachLeadRules;
  limit?: number;
  emailedWindowDays?: number;
}): OutreachFollowUpRow[] {
  const asOf = input.asOf ?? new Date();
  const rules = input.rules ?? OUTREACH_LEAD_RULES;
  const pending = input.pendingProspectIds ?? new Set<number>();
  const snoozed = input.snoozedProspectIds ?? new Set<number>();
  const names = input.productNamesById ?? new Map<string, string>();
  const limit = input.limit ?? FOLLOW_UP_QUEUE_LIMIT;
  const emailedWindowDays = input.emailedWindowDays ?? FOLLOW_UP_EMAILED_WINDOW_DAYS;

  const byId = new Map<number, { row: OutreachFollowUpRow; lead: OutreachLeadRow }>();

  for (const lead of input.leads) {
    if (lead.accountStatus === 'active_account') continue;
    if (snoozed.has(lead.prospectId)) continue;
    if (lead.engagement.suppressed) continue;
    if (!emailedWithinFollowUpWindow(lead, asOf, emailedWindowDays)) continue;

    const action =
      recommendedAction({
        lead,
        asOf,
        rules,
        hasPendingDraft: pending.has(lead.prospectId),
      }) ?? 'watch';
    const productId = lead.lastEngagedCatalogItemId ?? null;
    const productName = productId ? (names.get(productId) ?? null) : null;
    const row: OutreachFollowUpRow = {
      prospectId: lead.prospectId,
      prospectName: lead.prospectName,
      accountStatus: lead.accountStatus,
      leadState: lead.leadState,
      recommendedAction: action,
      reasonLine: reasonLine(lead, productName),
      talkTrackHint: action === 'call' ? buildFollowUpTalkTrackHint(lead, productName) : null,
      lastEngagedAt: signalAt(lead),
      lastOpenedAt: lead.engagement.lastOpenedAt,
      lastSentAt: lead.engagement.lastSentAt,
      lastProductName: productName,
      lastProductId: productId,
      score: lead.score,
      followUpOverdueDays:
        lead.followUpOverdueDays != null && lead.followUpOverdueDays > 0
          ? lead.followUpOverdueDays
          : null,
    };
    byId.set(lead.prospectId, { row, lead });
  }

  const ranked = [...byId.values()].sort(compareFollowUpRows);

  return ranked.slice(0, limit).map((x) => x.row);
}
