/** Map invoice line tokens (OG2017 M BLK …) to catalog base SKU. */

import { normalizeSku } from '../skuNormalize.ts';

const BASE_SKU_RE = /^(OG[A-Z0-9]+(?:GM)?)/i;

/** First OG style token on an invoice line (size/color tokens stripped). */
export function extractBaseSkuFromInvoiceLine(line: string): string | null {
  const trimmed = line.trim();
  const match = BASE_SKU_RE.exec(trimmed);
  if (!match?.[1]) return null;
  return normalizeSku(match[1]);
}
