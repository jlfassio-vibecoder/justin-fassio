/** Shared Log Call outcome labels. */
export const CALL_OUTCOMES = [
  'Closed PO / Written Order',
  'Sample Package Requested',
  'Follow-up Scheduled',
  'Left Message / Gatekeeper',
  'Not Interested / Bad Fit',
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];
