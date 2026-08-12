# Phase 3 — Engagement Qualification & Call Priority

**Epic:** [Agentic Outreach & Lead Qualification](./README.md)  
**Depends on:** [Phase 0](./phase-0-foundations.md) (CRM-linked ledger rows); meaningful after staff-sent outreach from Phase 2  
**Informs:** Phase 4 learning, Phase 5 Briefing (“who should I call?”)

---

## Objective

Aggregate Product Outreach engagement (and reliably attributable replies where possible) at **prospect/contact** level, and expose a configurable framework for **Cold / Warm / Hot / Call Today** so the Daily Briefing can answer:

- Who should I send to?
- Who should I call?

Do **not** hardcode final scoring thresholds as permanent law — ship a tunable rules framework. Clicks must carry materially more intent than opens.

---

## Why this phase exists

Live engagement is **message- and product-scoped**:

- Counters/timestamps on `system_messages`
- Line Sheet Opened/Clicked via `deriveProductEngagementAlerts` + `product_outreach_engagement_seen`
- No prospect rollup, no Cold/Warm/Hot, no Call Today queue
- `calls.follow_up_date` exists but is not a today-priority surface
- Gmail replies live in a parallel ledger (`gmail_thread_links`)

Lead qualification needs prospect-level intent without destroying product engagement UX.

---

## Current live-code foundation

| Signal                 | Live source                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sends                  | `system_messages` (`message_type = product_outreach`, `sent_at`, `prospect_id`, `account_contact_id`, `catalog_item_id`) |
| Opens / repeat opens   | `open_count`, `opened_at`, `last_opened_at`                                                                              |
| Clicks / repeat clicks | `click_count`, `clicked_at`, `last_clicked_at`                                                                           |
| Recency / receipt      | `last_engagement_received_at`, `last_event_at`                                                                           |
| Bounce/complaint       | `bounced_at`, `complained_at`, status                                                                                    |
| Product unseen badges  | `product_outreach_engagement_seen`, `CatalogTab.tsx`                                                                     |
| Webhook apply          | `apply_resend_system_message_event`, `src/lib/resendWebhook.ts`                                                          |
| Calls                  | `calls` — `follow_up_date`, `outcome`, `pmf_score`                                                                       |
| Gmail                  | `gmail_thread_links` — confirmed links only                                                                              |
| Active “due”           | `account_reorder_settings.next_suggested_contact_date` (Active Accounts — different goal)                                |

**Invariant:** historical counters remain authoritative; notification “seen” state must not reset counts.

---

## Required behavior

### Aggregation inputs

Per prospect (and optionally per contact):

- emails sent (count + last sent)
- opens / repeated opens
- clicks / repeated clicks
- distinct products engaged
- recency of last open/click/send
- replies **only** when reliably attributable (e.g. confirmed `gmail_thread_links` for same `prospect_id` within a window after a send — do not guess)

### Lead states (framework)

| State          | Intent                          | Design notes                                                                              |
| -------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| **Cold**       | Little/no meaningful engagement | Default after send with no open/click, or aged-out Warm                                   |
| **Warm**       | Attention with some intent      | e.g. opens and/or light click — **configurable**                                          |
| **Hot**        | Strong intent                   | e.g. click(s), multi-product engagement, repeat clicks — **configurable**; clicks ≫ opens |
| **Call Today** | Human action queue              | Hot + optional rules (follow-up date due, explicit staff flag, reply)                     |

Initial rule packs should be config (DB or code constants with version), not magic numbers scattered in UI.

### UI separation

| UI                          | Role                                                |
| --------------------------- | --------------------------------------------------- |
| Line Sheet Opened/Clicked   | Product engagement alerts — **unchanged semantics** |
| Agent draft badge (Phase 2) | Draft readiness — unchanged                         |
| Lead state                  | Prospect/Accounts/Briefing — **new**                |

### Briefing questions

Phase 5 consumes:

- send targets (from drafts/pace — Phases 1–2, 4–5)
- call targets (this phase)

---

## Proposed data / schema changes

| Option                                         | Notes                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A. On-read aggregation                         | Query `system_messages` by `prospect_id`; no new table — fine for v1                       |
| B. Materialized `prospect_outreach_engagement` | Cached rollup + `lead_state` + `lead_state_updated_at` for Briefing performance            |
| Config                                         | `outreach_lead_rules` JSON (weights, windows, version) — prefer with Phase 4 settings home |

