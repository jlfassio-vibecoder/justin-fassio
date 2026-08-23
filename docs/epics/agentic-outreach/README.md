# Epic: Agentic Outreach & Lead Qualification

**Status:** Implemented (Aug 2026) — Phases 0–5 shipped in code; epic checklists below reflect live behavior.  
**Source of truth:** Live codebase audit (Aug 2026). Where older roadmaps conflict with live code, follow this Epic and the code.

**Business outcome:** Help the rep open **5 new retail accounts per month** through a review-first agentic outreach workflow.

**Out of scope for this Epic:** Autosend, sequences, business-hour dispatch queues, and autonomous reply-aware stopping. Those belong to a future **Autonomous Outreach Dispatch** Epic (see §Future boundary).

---

## 1. Epic objective

Build a human-reviewed agentic sales workflow that:

- recommends the targeted outreach volume required each selling day
- initially uses a reasonable planning assumption when internal conversion data is insufficient
- adapts that recommendation as actual outreach-to-account conversion data accumulates
- targets best-fit prospects first
- rotates/selects retail channels according to marketing strategy and measured performance
- chooses the best-fit Old Guys Rule garment from the eligible Top-ranked / New product pool
- generates short personalized Product Outreach drafts
- prepares drafts overnight for staff review the following morning
- identifies Warm / Hot prospects from tracked engagement
- surfaces Call Today priorities
- treats Prospect → Active Account as the primary success metric
- treats opens, clicks, replies, Warm/Hot qualification, and calls as leading indicators
- learns from channel, product, prospect-fit, and conversion performance over time

Staff always send. The agent never calls Resend.

---

## 2. Current architecture being extended

Live Product Outreach spine (already shipped):

```
ProductDetailDrawer / OgrProductEmailComposerModal
  → POST /api/staff/ogr-product-email
      → requireApprovedStaffClient
      → loadPublishedOgrProductForEmail
      → resolveProductOutreachCrmAssociation
      → resolveStaffOutreachSenderNames
      → renderOgrProductOutreachEmail (+ renderOgrProductEmailCard)
      → sendOgrProductOutreachEmail (Resend)
      → insertProductOutreachSystemMessage
Resend webhooks → /api/webhooks/resend → system_message_events + engagement counters
Line Sheet → product_outreach_engagement_seen (Opened/Clicked badges)
```

Key live artifacts:

| Area             | Location                                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| Ledger           | `system_messages`, `system_message_events`                                      |
| Origin today     | `manual_product_email` only (CHECK)                                             |
| Status allowlist | includes `draft` / `queued` / `scheduled` but app only inserts `sent`           |
| Renderer         | `src/lib/ogrProductOutreachEmail.ts`, `src/lib/ogrProductEmailCard.ts`          |
| Send             | `src/lib/sendOgrProductOutreachEmail.ts`                                        |
| Staff API        | `src/pages/api/staff/ogr-product-email.ts`                                      |
| CRM              | `prospects` (status flip to Active Account), `account_contacts`                 |
| Convert          | `src/lib/convertToActiveAccount.ts` → `converted_at`                            |
| Ranking          | `public_sort_order` → sales volume rank; `BEST_SELLER_BADGE_MAX_RANK = 32`      |
| AI today         | `/api/agent`, enrich/research endpoints, Vercel AI Gateway — no outreach drafts |

This Epic **extends** that spine. It does not create a parallel mail system.

---

## 3. End-to-end workflow

```mermaid
flowchart TD
  goal[Monthly goal: 5 new Active Accounts]
  pace[Daily pace recommendation]
  channel[Channel allocation]
  elig[Prospect eligibility and ranking]
  product[Product selection Top-ranked / New]
  draft[Agent Product Outreach draft]
  review[Morning staff review]
  send[Send via existing Product Email path]
  track[Engagement tracking webhooks]
  qualify[Warm / Hot qualification]
  call[Human call / follow-up]
  convert[Active Account conversion]
  learn[Performance learning]
  revise[Revised targeting and pace]

  goal --> pace --> channel --> elig --> product --> draft --> review --> send
  send --> track --> qualify --> call --> convert --> learn --> revise
  revise --> pace
```

**Narrative flow**

1. Monthly goal drives required outreach volume.
2. Daily pace recommendation (planning assumption → then measured conversion).
3. Retail-channel allocation for the day.
4. Eligible prospects ranked best-fit first.
5. Best-fit garment from Top-ranked / New pool.
6. Agent creates a `product_outreach` **draft** (intro + card + closing).
7. Morning staff review / edit.
8. Staff send through existing Product Email path (Resend + ledger).
9. Opens/clicks via existing webhooks.
10. Warm / Hot / Call Today from aggregated engagement.
11. Human call / follow-up.
12. Prospect → Active Account (`converted_at`).
13. Attribution feeds learning → revised targeting and pace.

