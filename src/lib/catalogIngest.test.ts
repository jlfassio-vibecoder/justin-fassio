import { describe, expect, it } from 'vitest';
import { buildImportReport, mergeCatalogEvidence } from '@/lib/catalogIngest';

describe('catalog ingest report', () => {
  it('classifies matched vs new vs missing CRM SKUs', () => {
    const report = buildImportReport({
      evidence: [
        { sku: 'OG2147', imageHash: 'abc', confidence: 0.9 },
        { sku: 'OG9999', confidence: 0.5, needsReview: true },
        { sku: 'OG2147' },
      ],
      crm: [
        { sku: 'OG2147', id: '1' },
        { sku: 'OG1000', id: '2' },
      ],
    });
    expect(report.productsFound).toBe(3);
    expect(report.existingMatched).toBe(2);
    expect(report.duplicateSkus).toContain('OG2147');
    expect(report.catalogSkusNotInCrm).toContain('OG9999');
    expect(report.crmSkusNotInCatalog).toContain('OG1000');
    expect(report.ocrConfidenceIssues).toContain('OG9999');
    expect(report.missingImages).toContain('OG9999');
  });
});

describe('mergeCatalogEvidence', () => {
  it('fills blanks and flags conflicts without overwriting', () => {
    const { fills, conflicts } = mergeCatalogEvidence({
      current: { color: 'Stone Blue', tagline: '' },
      evidence: { color: 'Navy', tagline: 'Hello' },
      verifiedFields: new Set(['color']),
    });
    expect(fills).toEqual({ tagline: 'Hello' });
    expect(conflicts).toEqual([{ field: 'color', current: 'Stone Blue', proposed: 'Navy' }]);
  });
});
