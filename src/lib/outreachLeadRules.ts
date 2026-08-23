/**
 * Phase 3 provisional lead-state rules.
 * NOT calibrated against conversion data — Phase 4 may retune.
 * Documented ratio: click product = 5 × open-only product.
 */

export type OutreachLeadRulesVersion = 'v1-provisional' | 'v1-measured';

export const OUTREACH_LEAD_RULES_VERSION: OutreachLeadRulesVersion = 'v1-provisional';

export const OUTREACH_LEAD_RULES_MEASURED_VERSION: OutreachLeadRulesVersion = 'v1-measured';

export type OutreachLeadRules = {
  version: OutreachLeadRulesVersion;
  /** Points per unique product with open only (no click on that product). */
  pointsOpenOnlyProduct: number;
  /** Cap on open-only product points (bot-open dampener). */
  openOnlyProductCap: number;
  /** Points per unique product with ≥1 click. */
  pointsClickedProduct: number;
  /** Bonus when any message has click_count ≥ 2. */
  pointsRepeatClick: number;
  /** Extra bonus when any message has click_count ≥ 3. */
  pointsHeavyRepeatClick: number;
  /** Bonus when ≥2 distinct products were clicked. */
  pointsMultiProductClick: number;
  /** High-confidence attributed reply. */
  pointsAttributedReply: number;
  /** Days since last meaningful engagement for Hot eligibility. */
  hotWindowDays: number;
  /** Days since last meaningful engagement for Warm eligibility. */
  warmWindowDays: number;
  /** Beyond this, state is Cold regardless of historical score. */
  agedOutDays: number;
  /** Minimum score for Warm (inclusive). */
  warmScoreMin: number;
  /** Minimum score for Hot (inclusive). */
  hotScoreMin: number;
  /** Attributed reply counts for Call Today within this many days. */
  replyCallTodayDays: number;
};

/**
 * Default provisional pack. Clicks are weighted materially above opens (~5:1).
 * Opens-only never becomes Hot under evaluateLeadState.
 */
export const OUTREACH_LEAD_RULES: OutreachLeadRules = {
  version: OUTREACH_LEAD_RULES_VERSION,
  pointsOpenOnlyProduct: 1,
  openOnlyProductCap: 3,
  pointsClickedProduct: 5,
  pointsRepeatClick: 3,
  pointsHeavyRepeatClick: 2,
  pointsMultiProductClick: 4,
  pointsAttributedReply: 8,
  hotWindowDays: 7,
  warmWindowDays: 14,
  agedOutDays: 21,
  warmScoreMin: 3,
  hotScoreMin: 10,
  replyCallTodayDays: 3,
};