**Autosend is explicitly outside this Epic.**

---

## 4. Human-review-first operating model

| Actor                 | May do                                                   | Must not do                                                                        |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Agent / nightly job   | Select, draft, queue for review, brief                   | Call Resend; mark `sent`; auto-dispatch                                            |
| Staff                 | Edit draft, approve, send, call, convert                 | Bypass eligibility when approving agent batch (warn OK; hard-block on suppression) |
| System Message ledger | Own all Product Outreach lifecycle                       | Merge with Gmail threads                                                           |
| Resend                | Transport + webhook engagement for Product Outreach only | Be invoked from agent tools                                                        |

Draft → Review → Send is the only send path for agent-created outreach in this Epic.

---

## 5. Product Outreach contract

Agent-generated outreach **must** use:

| Contract item   | Requirement                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| `message_type`  | `product_outreach`                                                              |
| `origin`        | Distinct agent origin (e.g. `agent_product_email`) — not `manual_product_email` |
| Renderer / card | Existing `renderOgrProductOutreachEmail` + `renderOgrProductEmailCard`          |
| Review / send   | Existing staff review + shared send helpers / staff send API                    |
| Transport       | Existing `sendOgrProductOutreachEmail` (Resend)                                 |
| Ledger          | `system_messages` + `system_message_events`                                     |
| Tracking        | Existing Resend webhook path                                                    |
| Agent → Resend  | **Forbidden**                                                                   |

**Email structure**

1. Short customized intro (prefer **under 50 words**; pique interest, do not close)
2. Existing Old Guys Rule product card (no redesign)
3. Short customized closing
4. Authenticated rep signature (from staff profile — server-owned)

**Subject** (deterministic, non-gimmicky):

```text
Old Guys Rule — [Line Item Name]
```

Implemented today by `defaultOgrProductEmailSubject` in `src/lib/ogrProductOutreachEmail.ts`. Agent drafts must keep this default unless staff explicitly edits before send.

---

## 6. Prospect targeting model

**Source of truth:** `prospects` + `account_contacts` (CRM).

**Eligibility (before AI):** usable email, not inactive, duplicate-safe, bounce/complaint suppressed, cadence/cooldown respected, no conflicting pending draft, CRM associations explicit.

**Ranking inputs (live fields):** `fit_score`, `priority`, `provisional_grade`, `category` / taxonomy JSONB, `retail_category`, `apparel_capability`, `qualification_status`, territory/district, recent outreach history.

**Goal:** spend limited daily outreach capacity on highest-probability prospects first.

---

## 7. Retail-channel strategy

- Primary CRM channel: `prospects.category` + taxonomy (`src/lib/crmRetailTaxonomy.ts`).
- Planning label: `prospects.retail_category` (dual systems — normalize carefully; see Phase 1).
- Product bridge: `catalog_items.recommended_channels` (max 3).
- Daily allocation mixes marketing strategy with measured channel performance (Phase 4–5).
- Channel rotation prevents burning one channel while under-serving others.

---

## 8. Product-selection strategy

Eligible pool:

- **Top-ranked:** sales volume rank from `public_sort_order` via `salesVolumeRankByProductId` (`src/lib/wholesaleFilters.ts`). Live bestseller badge cutoff is `BEST_SELLER_BADGE_MAX_RANK = 32` (`src/lib/crmRetailTaxonomy.ts`) — treat as Top-ranked pool unless product later defines a strict Top 30.
- **New:** `catalog_items.is_new`.
- Must remain publicly emailable: same gates as `loadPublishedOgrProductForEmail` (OGR line, active, published, non-empty `public_slug`).

Fit signals: product `recommended_channels` ∩ prospect channels/themes; lifestyle themes; **recent product→prospect dedup** (`AGENT_OUTREACH_PRODUCT_DEDUP_DAYS`, default 90) excludes catalog items already sent within the window.

Deterministic filter first; AI only chooses among the filtered pool.

---

## 9. Engagement / Warm / Hot concept

**Authoritative engagement ledger:** Resend webhooks → `system_messages` counters/timestamps (`open_count`, `click_count`, `last_opened_at`, `last_clicked_at`, `last_engagement_received_at`, etc.).

**Product-level UI today:** Line Sheet Opened/Clicked via `product_outreach_engagement_seen` — **keep separate** from lead-state UI.

