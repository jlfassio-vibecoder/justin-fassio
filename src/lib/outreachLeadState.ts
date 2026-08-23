/**
 * Phase 3 lead-state evaluation (Cold / Warm / Hot + Call Today reasons).
 * Pure functions over aggregates — never writes counters or engagement_seen.
 */

import type { ProspectOutreachEngagement } from '@/lib/outreachEngagementAggregate';
import {
  OUTREACH_LEAD_RULES,
  type OutreachLeadRules,
  type OutreachLeadRulesVersion,
} from '@/lib/outreachLeadRules';

export type OutreachLeadState = 'cold' | 'warm' | 'hot';
export type CallTodayReason = 'hot_intent' | 'attributed_reply' | 'follow_up_due';

export type EvaluateLeadStateInput = {
  engagement: ProspectOutreachEngagement;
  followUpDue?: boolean;
  asOf?: Date;
  rules?: OutreachLeadRules;
};

export type EvaluateLeadStateResult = {
  leadState: OutreachLeadState;
  callToday: boolean;
  callTodayReasons: CallTodayReason[];
  score: number;
  rulesVersion: OutreachLeadRulesVersion;
  agedOut: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(iso: string | null, asOf: Date): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (asOf.getTime() - ms) / MS_PER_DAY;
}

/** Recency anchor: most recent of last click, last open, and attributed reply time. */
export function engagementRecencyIso(engagement: ProspectOutreachEngagement): string | null {
  const candidates = [
    engagement.lastClickedAt,
    engagement.lastOpenedAt,
    engagement.reply.attributed ? engagement.reply.lastMessageAt : null,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => {
    const aMs = Date.parse(a);
    const bMs = Date.parse(b);
    if (!Number.isFinite(aMs)) return Number.isFinite(bMs) ? b : a;
    if (!Number.isFinite(bMs)) return a;
    return aMs >= bMs ? a : b;
  });
}

/**
 * Score from aggregate signals using provisional rules.
 * Distinct clicked products get click points; open-only products get capped open points.
 */
export function scoreProspectEngagement(
  engagement: ProspectOutreachEngagement,
  rules: OutreachLeadRules = OUTREACH_LEAD_RULES,
): number {
  let score = 0;

  const openOnlyProducts = Math.max(
    0,
    engagement.distinctProductsOpened - engagement.distinctProductsClicked,
  );
  score += Math.min(openOnlyProducts, rules.openOnlyProductCap) * rules.pointsOpenOnlyProduct;
  score += engagement.distinctProductsClicked * rules.pointsClickedProduct;

  // Repeat-click bonuses need per-message max clicks — carried on engagement via flags
  if (engagement.maxClickCountOnMessage >= 2) {
    score += rules.pointsRepeatClick;
  }
  if (engagement.maxClickCountOnMessage >= 3) {
    score += rules.pointsHeavyRepeatClick;
  }
  if (engagement.distinctProductsClicked >= 2) {
    score += rules.pointsMultiProductClick;
  }
  if (engagement.reply.attributed) {
    score += rules.pointsAttributedReply;
  }

  return score;
}

export function evaluateLeadState(input: EvaluateLeadStateInput): EvaluateLeadStateResult {
  const rules = input.rules ?? OUTREACH_LEAD_RULES;
  const asOf = input.asOf ?? new Date();
  const engagement = input.engagement;
  const score = scoreProspectEngagement(engagement, rules);
  const recencyIso = engagementRecencyIso(engagement);
  const ageDays = daysBetween(recencyIso, asOf);

  const agedOut = ageDays != null && ageDays > rules.agedOutDays;
  const withinWarm = ageDays != null && ageDays <= rules.warmWindowDays;
  const withinHot = ageDays != null && ageDays <= rules.hotWindowDays;

  const hasClickOrReply = engagement.clickCount >= 1 || engagement.reply.attributed;

  let leadState: OutreachLeadState = 'cold';
  if (!agedOut && engagement.emailsSent > 0) {
    if (score >= rules.hotScoreMin && hasClickOrReply && withinHot) {
      leadState = 'hot';
    } else if (score >= rules.warmScoreMin && withinWarm) {
      leadState = 'warm';
    }
  }

  const callTodayReasons: CallTodayReason[] = [];
  if (!engagement.suppressed) {
    if (leadState === 'hot') {
      callTodayReasons.push('hot_intent');
    }
    if (engagement.reply.attributed) {
      const replyAge = daysBetween(engagement.reply.lastMessageAt, asOf);
      if (replyAge != null && replyAge <= rules.replyCallTodayDays) {
        callTodayReasons.push('attributed_reply');
      }
    }
    if (input.followUpDue === true) {
      callTodayReasons.push('follow_up_due');
    }
  }

  return {
    leadState,
    callToday: callTodayReasons.length > 0,
    callTodayReasons,
    score,
    rulesVersion: rules.version,
    agedOut,
  };
}
