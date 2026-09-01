/** Resolve CRM account from invoice PDF filename or bill-to name. */

export type AccountMatchCandidate = {
  id: number;
  name: string;
};

function normalizeAccountName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** pdf-parse often glues words (LeMayAmerica's → LeMay America's). */
export function normalizeBillToName(value: string): string {
  return normalizeAccountName(value.replace(/([a-z])([A-Z][a-z]{3,})/g, '$1 $2'));
}

function tokenOverlapScore(needle: string, hay: string): number {
  const needleTokens = normalizeBillToName(needle)
    .split(' ')
    .filter((t) => t.length > 1);
  const hayTokens = new Set(
    normalizeBillToName(hay)
      .split(' ')
      .filter((t) => t.length > 1),
  );
  if (needleTokens.length === 0 || hayTokens.size === 0) return 0;
  let hits = 0;
  for (const token of needleTokens) {
    if (hayTokens.has(token)) hits += 1;
  }
  return hits / needleTokens.length;
}

/** `{prospectId}.pdf` or `{prospectId}-anything.pdf` */
export function prospectIdFromInvoiceFilename(filename: string): number | null {
  const base = filename.replace(/\.pdf$/i, '').trim();
  const direct = /^(\d+)$/.exec(base);
  if (direct) {
    const id = Number.parseInt(direct[1]!, 10);
    return Number.isFinite(id) ? id : null;
  }
  const prefixed = /^(\d+)[-_]/.exec(base);
  if (prefixed) {
    const id = Number.parseInt(prefixed[1]!, 10);
    return Number.isFinite(id) ? id : null;
  }
  return null;
}

export function matchAccountByBillToName(
  billToName: string,
  candidates: AccountMatchCandidate[],
): AccountMatchCandidate | null {
  const needle = normalizeBillToName(billToName);
  if (!needle) return null;

  let best: AccountMatchCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const hay = normalizeBillToName(candidate.name);
    if (!hay) continue;
    if (hay === needle) return candidate;
    if (hay.includes(needle) || needle.includes(hay)) {
      const score = Math.min(hay.length, needle.length);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  if (best) return best;

  for (const candidate of candidates) {
    const overlap = tokenOverlapScore(billToName, candidate.name);
    if (overlap >= 0.75 && overlap > bestScore) {
      best = candidate;
      bestScore = overlap;
    }
  }
  return best;
}

export function resolveAccountForInvoice(input: {
  filename: string;
  billToName: string;
  shipToName?: string;
  candidates: AccountMatchCandidate[];
  explicitProspectId?: number | null;
}): AccountMatchCandidate | null {
  if (input.explicitProspectId != null && Number.isFinite(input.explicitProspectId)) {
    const byId = input.candidates.find((c) => c.id === input.explicitProspectId);
    if (byId) return byId;
  }
  const fromFile = prospectIdFromInvoiceFilename(input.filename);
  if (fromFile != null) {
    const byId = input.candidates.find((c) => c.id === fromFile);
    if (byId) return byId;
  }
  return (
    matchAccountByBillToName(input.billToName, input.candidates) ??
    (input.shipToName ? matchAccountByBillToName(input.shipToName, input.candidates) : null)
  );
}
