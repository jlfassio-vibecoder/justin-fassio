/**
 * Idempotent catalog ingest helpers (report + fill-blank merge).
 * OCR/render stays untrusted until human page verification.
 */

import { normalizeSku, skusMatch } from '@/lib/skuNormalize';

export type CatalogEvidenceRow = {
  sku: string;
  page?: number;
  pdfPage?: number;
  name?: string | null;
  cat?: string | null;
  color?: string | null;
  tagline?: string | null;
  wholesaleUsd?: number | null;
  msrpCad?: number | null;
  sizeBands?: Array<{ size: string; wholesaleUsd: number }>;
  imageHash?: string | null;
  confidence?: number | null;
  needsReview?: boolean;
};

export type CrmSkuRow = {
  sku: string;
  id: string;
};

export type ImportReport = {
  productsFound: number;
  existingMatched: number;
  newProducts: number;
  blankFieldsFilled: number;
  conflictsDetected: number;
  productsRequiringManualReview: number;
  duplicateSkus: string[];
  missingImages: string[];
  ocrConfidenceIssues: string[];
  catalogSkusNotInCrm: string[];
  crmSkusNotInCatalog: string[];
};

export function buildImportReport(input: {
  evidence: CatalogEvidenceRow[];
  crm: CrmSkuRow[];
  blankFieldsFilled?: number;
  conflictsDetected?: number;
}): ImportReport {
  const evidenceSkus = input.evidence.map((e) => normalizeSku(e.sku));
  const crmSkus = input.crm.map((c) => normalizeSku(c.sku));
  const crmSet = new Set(crmSkus);
  const evidenceSet = new Set(evidenceSkus);

  const seen = new Set<string>();
  const duplicateSkus: string[] = [];
  for (const sku of evidenceSkus) {
    if (seen.has(sku)) duplicateSkus.push(sku);
    seen.add(sku);
  }

  let existingMatched = 0;
  const catalogSkusNotInCrm: string[] = [];
  for (const e of input.evidence) {
    const match = input.crm.some((c) => skusMatch(c.sku, e.sku));
    if (match) existingMatched += 1;
    else catalogSkusNotInCrm.push(normalizeSku(e.sku));
  }

  const crmSkusNotInCatalog = [...crmSet].filter((sku) => !evidenceSet.has(sku));

  return {
    productsFound: input.evidence.length,
    existingMatched,
    newProducts: catalogSkusNotInCrm.length,
    blankFieldsFilled: input.blankFieldsFilled ?? 0,
    conflictsDetected: input.conflictsDetected ?? 0,
    productsRequiringManualReview: input.evidence.filter(
      (e) => e.needsReview || (e.confidence != null && e.confidence < 0.8),
    ).length,
    duplicateSkus: [...new Set(duplicateSkus)],
    missingImages: input.evidence.filter((e) => !e.imageHash).map((e) => normalizeSku(e.sku)),
    ocrConfidenceIssues: input.evidence
      .filter((e) => e.confidence != null && e.confidence < 0.8)
      .map((e) => normalizeSku(e.sku)),
    catalogSkusNotInCrm,
    crmSkusNotInCatalog,
  };
}

export function mergeCatalogEvidence(input: {
  current: Record<string, unknown>;
  evidence: Record<string, unknown>;
  verifiedFields?: Set<string>;
}): {
  fills: Record<string, unknown>;
  conflicts: Array<{ field: string; current: unknown; proposed: unknown }>;
} {
  const verified = input.verifiedFields ?? new Set<string>();
  const fills: Record<string, unknown> = {};
  const conflicts: Array<{ field: string; current: unknown; proposed: unknown }> = [];

  for (const [field, proposed] of Object.entries(input.evidence)) {
    if (proposed == null || proposed === '') continue;
    const current = input.current[field];
    const isBlank = current == null || current === '';
    if (isBlank && !verified.has(field)) {
      fills[field] = proposed;
      continue;
    }
    if (!isBlank && current !== proposed) {
      conflicts.push({ field, current, proposed });
    }
  }

  return { fills, conflicts };
}
