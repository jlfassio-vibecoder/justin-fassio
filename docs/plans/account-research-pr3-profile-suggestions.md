# PR3 Plan: Account Research Profile Suggestions + Explicit Apply/Reject

**Status:** Implemented (service landed)
**Feature audit:** [docs/epics/agentic-outreach/account-research-before-product-selection.md](../epics/agentic-outreach/account-research-before-product-selection.md)  
**PR1 plan:** [agent-outreach-account-research-pr1-schema-foundation.md](./agent-outreach-account-research-pr1-schema-foundation.md)  
**PR2 plan:** [agent-outreach-account-research-pr2-research-service.md](./agent-outreach-account-research-pr2-research-service.md)  
**PR1 on main:** PR #114 — `20260823120000_account_research_schema_foundation.sql` (applied)  
**PR2 on main:** PR #115 — `20260823140000_account_research_run_rpcs.sql` (applied)  
**Date:** 2026-08-23

Backend-only PR: generate citation-backed profile suggestions from completed research runs; staff explicitly apply or reject. No UI, no new searches, no automatic CRM writes.

---

## 1. PR3 objective

1. Generate normalized, citation-backed account profile suggestions from a completed retailer research run.
2. Persist suggestions in `account_research_profile_suggestions` with junction citations.
3. Let approved staff apply or reject individual suggestions.
4. On apply: write `retailer_field_changes` audit + allowlisted `prospects` update atomically.
5. Never auto-apply research to canonical CRM fields.
6. Preserve per-platform citation provenance (no generic social blob).

---

## 2. Verified current-state evidence

| Area                         | Path / fact                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| PR1 eight tables + junctions | `supabase/migrations/20260823120000_account_research_schema_foundation.sql`                          |
| PR2 start/complete RPCs      | `supabase/migrations/20260823140000_account_research_run_rpcs.sql`                                   |
| Orchestration                | `src/lib/accountResearch/orchestrate.ts`                                                             |
| Snapshot (no suggestions)    | `src/lib/accountResearch/snapshot.ts`                                                                |
| Staff APIs                   | `src/pages/api/staff/account-research/run.ts`, `[runId]/index.ts`, `[runId]/process.ts`, `latest.ts` |
| Types                        | `src/types/database.ts`                                                                              |
| Field audit                  | `src/lib/retailerFieldChanges.ts`                                                                    |
| Concurrency pattern          | `classifyApplyDecision` in `src/lib/accountImport/reviewStatus.ts`                                   |
| Verified identity            | `updateProspectResearch.ts`, `updateProspectAccountDetails.ts`                                       |
| **No `citation_ids uuid[]`** | Junction `account_research_suggestion_citations` only                                                |

**PR3 gaps before implementation:** no `baseline_value`, no pending uniqueness per field/run, no supersede trigger, no suggestion service/RPCs.

---

## 3. PR1/PR2 contracts PR3 relies on

- Citations: `acceptance_status = 'accepted'` only when run `identity_confidence = high` (PR2 identity gate).
- Run terminal statuses: `succeeded`, `partial`; identity failure → `needs_identity_review`.
- Freshness: `completed_at`, 7 days (`src/lib/accountResearch/freshness.ts`).
- `supersedes_run_id` on new runs when `forceRefresh`.
- Staff auth: `requireApprovedStaffClient` + `is_approved_staff()` RLS.
- PR2 does **not** write suggestions, prospects, or `retailer_field_changes`.

---

## 4. Scope and explicit exclusions

**In scope:** suggestion generation, persist, list, apply, reject, migration, tests.

**Out of scope:** PR4 product match, PR5 UI, PR6 prep, new web searches, social URL columns, territory/RLA/outreach mutations, identity-review UI, auto CRM apply.

---

## 5. Allowed-field matrix

Hardcoded in `src/lib/accountResearch/suggestionFields.ts`. No dynamic column updates.

### Tier A — profile / taxonomy

