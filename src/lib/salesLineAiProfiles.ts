/**
 * Map lines.ai_profile JSON for staff AI (Phase 4).
 * Missing keys fall back to empty strings — callers must not invent commercial terms.
 */

export type SalesLineAiProfile = {
  persona: string;
  systemPrompt: string;
  apfPrompt: string;
  fillBlanksPrompt: string;
  catalogFilter: string;
  currency: string | null;
  icp: string;
  rubric: string;
  researchNotes: string;
  geoInterest: string;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Parse a lines.ai_profile jsonb value into a typed profile. */
export function mapSalesLineAiProfile(raw: unknown): SalesLineAiProfile {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    persona: asString(obj.persona),
    systemPrompt: asString(obj.systemPrompt),
    apfPrompt: asString(obj.apfPrompt),
    fillBlanksPrompt: asString(obj.fillBlanksPrompt),
    catalogFilter: asString(obj.catalogFilter),
    currency: asCurrency(obj.currency),
    icp: asString(obj.icp),
    rubric: asString(obj.rubric),
    researchNotes: asString(obj.researchNotes),
    geoInterest: asString(obj.geoInterest),
  };
}

/** OGR strategy (BC apparel rubric / catalog) only when the request line is ogr. */
export function isOgrAiStrategy(lineCode: string): boolean {
  return lineCode === 'ogr';
}
