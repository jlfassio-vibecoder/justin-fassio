# PR4 Plan: Account Research Product Match (line-specific)

**Status:** Implemented (service landed)  
**Feature audit:** [docs/epics/agentic-outreach/account-research-before-product-selection.md](../epics/agentic-outreach/account-research-before-product-selection.md)  
**PR3 plan:** [account-research-pr3-profile-suggestions.md](./account-research-pr3-profile-suggestions.md)  
**Date:** 2026-08-23

Backend-only PR: from a completed fresh research run, rank 1–3 line-scoped catalog SKUs using the outreach product pool, 90-day send dedup, and citation junctions. No UI, no new searches, no draft/send changes.

---

## 1. Objective

1. Create line-specific `account_product_match_runs` linked to one `research_run_id` + explicit `sales_line_id`.
2. Rank 1–3 products from `loadOutreachProductPool` with `selectProductsForProspect` (greedy).
3. Exclude SKUs emailed to the prospect in the last 90 days (`fetchRecentProductOutreachCatalogIdsByProspect`).
4. Attach ≥1 accepted citation per item via `account_product_match_item_citations`.
5. Return empty runs with `empty_reason` when pool or dedup blocks matching.

---

## 2. Scope

**In scope:** `accountProductMatch` lib, persist RPC migration, POST staff API, tests.

**Out of scope:** PR5 UI, new web searches, draft/send, CRM writes, nightly prep Mode B.

---

## 3. Migration

**File:** `supabase/migrations/20260823180000_account_research_pr4_product_match_rpc.sql`

- `persist_account_product_match_run(p_retailer_id, p_sales_line_id, p_research_run_id, p_status, p_empty_reason, p_items)`
- `SECURITY INVOKER`, `is_approved_staff()` gate
- Validates research run FK, catalog line_id, accepted citations, ranks 1–3

---

## 4. Staff API

| Method | Route                                  |
| ------ | -------------------------------------- |
| POST   | `/api/staff/account-product-match/run` |

Body: `{ retailerId, salesLineId, researchRunId, ignoreRecentSendDedup?: boolean }`

---

## 5. Empty reasons

| Reason                 | When                                      |
| ---------------------- | ----------------------------------------- |
| `no_eligible_products` | Published pool empty for line             |
| `all_recently_emailed` | Pool non-empty but 90d dedup excludes all |
| `no_accepted_evidence` | No accepted citations on research run     |
| `identity_unresolved`  | `identity_confidence !== 'high'`          |

`stale_research` is a run **status**, not an `empty_reason`.

---

## 6. Tests

- `accountProductMatch.test.ts` — dedup, empty pool, eligibility, happy path
- `outreachProductSelection.test.ts` — `selectProductsForProspect`
- `staff-account-product-match.test.ts` — API auth/validation
- `accountResearchPr4ProductMatch.test.ts` — migration content