Do not change webhook RPC semantics for counters.

Optional: store computed state on draft/briefing snapshot only (Phase 5) if live query is enough initially.

---

## Server / API changes

| Module                                            | Responsibility                                      |
| ------------------------------------------------- | --------------------------------------------------- |
| `aggregateProspectOutreachEngagement(prospectId)` | Roll up messages                                    |
| `evaluateLeadState(aggregate, rules)`             | Return Cold/Warm/Hot + Call Today boolean + reasons |
| `listCallToday(...)` / `listWarmLeads(...)`       | Briefing queries                                    |
| Staff API                                         | Read-only lead lists; optional rules admin later    |

No Resend calls.

---

## UI changes

| Surface                          | Change                                        |
| -------------------------------- | --------------------------------------------- |
| Prospect / Active Account detail | Lead state chip + engagement summary          |
| Call Pipeline / Briefing         | Call Today list with deep links               |
| Dashboard / Briefing             | Warm + Hot sections                           |
| Line Sheet                       | **No** reuse of Opened/Clicked for lead state |

---

## Business rules

- Clicks weighted materially above opens (document ratio in config).
- Repeat clicks / multi-product engagement escalate toward Hot.
- Recency windows decay Warm/Hot back toward Cold (configurable).
- Bounce/complaint ≠ Hot; suppress call priority for suppressed emails.
- Replies count only when attribution confidence is high.
- Call Today can include `calls.follow_up_date <= today` for linked prospects as an additional signal — document blend rule.
- Thresholds tunable after Phase 4 conversion data; do not claim final calibration in this phase.

---

## Reusable existing files / functions

- `src/lib/systemMessages.ts` (history, engagement helpers)
- `src/lib/resendWebhook.ts` (event semantics reference)
- `src/lib/calls.ts`, `src/lib/callAggregates.ts`
- `src/lib/google/gmailThreadLinks.ts` (`listConfirmedLinksForProspect`)
- `src/components/product/ProductEmailHistory.tsx` (per-product; pattern for display)

---

## New files / components likely required

- `src/lib/outreachEngagementAggregate.ts`
- `src/lib/outreachLeadState.ts` + default rules module
- API routes for lead lists
- UI chips/lists for Warm/Hot/Call Today
- Tests with synthetic message timelines

---

## Tests

- Aggregate sums opens/clicks across messages for one prospect
- Click-heavy timeline → higher state than open-only under default rules
- Multi-product engagement escalates
- Decay with age
- Product engagement seen cursor unaffected by lead evaluation
- Unlinked Gmail threads do not count as replies
- Suppressed/bounced contacts excluded from Call Today

---

## Acceptance criteria

- [ ] Prospect-level engagement aggregate from System Messages
- [ ] Configurable Cold/Warm/Hot/Call Today evaluation with click &gt; open weighting
- [ ] Call Today and Warm lists available to Briefing consumers
- [ ] Line Sheet Opened/Clicked behavior unchanged
- [ ] Counters never cleared to implement lead UI
- [ ] Initial thresholds labeled provisional / configurable

---

## Dependencies

- Phase 0 explicit `prospect_id` on agent (and ideally manual) sends for rollup quality
- Phase 2 sends increase signal volume (not a hard code dependency)

---

## Non-goals

- Final permanently fixed score cutoffs
- Autosend stop conditions
- Merging Gmail and Resend into one mailbox UI
- Replacing PMF call dashboard metrics

---

## Migration / deployment considerations

- Ship on-read aggregation first; add materialized rollup if Briefing latency requires
- Version lead rules in config for learning experiments (Phase 4)

---

## Risks / edge cases

| Risk                                | Mitigation                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Manual sends without `prospect_id`  | Soft-match email→contact; prefer Phase 0 discipline on agent; improve manual composer CRM pass-through |
| Bot opens inflate Warm              | Prefer click-weighted rules; optional open thresholds higher                                           |
| Shared seen cursor confusion        | Keep product alerts separate from lead state                                                           |
| Active Account Hot vs new-logo goal | Call Today may still surface accounts; Briefing should label audience                                  |

---

## Completion checklist

- [ ] Aggregate + evaluate libraries
- [ ] Default provisional rules documented
- [ ] Call Today / Warm APIs or lib exports
- [ ] UI chips or Briefing-ready DTOs
- [ ] Tests for weighting and non-destruction of counters
- [ ] Phase 5 can bind “who to call”