| field_path            | Column                | blank-only | verified confirm | citation platforms |
| --------------------- | --------------------- | ---------- | ---------------- | ------------------ |
| `retail_category`     | `retail_category`     | yes        | no               | website            |
| `apparel_capability`  | `apparel_capability`  | yes*       | no               | website, shopify   |
| `category`            | `category`            | no         | no               | website            |
| `lifestyle_themes`    | `lifestyle_themes`    | merge-add  | no               | website, social    |
| `secondary_channels`  | `secondary_channels`  | merge-add  | no               | website            |
| `retail_subchannels`  | `retail_subchannels`  | merge-add  | no               | website            |
| `venue_contexts`      | `venue_contexts`      | merge-add  | no               | website            |
| `retail_capabilities` | `retail_capabilities` | merge-add  | no               | website            |

\*Replace if current is `Unknown`.

### Tier B — protected identity

| field_path                                          | blank-only | verified confirm | citation platforms                      |
| --------------------------------------------------- | ---------- | ---------------- | --------------------------------------- |
| `website`                                           | no         | yes              | website, shopify                        |
| `address`, `city`, `region`, `postal_code`, `phone` | yes        | yes              | website                                 |
| `name`                                              | yes        | yes              | website (≥2 citations, high confidence) |

### Tier C — forbidden

`territory_id`, `operational_territory_id`, `fit`, `fit_score`, `priority`, `provisional_grade`, `ideal_opening_units`, `verification_status`, `buyer_verified`, `import_protected`, `account_status`, `notes`, `next_action`, `qualification_status`, `existing_ogr`, `external_id`, `subterritory`, `primary_district`, all RLA/outreach fields.

---

## 6. Run and citation eligibility

Generation requires **all**:

- `status IN ('succeeded', 'partial')`
- `identity_confidence = 'high'` (else `identity_review_required`)
- `isUsableFreshRun` (7d) for **new** generation
- No other run with `supersedes_run_id = this_run.id` (`superseded_run`)
- ≥1 citation: `acceptance_status = 'accepted'`, same run/retailer, valid URL

`none_indexed` never produces inactivity/closure suggestions.

---

## 7. Suggestion-generation contract

**Input:** eligible snapshot, accepted citations, current prospect (`PROSPECT_SELECT`).

**Output (Zod):** `field_path`, `suggested_value`, `rationale` (≤500), `confidence`, `citation_ids[]` (min 1), `baseline_value`.

**Hybrid strategy:**

1. Deterministic: `website` from best website/shopify citation.
2. Model-assisted (`generateObject` + Zod): taxonomy fields from bounded excerpts; mocked in tests.
3. No new Perplexity searches.

**Idempotency:** partial unique `(research_run_id, field_path) WHERE status = 'pending'`; `forceRegenerate` supersedes pending on same run+field before insert.

---

## 8. Provider and Zod contract

- Reuse `ensureAiGatewayApiKey` / `staffAiGateway` from `src/lib/aiGatewayEnv.ts`.
- Zod schema for model output: array of `{ field_path, suggested_value, rationale, confidence, citation_ids }`.
- Post-validate: every `citation_id` exists in accepted set; field in allowlist; value normalizes; omit no-ops.

---

## 9. Persistence and idempotency

- **Authoritative citations:** `account_research_suggestion_citations` only.
- **Persist:** RPC `persist_account_research_profile_suggestions(p_run_id, p_force_regenerate, p_suggestions)` — all-or-nothing.
- **Apply/reject:** separate RPCs (see §10).

---

## 10. Atomic apply/reject design

### `apply_account_research_profile_suggestion(p_suggestion_id, p_confirm_verified_overwrite)`

1. `FOR UPDATE` suggestion where `status = 'pending'`.
2. Reject if `superseded` or run superseded.
3. Load prospect; compare `baseline_value` to current column → `canonical_value_changed` if differ.
4. Protected identity: require `p_confirm_verified_overwrite` when `isVerifiedIdentityStatus`.
5. Idempotent: if current equals `suggested_value` → `accepted` + `already_applied`.
6. `UPDATE prospects` one column; `INSERT retailer_field_changes` (`source=ai`, `provider=account_research`, `status=applied`, `actor_id=auth.uid()`).
7. `UPDATE suggestion` → `accepted`, `reviewed_by`, `reviewed_at`.

### `reject_account_research_profile_suggestion(p_suggestion_id)`

- Pending → `rejected`; idempotent if already `rejected`; 409 if `accepted`.

---

## 11. Optimistic concurrency

