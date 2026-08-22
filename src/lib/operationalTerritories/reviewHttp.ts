import type { SuggestOperationalTerritoryResult } from '@/lib/operationalTerritories/suggestOperationalTerritory';
import type { UnresolvedOpsReviewRow } from '@/lib/operationalTerritories/reviewQueue';

export type OpsReviewListItem = UnresolvedOpsReviewRow & {
  currentSuggestion: SuggestOperationalTerritoryResult;
};

export function jsonOpsReview(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function parseProspectIdParam(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}
