# Account Research Before Product Selection

**Status:** Planning only (Aug 2026) — do not implement from this doc without an approved PR plan.  
**Epic parent:** [Agentic Outreach](./README.md)  
**Audience:** Implementation agents and reviewers. Treat this file as the source of truth for the Account Research feature until code lands.

---

## 1. Objective

Insert an **on-demand public-web Account Research** step **before** catalog product selection so the agent:

1. Resolves the correct business identity before accepting evidence.
2. Searches the official website and publicly indexed recent social activity.
3. Stores reviewable evidence (URL, title, platform, dates, excerpt, confidence, identity confidence).
4. Produces **suggestions only** — never auto-overwrites canonical CRM fields.
5. Uses account evidence + line context to recommend **1–3** catalog products with citations.
6. Avoids products recently emailed to the same account.
7. Keeps staff approval before draft generation or send.
8. Uses a **7-day freshness** window with manual refresh.
9. Never treats missing indexed social activity as business inactivity.
10. Never accesses private social content or bypasses platform restrictions.

**Hard separation:** retailer-level research ≠ line-specific product matching.

**PR1 implementation plan:** [docs/plans/agent-outreach-account-research-pr1-schema-foundation.md](../../plans/agent-outreach-account-research-pr1-schema-foundation.md) (merged to `main` via PR #114; migration applied)  
**PR2 implementation plan:** [docs/plans/agent-outreach-account-research-pr2-research-service.md](../../plans/agent-outreach-account-research-pr2-research-service.md) (merged to `main` via PR #115; migration `20260823140000_account_research_run_rpcs.sql` applied)  
**PR3 implementation plan:** [docs/plans/account-research-pr3-profile-suggestions.md](../../plans/account-research-pr3-profile-suggestions.md) (merged via PR #116)  
**PR4 implementation plan:** [docs/plans/account-research-pr4-product-match.md](../../plans/account-research-pr4-product-match.md) (PR #117)  
**PR5 implementation plan:** [docs/plans/account-research-pr5-ui-surfaces.md](../../plans/account-research-pr5-ui-surfaces.md) (Mode A staff UI)

### Locked clarifications (2026-08-23)

These supersede earlier shorthand in §3–4 where they conflict:

| Topic                  | Lock                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Table shape            | Original “four domain tables” expand into **normalized tables + citation junctions** (8 tables in PR1).           |
| Platform searches      | **Independent** source-search rows — never one combined provider query.                                           |
| Search All             | One parent research run + **six** child searches: Website, Shopify, Instagram, Facebook, TikTok, Pinterest.       |
| Website vs Shopify     | **Separate** source types; Shopify is storefront/ecommerce, not social.                                           |
| Social URLs            | **Citation-only** in v1; no social columns on `prospects`.                                                        |
| Product matching       | Requires explicit `sales_line_id` (no silent OGR default).                                                        |
| Draft approval (later) | Selecting a recommended SKU is sufficient approval for draft generation; staff Send remains mandatory.            |
| Briefing cards         | Do **not** force Research before Log Call.                                                                        |
| Prospect pointers      | **No** `last_account_research_*` columns in PR1.                                                                  |
| Citation relationships | **No** `uuid[]` — junction tables only.                                                                           |
| Mode                   | **Mode A only**; Mode B deferred.                                                                                 |
| Types                  | Hand-update `src/types/database.ts` (no CLI gen script in this repo).                                             |
| PR2 execution          | **Queued** start/process (one source per 60s invocation); sync Search All is NO-GO.                               |
| Per-source outcomes    | Platform results live on `account_research_source_searches.status` only — **no** run-level `social_index_status`. |
| Freshness clock        | Use `completed_at` (not `researched_at`).                                                                         |

---

## 2. Current-state evidence (live code audit)

### 2.1 Outreach pipeline today (no research step)

Nightly prep orchestrator: [`src/lib/outreachNightlyPrep.ts`](../../../src/lib/outreachNightlyPrep.ts)  
Cron: [`src/pages/api/cron/outreach-nightly-prep.ts`](../../../src/pages/api/cron/outreach-nightly-prep.ts)  
Manual prep: [`src/pages/api/staff/outreach/prep.ts`](../../../src/pages/api/staff/outreach/prep.ts)

| #   | Step                            | Key module                                                                            | Writes                         |
| --- | ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Goal / pace / capacity          | `outreachPace.ts`, goal snapshot                                                      | —                              |
| 2   | Automation run row              | `outreachNightlyPrep.ts`                                                              | `outreach_automation_runs`     |
| 3   | Lead-rules refresh              | `refreshPersistedLeadRules.ts`                                                        | goal settings lead-rules cache |
| 4   | Channel + product + fit weights | `outreachChannelWeights.ts`, `outreachProductWeights.ts`, `outreachFitBandWeights.ts` | run JSON                       |
| 5   | Channel slot allocation         | `outreachChannelAllocation.ts`                                                        | —                              |
| 6   | **Account + product select**    | `outreachSelectTargets.ts`                                                            | — (DTO only)                   |
| 7   | AI draft copy                   | `generateOgrProductOutreachDraft.ts`                                                  | `system_messages` drafts       |
| 8   | Finalize run                    | prep orchestrator                                                                     | run status                     |

Morning briefing is **on-read** ([`outreachBriefing.ts`](../../../src/lib/outreachBriefing.ts)), not a prep write.

```mermaid
flowchart LR
  pace[Pace and capacity]
  select[selectOutreachTargets]
  product[selectProductForProspect]
  draft[generateOgrProductOutreachDraft]
  review[Staff composer review]
  send[Staff send Resend]

  pace --> select --> product --> draft --> review --> send
```

**Gap:** There is **no Account Research step** between eligibility and product selection. Product pick uses CRM channels / themes already on the prospect row.

### 2.2 Account selection

| Concern         | Location                                               | Behavior                                                                                            |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Pool load       | `outreachSelectTargets.ts` → `loadProspectAccounts`    | OGR RLAs: prospect pool + opened reactivation with `outreach_eligible`                              |
| Hard exclusions | same                                                   | pending agent draft, no usable email, bounce/complaint suppression, 14-day cooldown                 |
| Rank            | `outreachEligibility.ts` `compareOutreachProspectRank` | priority → fit → fit-band weights → grade → channel → older last send                               |
| Constants       | `outreachSelectionConstants.ts`                        | cooldown **14d**, product dedup **90d**, Top rank **30**, pending statuses `draft/queued/scheduled` |

### 2.3 Product selection

| Concern           | Location                                         | Behavior                                                                                      |
| ----------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Pool              | `outreachProductSelection.ts`                    | Published OGR active + public slug; Top 30 sales rank **or** `is_new`                         |
| Prior-email avoid | `fetchRecentProductOutreachCatalogIdsByProspect` | Exclude catalog ids with `sent_at` in last **90 days**                                        |
| Fit               | `selectProductForProspect`                       | Prefer channel intersection → weak global → remainder; measured product weights when adaptive |
| Output            | `SelectedOutreachTarget`                         | Frozen DTO including **one** product + `selectionReasons`                                     |

### 2.4 Draft gen context (not research)

[`generateOgrProductOutreachDraft.ts`](../../../src/lib/generateOgrProductOutreachDraft.ts) `loadProspectContext` loads only:

- `city`, `region`, `fit`, `lifestyleThemes`

Prompt rules forbid inventing facts. No web search at draft time.

### 2.5 Human-review and send gates

| Gate                           | Where                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Status must be `draft` to send | `drafts/[id]/send.ts`, `markAgentProductOutreachDraftSent`                       |
| Composer review / edit         | `OgrProductEmailComposerModal.tsx`                                               |
| Staff send only                | Resend from authenticated staff; agent never calls Resend                        |
| Cancel                         | `drafts/[id]/cancel.ts` → `cancelled`                                            |
| Auth                           | `requireApprovedStaffClient` on staff APIs; cron uses service role + cron secret |

**No separate approve status** — review + Send is the gate. Agent origin: `agent_product_email`.

### 2.6 Suppression (selection)

Implemented via `system_messages` bounce/complaint signals (`loadSuppressedKeys`, `isProductOutreachRecipientSuppressed`).

**Not implemented for selection:** unsubscribe / List-Unsubscribe / DNC (documented gap in phase-1).

### 2.7 Existing public-web research (parallel product, not wired to outreach)

| Capability                    | Path                                 | Notes                                                                                                                              |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Company web research          | `src/lib/companyWebResearch.ts`      | Perplexity via AI Gateway; identity disambiguation by city/URL; directory host denylist includes `facebook.com`                    |
| Fill-blank evidence           | `src/lib/fillBlankProspectFields.ts` | Zod `FillBlankEvidence`: website, address, phone, category, apparel, themes, `operatingConfirmed`, `directoryOnly`, `sourceUrls[]` |
| Research update preview/apply | `src/lib/updateProspectResearch.ts`  | Modes `fill-blanks` / `update`; apply overwrites allowlisted fields after staff confirm                                            |
| Contact enrich                | `src/lib/createEnrichedContact.ts`   | Separate contact gaps                                                                                                              |
| Lookalike search              | `src/lib/lookalike/search.ts`        | Perplexity; candidates store free-text `evidence`                                                                                  |
| Landed rates                  | `src/lib/landedRatesResearch.ts`     | Unrelated FX research                                                                                                              |
| Agent CRM tools               | `src/lib/agentCrmTools.ts`           | **DB-only** — no web search tool                                                                                                   |
| Chat agent                    | `src/pages/api/agent.ts`             | No Perplexity tool                                                                                                                 |

**Provider today:** single path — `gateway.tools.perplexitySearch({ maxResults: 5, searchDomainFilter? })` + `AI_GATEWAY_API_KEY`. No multi-provider abstraction.

### 2.8 Evidence storage today

| Store                                                        | What it holds                                                                                               | Gaps vs target                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `account_enrichment_jobs.research_brief` + `.evidence` jsonb | Job-scoped fill-blank / update blobs                                                                        | Not citation-row shaped; job lifecycle tied to import/enrich               |
| `retailer_field_changes`                                     | Per-field audit: `source_urls`, `confidence` text, `provider`, `status` pending/applied/rejected/superseded | No title, platform, published/observed dates, excerpt, identity confidence |
| `lookalike_candidates.evidence`                              | Free-text                                                                                                   | Unstructured                                                               |
| `prospects.website` (+ taxonomy)                             | Thin durable leftovers after apply                                                                          | No social URL columns                                                      |
| `system_messages.payload`                                    | Product outreach generation metadata                                                                        | Not research                                                               |

### 2.9 Social URLs and research timestamps

| Need                                                                                     | Status                                                                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Instagram / Facebook / LinkedIn / X / TikTok / YouTube URL columns on `prospects` or RLA | **Missing**                                                                                        |
| `last_researched_at` / `enriched_at` on prospect                                         | **Missing**                                                                                        |
| Dedicated `research_evidence` (or equivalent) citation table                             | **Missing**                                                                                        |
| Social treated as research target (not just directory denylist)                          | **Missing** — `facebook.com` is currently a **directory host to avoid** in `companyWebResearch.ts` |

### 2.10 Tables in scope (existing)

| Table                      | Role for this feature                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `prospects`                | Retailer identity; `website` only for web identity today                                |
| `retailer_line_accounts`   | Line relationship + markers (`outreach_eligible`, etc.); no research columns            |
| `retailer_field_changes`   | Suggested vs applied field ledger (reuse for profile **suggestions**, not citations)    |
| `account_contacts`         | Buyer email/phone; no social                                                            |
| `catalog_items`            | Product pool                                                                            |
| `system_messages`          | Drafts + prior product email history (`product_outreach`, `sent_at`, `catalog_item_id`) |
| `account_enrichment_jobs`  | Existing enrich jobs — **do not overload** for outreach research runs                   |
| `outreach_automation_runs` | Nightly prep — research should be separately keyed                                      |

### 2.11 Prior product email history

Source of truth: `system_messages` where `message_type = 'product_outreach'` and `sent_at IS NOT NULL`.

- Dedup window used by selection: **90 days** (`AGENT_OUTREACH_PRODUCT_DEDUP_DAYS`).
- Helpers: `fetchRecentProductOutreachCatalogIdsByProspect`, `fetchLatestProductOutreachSend`, contact activity history.

### 2.12 Canonical overwrite behavior today (contrast)

- **Manual AI Update apply** and **fill-blanks apply** can write allowlisted prospect columns after staff confirm (`updateProspectResearch.ts`).
- **Bulk import enrich** may auto-apply “safe” diffs and leave uncertain ones `pending` on `retailer_field_changes`.

**This feature must be stricter:** research never writes canonical CRM fields automatically. Suggestions only, until explicit staff apply (separate action).

---

## 3. Target architecture

### 3.1 Placement in the outreach flow

Insert research **after** account eligibility/ranking and **before** (or as input to) product recommendation. Two operating modes:

| Mode                                     | When                                                                                | Product selection                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A. On-demand review** (primary for v1) | Staff opens research for a selected account from Briefing / Directory / prep review | Recommend 1–3 products; staff picks; then draft gen                                                                    |
| **B. Prep-time optional** (later phase)  | Nightly prep for N highest-ranked targets with stale/missing research               | Cache research; still **one** product for auto-draft only after staff-approved profile or “use cached research” policy |

**v1 recommendation:** Mode A only. Do not block nightly `selectOutreachTargets` / draft generation on research. Wire research into Briefing and account drawer first; integrate into prep as Phase 3+.

```mermaid
flowchart TD
  elig[Eligible account]
  identity[Identity resolution]
  web[Official website search]
  social[Public indexed social search]
  store[Persist citations + run]
  profile[Account profile suggestions]
  match[Line-aware product match 1-3]
  staff[Staff review suggestions and picks]
  draft[Draft generation existing path]
  send[Staff send]

  elig --> identity --> web --> social --> store --> profile --> match --> staff --> draft --> send
```

### 3.2 Layer separation (required)

| Layer                     | Scope                                         | Keyed by                        | Must not contain                       |
| ------------------------- | --------------------------------------------- | ------------------------------- | -------------------------------------- |
| **Retailer research**     | Public identity + evidence about the business | `retailer_id` (`prospects.id`)  | Line-specific SKU picks, OGR-only copy |
| **Line product matching** | Catalog recommendations                       | `retailer_id` + `sales_line_id` | Raw web scrape storage owned by line   |

```
prospects (retailer)
  └── account_research_runs (retailer-level)
        └── account_research_source_searches (per platform)
              └── account_research_citations
        └── account_research_profile_suggestions
              └── account_research_suggestion_citations (junction)
  └── account_product_match_runs (line-specific; explicit sales_line_id + one research_run_id)
        └── account_product_match_items (ranks 1–3 only)
              └── account_product_match_item_citations (junction)
```

### 3.3 Identity resolution gate

Before accepting any evidence as belonging to this account:

1. Inputs: CRM `name`, `city`/`region`, `address`, existing `website`, optional phone.
2. Resolve candidate official website (reuse patterns from `companyWebResearch` + fill-blank `officialWebsite`).
3. Compute **identity confidence** (`high` | `medium` | `low` | `unresolved`).
4. If `unresolved` or `low`: store run as `needs_identity_review`; **do not** attach social/website excerpts as accepted evidence for matching; still allow staff to confirm identity manually.
5. Never invent a different store with a similar name (existing prompt discipline in `companyWebResearch.ts`).

### 3.4 Web + social search rules

| Source                                | Allowed                                                                        | Forbidden                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Official website                      | Public pages via dedicated website source search                               | Login walls, inventing pages                                                     |
| Shopify                               | Public storefront evidence (`*.myshopify.com` or custom domain) with citations | Labeling Shopify without cited evidence                                          |
| Social (IG / FB / TikTok / Pinterest) | Publicly **indexed** activity via **per-platform** source searches             | Private accounts, authenticated scrapes, ToS bypass, one combined “social” query |
| Directories                           | Lead-only (existing directory host list in `companyWebResearch`)               | Treat as operational proof                                                       |

**Search All** means six separate child source searches under one run — never one broad provider query.

**Missing indexed activity ≠ inactive business.** Persist per-source status such as `none_indexed` on `account_research_source_searches`. Do **not** store a single authoritative run-level `social_index_status` that hides platform outcomes. Briefing copy must say “no recent public indexed activity found,” never “store appears inactive.”

### 3.5 Product matching rules

Inputs:

- Accepted research citations + profile suggestions (themes, apparel capability, merch signals).
- Line context (`sales_line_id`, AI persona / catalog for that line; OGR first).
- Existing CRM taxonomy as **hints**, not sole truth.
- Prior sends: reuse `fetchRecentProductOutreachCatalogIdsByProspect` (90d) — exclude those SKUs.
- Pool: same Top 30 / New published pool as `loadOutreachProductPool` (or line-scoped equivalent later).

Outputs: **1–3** ranked `catalog_item_id`s, each with:

- match rationale (short)
- citation links via **junction table** (not `uuid[]`)
- fit kind (`channel_intersect` | `global_fallback`)

Products excluded by the 90-day prior-email rule are filtered **before insert** (no `excluded_recent_send` item flag). Empty outcomes use match-run `status = empty` + reason.

Staff must pick a product (SKU selection is sufficient draft-generation approval in later PRs) before draft generation.

### 3.6 Staff gates

| Action                           | Gate                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Run / refresh research           | Approved staff                                                                 |
| Accept identity                  | Staff confirm when confidence &lt; high                                        |
| Apply profile suggestions to CRM | Explicit apply → `retailer_field_changes` + prospect update (existing pattern) |
| Accept product match             | Staff select SKU(s)                                                            |
| Generate draft                   | Existing generate-draft API / prep path only after product chosen              |
| Send                             | Existing composer send                                                         |

Agent still never calls Resend.

### 3.7 Freshness (7 days)

| Field                                          | Meaning                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `completed_at` on research run / source search | Wall clock when the run or source search finished successfully            |
| Fresh                                          | `now - completed_at < 7 days` and run `status IN ('succeeded','partial')` |
| Stale                                          | Older than 7 days or not a usable success/partial run                     |
| Manual refresh                                 | Staff action forces new run even if fresh (`forceRefresh`)                |

Product match runs should record `research_run_id` used. If research goes stale, mark match run `stale_research` and require refresh before trusting recommendations.

**Cache policy (PR2):** a fresh Search All run may satisfy an individual-platform read when that source’s `completed_at` is fresh; an individual-platform run never satisfies Search All.

---

## 4. Schema proposal (smallest additive)

**Verdict:** Existing tables **cannot** cleanly support citation-level evidence + freshness + line-separated matches without overloading `account_enrichment_jobs.evidence` jsonb and losing queryability.

**PR1 creates eight tables** (see [PR1 plan](../../plans/agent-outreach-account-research-pr1-schema-foundation.md)):

1. `account_research_runs`
2. `account_research_source_searches`
3. `account_research_citations`
4. `account_research_profile_suggestions`
5. `account_research_suggestion_citations`
6. `account_product_match_runs`
7. `account_product_match_items`
8. `account_product_match_item_citations`

### 4.1 Design notes (superseding earlier four-table sketch)

- **No** run-level aggregate `social_index_status` — platform outcomes live on source-search rows.
- **No** `citation_ids uuid[]` on suggestions or match items — use junctions.
- **No** optional `prospects.last_account_research_*` columns in PR1.
- **No** social URL columns on `prospects` in v1 (citation-only).
- Match runs require **NOT NULL** `sales_line_id` → `lines(id)` and exactly one `research_run_id`.
- One active `pending`/`running` research run per retailer via partial unique index.
- Types: hand-update `src/types/database.ts` (repo has no `supabase gen types` script).

### 4.2 What not to reuse as primary store

| Avoid                                             | Why                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Stuffing citations into `system_messages.payload` | Wrong domain; pollutes outreach ledger                               |
| Overloading `account_enrichment_jobs`             | Different lifecycle (import/enrich); mode enum is fill-blanks/update |
| Writing suggestions straight to `prospects`       | Violates no-auto-overwrite                                           |

### 4.3 RLS

Mirror existing pattern:

```sql
-- approved staff full access
using (public.is_approved_staff())
with check (public.is_approved_staff());
```

On all new tables. No buyer access. Cron/service-role only if a future prep job needs it (document exception).

Staff APIs: `requireApprovedStaffClient` only (same as research-update / enrich).

---

## 5. Exact files to touch (implementation map)

### 5.1 New (expected)

| Path                                                                | Role                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `supabase/migrations/YYYYMMDDHHMMSS_account_research.sql`           | Tables + RLS + indexes                                               |
| `src/lib/accountResearch/` (or flat `accountResearch*.ts`)          | Run lifecycle, identity gate, citation write                         |
| `src/lib/accountResearchSearch.ts`                                  | Thin wrapper over Perplexity (extend `companyWebResearch` carefully) |
| `src/lib/accountProductMatch.ts`                                    | 1–3 product recommend using research + pool + 90d dedup              |
| `src/pages/api/staff/account-research/run.ts`                       | Start / refresh research                                             |
| `src/pages/api/staff/account-research/[runId].ts`                   | Get run + citations + suggestions                                    |
| `src/pages/api/staff/account-research/[runId]/apply-suggestions.ts` | Apply accepted fields                                                |
| `src/pages/api/staff/account-product-match/run.ts`                  | Create match run from research                                       |
| `src/components/...`                                                | Research review UI (drawer section or Briefing panel)                |
| `src/types/database.ts`                                             | Regenerated types                                                    |
| Tests under `src/lib/accountResearch*.test.ts`, API tests           |                                                                      |

### 5.2 Extend (reuse)

| Path                                       | Change                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/lib/companyWebResearch.ts`            | Extract shared search helpers; add social-index search mode without treating FB as identity source |
| `src/lib/fillBlankProspectFields.ts`       | Optionally share Zod fragments for website/apparel/themes — do not merge product surfaces          |
| `src/lib/retailerFieldChanges.ts`          | Apply path for accepted suggestions                                                                |
| `src/lib/outreachProductSelection.ts`      | Export pool helpers for match; keep select-one for nightly                                         |
| `src/lib/systemMessages.ts`                | Reuse recent-send catalog id fetch                                                                 |
| `src/components/tabs/AgentBriefingTab.tsx` | Entry: Research / Refresh on lead or draft row (later)                                             |
| `src/components/AccountDetailDrawer.tsx`   | Research panel                                                                                     |
| `docs/epics/agentic-outreach/README.md`    | Link this doc; update flowchart when shipped                                                       |

### 5.3 Do not change in v1

| Path                                          | Reason                                        |
| --------------------------------------------- | --------------------------------------------- |
| `outreachNightlyPrep.ts` product → draft loop | Keep auto-draft path stable until Mode B      |
| Resend send path                              | Unchanged staff gate                          |
| `agentCrmTools.ts`                            | Optional later; not required for v1 staff API |

---

## 6. Failure and stale-result handling

| Condition                             | Behavior                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Provider / Gateway error              | Run `failed`; surface error; keep prior succeeded run as current for freshness UI                                      |
| Identity unresolved                   | `needs_identity_review`; no accepted citations; no product match until staff confirms or refresh                       |
| Website found, social none indexed    | Per-source `status = none_indexed` on social rows; run may still `succeeded`/`partial`; **do not** claim inactivity    |
| Partial citations                     | Store what passed identity gate; mark others `accepted = false`                                                        |
| Stale (&gt;7d)                        | UI badge; match recommendations disabled or marked stale until refresh                                                 |
| Concurrent refresh                    | New run `supersedes_run_id`; mark prior suggestions `superseded`                                                       |
| Rate limit / cost budget exceeded     | Refuse new run with clear error; do not half-write citations                                                           |
| Catalog product missing / unpublished | Drop from match items; never invent SKU                                                                                |
| All top products in 90d dedup set     | Return empty match with reason `all_recently_emailed`; suggest wait or expand pool with staff override flag (explicit) |

Soft-fail pattern from `researchCompany` (brief null + error) should become **hard status on the run row** for this feature so the UI can distinguish soft vs hard failures.

---

## 7. Cost and rate-limit controls

| Control                       | Proposal                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Provider                      | Stay on Vercel AI Gateway + Perplexity (one vendor) for v1                                    |
| Max search calls per run      | Cap tool steps (e.g. `stepCountIs(4–6)`) + `maxResults: 5` per call                           |
| Max runs per retailer per day | e.g. 3 manual refreshes (configurable constant)                                               |
| Max concurrent research jobs  | Serialize per `retailer_id`; global soft concurrency limit on API                             |
| Prep Mode B (later)           | Hard daily budget (N research runs / prep) separate from draft AI budget                      |
| Logging                       | Log provider, step count, duration on run row metadata — no raw PII beyond what’s already CRM |
| Caching                       | Fresh 7-day window is the cache; do not re-bill Perplexity when fresh unless refresh          |

Draft generation (`gpt-4o` in `generateOgrProductOutreachDraft`) remains a **separate** cost center after staff product pick.

---

## 8. Test plan

| Layer            | Cases                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Identity         | Same name different city → low/unresolved; official site match → high |
| Social absence   | `none_indexed` does not set inactive / operating false                |
| Citations        | Required URL + observed_at; platform enum; accepted flag              |
| Freshness        | &lt;7d fresh; &gt;7d stale; refresh supersedes                        |
| No CRM overwrite | Succeeded research leaves `prospects` unchanged until apply           |
| Apply            | Accepted suggestion writes field change + prospect; rejected no-op    |
| Product match    | Returns 1–3; excludes 90d emailed SKUs; citations attached            |
| Auth             | Unapproved user 401/403 on staff APIs                                 |
| RLS              | Non-staff cannot read research tables                                 |
| Integration      | Match → staff pick → existing generate-draft still works              |

Prefer pure unit tests for identity/match ranking; mock Gateway/Perplexity like existing enrich tests.

---

## 9. Phased PR breakdown

### PR1 — Schema + types + RLS

- See [PR1 plan](../../plans/agent-outreach-account-research-pr1-schema-foundation.md).
- Migration `supabase/migrations/20260823120000_account_research_schema_foundation.sql` landed (eight tables + junctions, CHECKs, partial unique active run, staff RLS, same-run triggers).
- Hand-update `database.ts` + Vitest SQL-content foundation tests.
- **No** prospect pointer columns, APIs, UI, searches, or empty app stubs.

### PR2 — Research run API (retailer-level)

- See [PR2 plan](../../plans/agent-outreach-account-research-pr2-research-service.md).
- Identity gate + six independent platform searches (queued start/process; not one sync Search All request).
- Persist citations + per-source statuses (`none_indexed` etc.); **no** run-level `social_index_status`.
- Freshness helper (`completed_at`, 7 days) + manual refresh; DB-backed daily refresh cap.
- Unit tests for identity and “none_indexed ≠ inactive.”

### PR3 — Profile suggestions + apply

- See [PR3 plan](../../plans/account-research-pr3-profile-suggestions.md).
- Suggestion rows from stored PR2 evidence (no new searches).
- Staff apply/reject → atomic RPC + `retailer_field_changes` + allowlisted prospect updates.
- Pending suggestions on superseded runs marked `superseded` (PR3 migration trigger).
- Explicit: no auto-apply; no UI.

### PR4 — Product match (line-specific)

- See [PR4 plan](../../plans/account-research-pr4-product-match.md).
- `accountProductMatch` using research + `outreachProductSelection` pool + 90d dedup.
- API to create match run; return 1–3 with citation ids.
- Tests for dedup and empty-pool reasons.

### PR5 — UI surfaces

- See [PR5 plan](../../plans/account-research-pr5-ui-surfaces.md).
- Account drawer Research panel: Run / Refresh / citations / suggestions / matches.
- Wire “use selected product → open draft composer / generate-draft.”
- Briefing optional entry point. Completes Mode A staff workflow (PR6 prep optional).

### PR6 — (Optional) Prep integration Mode B

- Only after PR1–5 stable.
- Budgeted research for top N stale targets; still no autosend; drafts still staff-reviewed.
- Update epic README flowchart.

**Out of scope for all phases above:** private social scrapers, unsubscribe selection (separate phase-1 gap), autosend, multi-search-provider abstraction (unless Gateway forces it).

---

## 10. GO / NO-GO

### GO if

- Additive tables land with staff-only RLS.
- Identity gate blocks low-confidence evidence from driving product match.
- Freshness = 7 days with manual refresh.
- CRM fields unchanged until explicit apply.
- Product recommendations cite stored evidence and respect 90-day email dedup.
- Draft/send continue to require staff through existing Product Email path.
- Missing social index never implies inactivity.
- Retailer research and line product match stay separate tables/APIs.

### NO-GO if

- Implementation writes `prospects` / RLA fields automatically from research.
- Nightly prep silently changes product selection based on unreviewed research (Mode B without staff policy).
- Evidence stored only as opaque jsonb on enrichment jobs without citation rows.
- Scraping behind logins or using unofficial private APIs.
- Treating “no social results” as store closed / inactive.
- Bypassing composer / send auth for “research-informed” autosend.
- Collapsing line product picks into retailer research rows (breaks multi-line).

### Decision

**GO to implement behind phased PRs (start PR1–PR2), Mode A only.**  
**NO-GO on Mode B prep integration and social URL columns on `prospects` until Mode A proves citation quality and cost controls.**

---

## 11. Open questions

**Resolved (2026-08-23 locks):**

1. Social URLs remain **citation-only** in v1 (not first-class `prospects` columns).
2. Product match requires explicit `sales_line_id` from line context (no silent OGR default).
3. Picking a matched SKU is sufficient approval for later draft generation (no separate `research_approved` flag).
4. Briefing cards do **not** force Research before Log Call.

**Resolved in PR2 plan (2026-08-23):**

5. URL normalization: lowercase host, strip `www.`/fragment/tracking params, trailing-slash rules; dedupe on `source_url_normalized`.
6. Identity `high` requires official-host agreement **plus** ≥1 corroborator (not model confidence alone).
7. Excerpt max 500 chars; `published_at` null when unknown.
8. `provider_metadata`: non-secret operational fields only (steps, latency, counts).
9. Execution: **queued** start/process (`maxDuration=60` per source); sync Search All is NO-GO.
10. Freshness uses `completed_at`; Search All may satisfy a platform read if that source is fresh; platform never satisfies Search All.

**Still open (non-blocking for PR2 implementation):** fine Shopify CDN heuristics, exact stale-running threshold default (plan suggests 120s), whether website pass always writes `research_brief`.

---

## 12. Reference index

| Topic                    | Path                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Epic overview            | `docs/epics/agentic-outreach/README.md`                                                     |
| Selection                | `src/lib/outreachSelectTargets.ts`, `outreachEligibility.ts`, `outreachProductSelection.ts` |
| Prep                     | `src/lib/outreachNightlyPrep.ts`                                                            |
| Draft                    | `src/lib/generateOgrProductOutreachDraft.ts`                                                |
| Ledger                   | `src/lib/systemMessages.ts`                                                                 |
| Web research today       | `src/lib/companyWebResearch.ts`, `fillBlankProspectFields.ts`, `updateProspectResearch.ts`  |
| Field suggestions ledger | `src/lib/retailerFieldChanges.ts`                                                           |
| Staff auth               | `src/lib/agentAuth.ts`                                                                      |
| Schema / PR1 plan        | `docs/plans/agent-outreach-account-research-pr1-schema-foundation.md`                       |
| Research service / PR2   | `docs/plans/agent-outreach-account-research-pr2-research-service.md`                        |
| Schema (live)            | `supabase/schema.sql`, `src/types/database.ts`                                              |

---

_Document generated from live codebase audit. Implementation must not begin until a PR plan citing this file is approved. This document is planning-only._