| Item            | Rule                                           |
| --------------- | ---------------------------------------------- |
| Stored baseline | `baseline_value` jsonb at generation           |
| Compare         | baseline vs current prospect before write      |
| Conflict        | 409 `canonical_value_changed`; stays `pending` |
| Already applied | current == suggested → `already_applied`       |

---

## 12. Supersession

- Trigger on `account_research_runs` INSERT: when `supersedes_run_id` set → mark prior run's `pending` suggestions `superseded`.
- Accepted/rejected history preserved.
- Apply RPC rejects `superseded` suggestions.

---

## 13. Staff API contracts

| Method | Route                                                           |
| ------ | --------------------------------------------------------------- |
| POST   | `/api/staff/account-research/[runId]/suggestions/generate`      |
| GET    | `/api/staff/account-research/[runId]/suggestions`               |
| POST   | `/api/staff/account-research/suggestions/[suggestionId]/apply`  |
| POST   | `/api/staff/account-research/suggestions/[suggestionId]/reject` |

All: `prerender = false`, `requireApprovedStaffClient`.

---

## 14. Snapshot compatibility

`GET /[runId]` unchanged (PR2). Suggestions on dedicated GET endpoint.

---

## 15. Authentication and RLS

- Staff JWT + `is_approved_staff()` on all tables (unchanged).
- RPCs: `SECURITY INVOKER`, staff check, `auth.uid()` for audit.

---

## 16. Migration decision — **GO**

**File:** `supabase/migrations/20260823160000_account_research_pr3_suggestions.sql`

- `baseline_value jsonb` on suggestions
- Partial unique pending per run+field
- Supersede trigger
- RPCs: persist, apply, reject
- Mirror `supabase/schema.sql`; update `src/types/database.ts`

---

## 17. Error/status-code matrix

| Condition              | HTTP    | outcome                                    |
| ---------------------- | ------- | ------------------------------------------ |
| Unapproved staff       | 401/403 | —                                          |
| Unknown run/suggestion | 404     | —                                          |
| Ineligible run         | 409     | `ineligible_run`                           |
| Identity not high      | 409     | `identity_review_required`                 |
| Stale research         | 409     | `stale_research`                           |
| Superseded             | 409     | `superseded_run` / `superseded_suggestion` |
| Invalid citations      | 400     | `invalid_citations`                        |
| Forbidden field        | 400     | `forbidden_field`                          |
| Validation             | 400     | `validation_error`                         |
| Canonical changed      | 409     | `canonical_value_changed`                  |
| Protected identity     | 403     | `protected_identity`                       |
| Generation failed      | 502     | `generation_failed`                        |

---

## 18. Files changed

See implementation tree under `src/lib/accountResearch/suggestionFields.ts`, `suggestions.ts`, `applySuggestion.ts`, staff API routes, migration, tests.

---

## 19. Test and fixture plan

- **Generation:** eligible run, reject ineligible/stale/identity/superseded, accepted-only citations, no-op omit, idempotent persist, platform provenance, no inactive claims.
- **Apply:** atomic update + audit, protected identity, conflict, idempotent, superseded/rejected blocked.
- **Reject:** status only, idempotent.
- **Security:** staff auth, RPC allowlist.
- **API:** mock auth + orchestration like `staff-account-research-run.test.ts`.

---

## 20. Rollback

Stop calling routes; drop RPCs if needed; bulk `superseded` pending via ops SQL. No CRM auto-rollback.

---

## 21. Risks

Model hallucination (Zod + citation_id validation), jsonb merge drift (baseline compare), duplicate pending (unique index), stale apply (supersede trigger + RPC checks).

---

## 22. Acceptance criteria

1. Generate on fresh high-identity completed runs.
2. ≥1 junction citation per suggestion.
3. Apply: one field + audit + accepted atomically.
4. Reject never touches prospects.
5. Superseded pending not applicable.
6. PR2 GET snapshot unchanged.
7. `npm run check` green.

---

## 23. Deferred PR4–PR6

Product match, UI, prep Mode B, identity UI, social URL columns — unchanged.

---

## 24. Blocking vs non-blocking questions

**Blocking:** none.

**Non-blocking:** exact model id (follow fill-blank family); `forceRegenerate` default false.

---

## 25. Final verdict

**GO** — additive migration + backend service; no changes to applied PR1/PR2 migrations.