**This Epic adds** prospect/contact-level aggregation and configurable Cold / Warm / Hot / Call Today rules (Phase 3). Clicks carry materially more intent than opens. Thresholds are **provisional by default** (`v1-provisional`); when enough attributed conversions exist, Phase 4 calibrates a measured rules pack (`v1-measured`) from `byLeadState` performance — see [Learning loop](#19-learning-loop-shipped).

**Success hierarchy**

| Tier           | Signals                                   | Meaning          |
| -------------- | ----------------------------------------- | ---------------- |
| **Attention**  | Opens, clicks                             | Message noticed  |
| **Intent**     | Warm / Hot, reply (if attributable), call | Worth human time |
| **Conversion** | Prospect → Active Account                 | Primary success  |

---

## 10. Daily Agent Briefing concept

Morning surface (Phase 5) inside Rep Command Center (`RepCommandCenter` / tabs in `src/types/index.ts`) answering:

- Who should I send to? (drafts ready + pace)
- Who should I call? (Hot / Call Today / Warm)

Includes: monthly goal, accounts opened MTD, projected attainment, recommended pace, drafts ready, channel allocation, Hot/Call Today, Warm, recent meaningful engagement, recent conversions — with navigation to prospect / account / product / draft.

Preferred home: Dashboard top or new briefing tab; secondary deep-link from `AIAssistantModal`. Default app tab today is Line Sheet (`catalog`) — Briefing may become morning default later without removing Line Sheet.

---

## 11. Adaptive outreach-volume concept

1. Staff-configurable monthly Active Account target (default **5**).
2. Until enough attributed conversions exist, use a documented **planning conversion assumption** to recommend daily outreach volume.
3. As attributed outreach → Active Account data accumulates, replace assumption with measured rate.
4. Apply smoothing and minimum-data rules before changing recommendations (Phase 4).
5. Selling days / remaining days in the month adjust pace.

Leading indicators inform confidence; **pace optimization keys off conversion**, not opens alone.

---

## 12. Attribution requirements

Learning requires attributable paths:

```text
system_messages (product_outreach)
  → prospect_id (+ account_contact_id, catalog_item_id)
  → prospects.converted_at / account_status = active_account
```

Requirements:

- Agent drafts carry **explicit** `prospect_id` + `account_contact_id` + `catalog_item_id` (no optional email-only association for agent rows).
- Conversion attribution records enough to know which outreach contributed (Phase 4) — not loose inference from “same month.”
- Opens/clicks remain on the message ledger; do not destroy counters to implement “seen” notifications.

---

## 13. Shared architectural invariants

Preserve across all phases:

1. CRM (`prospects` / `account_contacts`) remains prospect/account source of truth.
2. Product Outreach remains a System Message (`message_type = product_outreach`).
3. Gmail remains the human conversational email system (`gmail_thread_links`, Message Center) — parallel, not merged.
4. Resend remains Product Outreach transport/tracking.
5. Agent drafts never call Resend directly.
6. Staff explicitly sends during this Epic.
7. Existing Opened/Clicked webhook ledger remains authoritative for engagement events.
8. Rep identity comes from authenticated staff profile (`resolveStaffOutreachSenderNames`).
9. Agent-created drafts must carry explicit CRM association.
10. Suppression and eligibility run **before** AI selection.
11. Historical engagement counters are never destroyed for notification state.
12. Conversion learning must be attributable, not inferred loosely.
13. Do not redesign the product card.
14. Do not duplicate the mail renderer/send stack.

---

## 14. Scope

**In scope**

- Agent draft lifecycle on `system_messages`
- Eligibility, ranking, product selection
- Server AI intro/closing generation
- Warm/Hot/Call Today framework
- Monthly goal + adaptive pace
- Attribution + performance learning hooks
- Nightly prep + Daily Agent Briefing
- Human review/edit/send via existing Product Email path

**Explicit out of scope**

- Autosend / autonomous dispatch
- Sequences / drip campaigns
- Business-hour pacing queues and dispatch recovery
- Daily cap enforcement engines beyond briefing recommendations
- Automatic reply-aware stop conditions
- Product card redesign / wholesale storefront changes
- Copy Email Card logging (clipboard ≠ send)
- Full enrichment-doc schema migration (`docs/prospect-enrichment-and-scoring-system.md` fields not yet in DB)
- Replacing Gmail or Message Center

---

## 15. Phase dependency map

| Phase | Document                                                                         | Depends on               | Delivers                                                    |
| ----- | -------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| **0** | [phase-0-foundations.md](./phase-0-foundations.md)                               | Live Product Outreach    | Agent drafts, origin, persist intro/closing, approve→send   |
| **1** | [phase-1-eligibility-selection.md](./phase-1-eligibility-selection.md)           | Phase 0                  | Eligibility, ranking, product pool, deterministic selection |
| **2** | [phase-2-draft-generation.md](./phase-2-draft-generation.md)                     | Phase 0–1                | AI intro/closing, save drafts, review workflow, draft badge |
| **3** | [phase-3-engagement-qualification.md](./phase-3-engagement-qualification.md)     | Phase 0 (+ sends from 2) | Prospect engagement rollup, Cold/Warm/Hot/Call Today        |
| **4** | [phase-4-goals-attribution-learning.md](./phase-4-goals-attribution-learning.md) | Phase 0–3                | Goal, pace, attribution, performance learning               |
| **5** | [phase-5-nightly-briefing.md](./phase-5-nightly-briefing.md)                     | Phase 0–4                | Nightly orchestration, Daily Agent Briefing                 |

Phases 3 and 4 can start design in parallel after Phase 0 lands CRM-linked sends, but Phase 5 requires 1–4 behaviors to be real.

```text
0 Foundations
 └── 1 Eligibility & Selection
      └── 2 Draft Generation
           ├── 3 Engagement Qualification
           └── 4 Goals, Attribution & Learning
                └── 5 Nightly Prep & Daily Briefing
```

---

## 16. Future boundary: Autonomous Outreach Dispatch

Documented for clarity; **not designed in this Epic**.

A future Epic may introduce:

- autosend
- queues
- business-hour pacing
- daily caps (enforced)
- sequences
- stop conditions
- suppression enforcement at dispatch time
- automatic reply-aware stopping
- dispatch recovery

Until that Epic ships, every agent-created Product Outreach email requires explicit staff send.

---

## 17. Document index

| File                                                                             | Purpose                          |
| -------------------------------------------------------------------------------- | -------------------------------- |
| [README.md](./README.md)                                                         | Master Epic contract (this file) |
| [phase-0-foundations.md](./phase-0-foundations.md)                               | Drafts, origin, approve/send     |
| [phase-1-eligibility-selection.md](./phase-1-eligibility-selection.md)           | Who/what to outreach             |
| [phase-2-draft-generation.md](./phase-2-draft-generation.md)                     | AI drafts + human review         |
| [phase-3-engagement-qualification.md](./phase-3-engagement-qualification.md)     | Warm/Hot/Call Today              |
| [phase-4-goals-attribution-learning.md](./phase-4-goals-attribution-learning.md) | Goals, pace, learning            |
| [phase-5-nightly-briefing.md](./phase-5-nightly-briefing.md)                     | Cron + morning briefing          |
| [account-research-before-product-selection.md](./account-research-before-product-selection.md) | **Planned:** public-web account research → profile suggestions → 1–3 product matches (before draft); GO Mode A |

---

## 18. Open decisions (non-blocking for docs; resolve before/during Phase 0–1)

1. Exact agent `origin` string (recommended: `agent_product_email`).
2. Persist intro/closing as first-class columns vs structured `payload` fields.
3. Strict Top **30** vs live Top **32** (`BEST_SELLER_BADGE_MAX_RANK`) for product pool.
4. Briefing UI home: new tab vs Dashboard strip vs both.
5. Initial planning conversion assumption value (e.g. outreach-to-account %) — product decision for Phase 4.
6. Whether Call Today blends email Hot state with `calls.follow_up_date` and Active Account reorder-due.

---

## 19. Learning loop (shipped)

Attribution and performance slices now **feed nightly selection and pace** when data is sufficient (global gate: `minAttributedConversions`, default **8** in `outreach_goal_settings`).

```text
convert → account_conversion_attribution
       → outreachPerformance (byChannel / byProduct / byFitBand / byLeadState)
       → measured weights OR provisional fallbacks
       → nightly prep (pace + selectOutreachTargets) + lead qualification
```

| Learning dimension    | Library                                                         | Wired into                                                                                |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Daily pace            | `outreachPace.ts`, `outreachGoalDashboard.ts`                   | Nightly prep capacity; Dashboard + Briefing KPIs                                          |
| Channel allocation    | `outreachChannelWeights.ts`                                     | `allocateChannelsForDay` (nightly prep)                                                   |
| Product selection     | `outreachProductWeights.ts`                                     | `selectProductForProspect` within channel-fit tiers                                       |
| Prospect fit band     | `outreachFitBandWeights.ts`                                     | `compareOutreachProspectRank` soft boost after `fitScore`                                 |
| Lead rules (Warm/Hot) | `outreachLeadRuleCalibration.ts`, `resolveOutreachLeadRules.ts` | Lead lists, attribution snapshot, Briefing/Dashboard copy — **not** nightly prospect rank |

Staff see measured vs provisional state on **Daily Briefing** (channel allocation meta, learning-slices tables, lead-rule source). Dashboard shows attributed channel and lead-state performance.

**Conservative defaults:** per-slice minimum sends (3), smoothing (`smoothingAlpha`), rate floors, and bounded calibration deltas. Agent still does not send.

**Optional follow-ups (not blocking the loop):**

- ~~Enforce recent product→prospect dedup in selection (§8)~~ — shipped (PR5)
- ~~Persist calibrated `lead_rules` JSON on `outreach_goal_settings`~~ — shipped (PR6)
- ~~Epic doc-only feature-flag note~~ — staff `adaptive_weights_enabled` toggle shipped (PR7)
