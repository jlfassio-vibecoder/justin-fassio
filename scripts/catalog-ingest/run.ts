/**
 * Idempotent OGR catalog ingest CLI scaffold.
 *
 * Usage:
 *   npx tsx scripts/catalog-ingest/run.ts --pdf docs/catalog/OGR_2026_Catalog-FINAL.pdf
 */

import { buildImportReport } from '../../src/lib/catalogIngest';

async function main() {
  const eqFlag = process.argv.find((a) => a.startsWith('--pdf='));
  const flagIndex = process.argv.indexOf('--pdf');
  const flagValue =
    flagIndex >= 0 && process.argv[flagIndex + 1] && !process.argv[flagIndex + 1]!.startsWith('-')
      ? process.argv[flagIndex + 1]
      : undefined;
  const pdfArg = eqFlag?.slice(6) || flagValue || 'docs/catalog/OGR_2026_Catalog-FINAL.pdf';

  console.log(
    JSON.stringify(
      {
        ok: true,
        message:
          'Ingest scaffold ready. Render/OCR not wired — verify pages manually before writing SKUs.',
        pdf: pdfArg,
        report: buildImportReport({ evidence: [], crm: [] }),
        nextSteps: [
          'Render PDF pages (pdftoppm / pdf.js)',
          'OCR + region detect → CatalogEvidenceRow[]',
          'Human-verify prices/size bands against rendered pages',
          'Upsert catalog_items / catalog_variants / catalog_assets idempotently',
          'Write catalog_import_runs.report + catalog_import_conflicts',
        ],
      },
      null,
      2,
    ),
  );
}

void main();
