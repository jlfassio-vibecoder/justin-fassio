import type { AccountStatus } from '@/types/database';
import { CALL_OUTCOMES } from '@/lib/callOutcomes';
import { OBJECTION_TAGS } from '@/lib/objectionCatalog';

/** Log Call UI mode: operational accounts vs prospects. */
export type LogCallMode = 'prospect' | 'account';

export const FOLLOW_UP_SCHEDULED_OUTCOME = 'Follow-up Scheduled';

/** Stable account-mode buyer-feedback values stored in `calls.objection_tags`. */
export const ACCOUNT_FEEDBACK_TAGS = [
  'Happy with assortment',
  'Wants reorder soon',
  'Pricing pressure',
  'Open to new styles',
  'Display / fixture interest',
  'Timing / budget later',
] as const;

export type AccountFeedbackTag = (typeof ACCOUNT_FEEDBACK_TAGS)[number];

/** Outcomes for opened / inactive operational accounts. */
export const ACCOUNT_CALL_OUTCOMES = [
  'Check-in / Relationship',
  'Reorder discussion',
  FOLLOW_UP_SCHEDULED_OUTCOME,
  'Left message',
  'Issue / Service',
  'Not interested now',
] as const;

export type AccountCallOutcome = (typeof ACCOUNT_CALL_OUTCOMES)[number];

/**
 * Account mode for `active_account` and `inactive`.
 * Prospect mode only for `prospect` (no separate qualified status on AccountStatus).
 */
export function resolveLogCallMode(accountStatus: AccountStatus | null | undefined): LogCallMode {
  if (accountStatus === 'active_account' || accountStatus === 'inactive') return 'account';
  return 'prospect';
}

export function logCallTitle(mode: LogCallMode): string {
  return mode === 'account' ? 'Log Call' : 'Log Prospect Call';
}

export function logCallStoreLabel(mode: LogCallMode): string {
  return mode === 'account' ? 'Account' : 'Store prospect';
}

export function outcomesForMode(mode: LogCallMode): readonly string[] {
  return mode === 'account' ? ACCOUNT_CALL_OUTCOMES : CALL_OUTCOMES;
}

export function feedbackTagsForMode(mode: LogCallMode): readonly string[] {
  return mode === 'account' ? ACCOUNT_FEEDBACK_TAGS : OBJECTION_TAGS;
}

export function defaultOutcomeForMode(mode: LogCallMode): string {
  return outcomesForMode(mode)[0] ?? CALL_OUTCOMES[0];
}

export function isFollowUpScheduledOutcome(outcome: string): boolean {
  return outcome === FOLLOW_UP_SCHEDULED_OUTCOME;
}
