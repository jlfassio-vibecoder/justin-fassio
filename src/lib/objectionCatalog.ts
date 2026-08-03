/** Shared buyer-feedback tags used in Log Call and AI objection coaching. */
export const OBJECTION_TAGS = [
  'Loves display rack',
  'Seasonal rush fit',
  'Pre-booked budget',
  'Wants higher margin',
] as const;

export type ObjectionTag = (typeof OBJECTION_TAGS)[number];

/** Short catalog list for the agent system prompt (do not invent other tag names). */
export function objectionCatalogBlurb(): string {
  return OBJECTION_TAGS.map((tag) => `"${tag}"`).join(', ');
}
