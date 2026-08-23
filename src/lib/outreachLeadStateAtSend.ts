/**
 * Evaluate lead state at historical send time for performance denominators.
 * Uses provisional rules to avoid circular dependency with measured calibration.
 */

import {
  aggregateProspectOutreachEngagement,
  anyMessageRecipientSuppressed,
  type OutreachMessageRow,
} from '@/lib/outreachEngagementAggregate';
import { OUTREACH_LEAD_RULES, type OutreachLeadRules } from '@/lib/outreachLeadRules';
import { evaluateLeadState, type OutreachLeadState } from '@/lib/outreachLeadState';

export type SendLeadStateRow = {
  prospectId: number;
  sentAt: string;
};

export function leadStateAtSendTime(params: {
  prospectId: number;
  sentAt: string;
  messages: OutreachMessageRow[];
  rules?: OutreachLeadRules;
}): OutreachLeadState {
  const sentMs = Date.parse(params.sentAt);
  const priorMessages = params.messages.filter((message) => {
    if (!message.sent_at) return false;
    const messageMs = Date.parse(message.sent_at);
    return Number.isFinite(messageMs) && Number.isFinite(sentMs) && messageMs <= sentMs;
  });

  const engagement = aggregateProspectOutreachEngagement({
    prospectId: params.prospectId,
    messages: priorMessages,
    suppressed: anyMessageRecipientSuppressed(priorMessages),
    reply: { attributed: false, confidence: 'none', lastMessageAt: null },
    unlinkedManualIncluded: 0,
  });

  return evaluateLeadState({
    engagement,
    asOf: new Date(params.sentAt),
    rules: params.rules ?? OUTREACH_LEAD_RULES,
  }).leadState;
}

/**
 * Map each send row to lead state at send time using pre-grouped prospect messages.
 */
export function leadStatesAtSendTime(params: {
  sends: SendLeadStateRow[];
  messagesByProspect: ReadonlyMap<number, OutreachMessageRow[]>;
  rules?: OutreachLeadRules;
}): Map<string, OutreachLeadState> {
  const out = new Map<string, OutreachLeadState>();
  for (const send of params.sends) {
    const messages = params.messagesByProspect.get(send.prospectId) ?? [];
    const key = `${send.prospectId}:${send.sentAt}`;
    out.set(
      key,
      leadStateAtSendTime({
        prospectId: send.prospectId,
        sentAt: send.sentAt,
        messages,
        rules: params.rules,
      }),
    );
  }
  return out;
}
