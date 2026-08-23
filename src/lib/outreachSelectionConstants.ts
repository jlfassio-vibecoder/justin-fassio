/**
 * Phase 1 agent outreach selection constants.
 * Bounce/complaint suppression and cooldown are query-derived from system_messages (no new schema in v1).
 * Line Sheet bestseller badge remains BEST_SELLER_BADGE_MAX_RANK (32) — do not reuse that for outreach.
 */

export const AGENT_OUTREACH_TOP_RANK_LIMIT = 30;

/** Calendar days since last successful product_outreach sent_at before re-contact. */
export const AGENT_OUTREACH_COOLDOWN_DAYS = 14;

/** Calendar days to avoid re-sending the same catalog item to a prospect. */
export const AGENT_OUTREACH_PRODUCT_DEDUP_DAYS = 90;

/** Prep-day identity for one-target-per-prospect-per-day. */
export const AGENT_OUTREACH_PREP_TZ = 'America/Vancouver';

/** Agent draft statuses that block selecting the same prospect again. */
export const AGENT_OUTREACH_PENDING_DRAFT_STATUSES = ['draft', 'queued', 'scheduled'] as const;

/** Fallback floor used by salesVolumeRankByProductId — keep in sync with wholesaleFilters. */
export const AGENT_OUTREACH_SALES_RANK_FALLBACK_FLOOR = 9000;

/** Minimum sends in lookback before a channel's own conversion rate is trusted for allocation weights. */
export const MIN_CHANNEL_SENDS = 3;

/** Minimum sends in lookback before a product's own conversion rate is trusted for selection weights. */
export const MIN_PRODUCT_SENDS = 3;

/** Minimum sends in lookback before a fit band's own conversion rate is trusted for ranking weights. */
export const MIN_FIT_BAND_SENDS = 3;

/** Minimum sends in lookback before a lead state's own conversion rate is trusted for calibration. */
export const MIN_LEAD_STATE_SENDS = 3;
