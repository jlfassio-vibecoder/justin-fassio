/**
 * Client-safe briefing types and formatters.
 * Keep free of server-only imports (DB, nightly prep, AI gateway, node:fs).
 */

import type { AllocateChannelsForDayResult } from '@/lib/outreachChannelAllocation';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import type { OutreachPerformanceReport } from '@/lib/outreachPerformance';
import type { LeadRuleSource } from '@/lib/outreachLeadRuleCalibration';
import type { OutreachLeadRulesVersion } from '@/lib/outreachLeadRules';

export type OutreachPrepRunStatus = 'running' | 'succeeded' | 'partial' | 'empty_pool' | 'failed';

export type OutreachPoolDiagnostics = {
  /** Accounts in the selected store territory + CRM region (matches Prospect Directory). */
  inRegion: number;
  /** Accounts with a valid OGR outreach email on file. */
  withUsableEmail: number;
  /** Selected and ready for draft generation today (has email, passed cooldown/product-fit). */
  sendableNow: number;
  /** Selected for outreach but still need a contact email (regional prep). */
  queuedWithoutEmail?: number;
  excluded: {
    noUsableEmail: number;
    pendingDraft: number;
    cooldown: number;
    contactSuppressed: number;
    noProduct: number;
    other: number;
  };
};

export type OutreachBriefingIdentifiedTargetRow = {
  prospectId: number;
  prospectName: string;
  catalogItemId: string;
  productName: string;
  productSku: string;
  productSlug: string;
  primaryChannel: string | null;
  needsEmail: boolean;
};

export type OutreachAutomationRunPublic = {
  id: string;
  runDate: string;
  status: OutreachPrepRunStatus;
  trigger: 'cron' | 'manual';
  capacity: number;
  pendingBefore: number;
  netCapacity: number;
  selectedCount: number;
  producedCount: number;
  skippedCount: number;
  failedCount: number;
  shortfall: number;
  reason: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type OutreachBriefingDraftRow = {
  draftId: string;
  prospectId: number;
  prospectName: string;
  catalogItemId: string;
  productName: string;
  productSku: string;
  productSlug: string;
  toEmail: string;
  accountStatus?: string;
  primaryChannel: string | null;
  createdAt: string;
};

export type OutreachBriefingDto = {
  asOfDate: string;
  sellingDate: string;
  prep: {
    run: OutreachAutomationRunPublic | null;
    status: 'missing' | OutreachPrepRunStatus;
    message: string;
  };
  goal: {
    monthlyTarget: number;
    mtdAccounts: number;
    remainingGoal: number;
    projectedAttainment: number;
    recommendedDailySends: number;
    rateSource: string;
    goalMet: boolean;
  };
  drafts: OutreachBriefingDraftRow[];
  /** Regional prep queue: ranked accounts awaiting email research before drafting. */
  identifiedTargets: OutreachBriefingIdentifiedTargetRow[];
  channelAllocation: AllocateChannelsForDayResult | null;
  callToday: OutreachLeadRow[];
  hot: OutreachLeadRow[];
  warm: OutreachLeadRow[];
  recentEngagement: Array<{
    prospectId: number;
    prospectName: string;
    lastEngagedAt: string;
    openCount: number;
    clickCount: number;
  }>;
  recentConversions: Array<{
    prospectId: number;
    prospectName: string;
    convertedAt: string;
  }>;
  performance: OutreachPerformanceReport | null;
  leadRules: {
    source: LeadRuleSource;
    version: OutreachLeadRulesVersion;
    adjustedFields: string[];
  };
  adaptiveWeightsEnabled: boolean;
  /** Regional scope: why directory accounts may not be sendable yet. */
  regionalPool?: OutreachPoolDiagnostics | null;
};

export function identifiedTargetRowsFromSelected(
  targets: Array<{
    prospectId: number;
    prospectName: string;
    catalogItemId: string;
    productName: string;
    productSku: string;
    productSlug: string;
    primaryChannel: string | null;
    needsEmail?: boolean;
  }>,
): OutreachBriefingIdentifiedTargetRow[] {
  return targets.map((t) => ({
    prospectId: t.prospectId,
    prospectName: t.prospectName,
    catalogItemId: t.catalogItemId,
    productName: t.productName,
    productSku: t.productSku,
    productSlug: t.productSlug,
    primaryChannel: t.primaryChannel,
    needsEmail: Boolean(t.needsEmail),
  }));
}

export function parseIdentifiedTargetsFromPrepAllocation(
  allocation: unknown,
): OutreachBriefingIdentifiedTargetRow[] {
  if (!allocation || typeof allocation !== 'object') return [];
  const raw = (allocation as Record<string, unknown>).identifiedTargets;
  if (!Array.isArray(raw)) return [];
  const rows: OutreachBriefingIdentifiedTargetRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.prospectId !== 'number' || !Number.isFinite(r.prospectId)) continue;
    if (typeof r.prospectName !== 'string') continue;
    if (typeof r.catalogItemId !== 'string') continue;
    rows.push({
      prospectId: r.prospectId,
      prospectName: r.prospectName,
      catalogItemId: r.catalogItemId,
      productName: String(r.productName ?? ''),
      productSku: String(r.productSku ?? ''),
      productSlug: String(r.productSlug ?? ''),
      primaryChannel: typeof r.primaryChannel === 'string' ? r.primaryChannel : null,
      needsEmail: Boolean(r.needsEmail),
    });
  }
  return rows;
}

export function formatRegionalPoolMessage(
  pool: OutreachPoolDiagnostics,
  regionLabel: string,
): string {
  const parts = [`${pool.inRegion} in ${regionLabel} (same as Prospect Directory)`];
  if (pool.queuedWithoutEmail && pool.queuedWithoutEmail > 0) {
    parts.push(`${pool.queuedWithoutEmail} queued — research email next`);
  } else if (pool.excluded.noUsableEmail > 0) {
    parts.push(`${pool.excluded.noUsableEmail} need a contact email`);
  }
  if (pool.excluded.pendingDraft > 0) {
    parts.push(`${pool.excluded.pendingDraft} already have a pending draft`);
  }
  if (pool.excluded.cooldown > 0) {
    parts.push(`${pool.excluded.cooldown} emailed recently (cooldown)`);
  }
  if (pool.excluded.noProduct > 0) {
    parts.push(`${pool.excluded.noProduct} lack product-fit in catalog`);
  }
  if (pool.excluded.contactSuppressed > 0) {
    parts.push(`${pool.excluded.contactSuppressed} suppressed`);
  }
  const selected = pool.sendableNow + (pool.queuedWithoutEmail ?? 0);
  if (selected > 0) {
    parts.push(`${selected} selected for outreach`);
    if (pool.sendableNow > 0) {
      parts.push(`${pool.sendableNow} draft-ready now`);
    }
  } else if (pool.inRegion > 0) {
    parts.push('0 selected today');
  }
  return parts.join(' · ');
}
