# OGR 2026 Catalog source

## Document

- [`OGR_2026_Catalog-FINAL.pdf`](./OGR_2026_Catalog-FINAL.pdf) — official 2026 Old Guys Rule wholesale catalog (image-based).

Copied from the local Downloads copy of `OGR_2026_Catalog-FINAL`. Prefer Git LFS for this binary when available (`git lfs track 'docs/catalog/*.pdf'`).

## Verification rules

The PDF is **image-heavy**. Do not treat OCR or automated extraction as ground truth until a human has checked values against the **rendered** catalog pages.

Always verify before marking `verified_catalog`:

- SKU spelling and suffixes (`-GM`, `-S`, `-LS`, `-T`, `-ZH`, `-SPF`)
- Size wholesale bands (e.g. M–XL / 2X / 3X) — never invent missing sizes
- MSRP CAD and “not for resale” markers
- New / Name Drop / bestseller badges
- Terms page language (minimum order, pieces per design)
- Made-in-USA or country-of-origin claims

## Images (P4)

Product images should be cropped from rendered pages, optimized (WebP), and stored in the Supabase Storage bucket `catalog-assets` at:

`{line_code}/{catalog_year}/{sku}/primary.webp`

Keep `catalog_assets` rows with `pdf_page`, optional crop box, `content_hash`, and `source_document` so the UI never reloads the full PDF for every drawer open.

## Ingest

See [`scripts/catalog-ingest/`](../../scripts/catalog-ingest/) for the idempotent import scaffold and report shape.
