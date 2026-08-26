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
  /** Passed cooldown and product-fit — ready for draft generation today. */
  sendableNow: number;
  excluded: {
    noUsableEmail: number;
    pendingDraft: number;
    cooldown: number;
    contactSuppressed: number;
    noProduct: number;
    other: number;
  };
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
  channelAllocation: AllocateChannelsForDayResult | null;
  callToday: OutreachLeadRow[];
  hot: OutreachLeadRow[];
  warm: OutreachLeadRow[];
  recentEngagement: Array<{
    prospectId: number;
    prospectName: string;
    lastClickedAt: string;
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

export function formatRegionalPoolMessage(
  pool: OutreachPoolDiagnostics,
  regionLabel: string,
): string {
  const parts = [`${pool.inRegion} in ${regionLabel} (same as Prospect Directory)`];
  if (pool.excluded.noUsableEmail > 0) {
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
  if (pool.sendableNow > 0) {
    parts.push(`${pool.sendableNow} ready to draft now`);
  } else if (pool.inRegion > 0) {
    parts.push('0 ready to draft today');
  }
  return parts.join(' · ');
}
