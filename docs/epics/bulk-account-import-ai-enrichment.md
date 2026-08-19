# Epic: Bulk account upload and AI enrichment

**Status:** Complete — closed 19 Aug 2026. No further feature work.

**Product spec:** [docs/design/bulk-account-import-ai-enrichment.md](../design/bulk-account-import-ai-enrichment.md)

**Business outcome:** Owner can import attested historical retailers for a represented line, classify them as opened-but-dormant reactivation candidates (not never-purchased prospects), enrich blanks with review, and avoid fabricated orders, dates, or outreach enrollment.

---

## Closeout

A–E shipped on main (PRs #88–#92). Later F1–F4 shipped on #93–#94 (outreach opt-in, unresponsive park, ZoomInfo Eagle Peak import, OGR lookalike discovery). Hosted schema includes F4 (`20260819140000`).

Production validation on 19 Aug 2026 (hosted `mqsyqxnzpncwdrnugytf`):

- One OGR `historical_customer` batch from `OGR Washington and Oregon acounts.xlsx`
- 18 uploaded rows → 17 unique businesses (1 in-file duplicate skipped)
- 15 retailers/RLAs created as historical reactivation candidates; 2 rows held at `needs_review`
- 0 contacts created by import; 0 lookalike jobs; 0 outreach automation runs
- Batch left `enriching` with 15 queued fill-blank jobs (resume from Import History)

The design-time 25→24 Peninsula metric remains covered by tests. The live workbook was this combined 18-row file, not the two separate 13+11 files named in the original spec.

Deferred (not reopeners): unresponsive cadence automation; finishing or cancelling the queued enrich jobs; any second workbook the owner still wants to load.
