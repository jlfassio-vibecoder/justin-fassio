# Phase 4 — Goals, Attribution & Learning

**Epic:** [Agentic Outreach & Lead Qualification](./README.md)  
**Depends on:** Phases [0](./phase-0-foundations.md)–[3](./phase-3-engagement-qualification.md) for full loop; goal config can begin after Phase 0  
**Blocks:** Phase 5 pace + Briefing KPIs

---

## Objective

Make **Prospect → Active Account** the measurable primary success event, with staff-configurable monthly targets (default **5**), adaptive daily outreach pace, attributable conversion learning, and performance breakdowns by channel, product, prospect-fit, and Warm/Hot — so targeting and volume recommendations improve over time.

---

## Why this phase exists

Live code can convert (`convertToActiveAccount` → `converted_at`) and can send/track Product Outreach, but:

- no monthly account goal or settings surface
- Dashboard (`DashboardTab` + `callAggregates.ts`) is call-PMF oriented, not outreach→account
- no outreach-to-account attribution
- no recommended daily pace
- no learning loop into Phase 1 allocation

Without attribution, adaptive volume and channel rotation cannot be honest.

---

## Current live-code foundation

| Artifact | Location |
|----------|----------|
| Convert | `src/lib/convertToActiveAccount.ts` — sets `account_status = active_account`, `converted_at` |
| UI | `ConvertAccountModal.tsx`, conversion call outcomes in `callOutcomes.ts` |
| Orders | optional initial `orders` row on convert |
| Outreach ledger | `system_messages` with `prospect_id`, `catalog_item_id`, engagement |
| Lead states | Phase 3 framework |
| Settings today | `catalog_settings` (pricing landed rates) — **do not overload** for sales goals |
| Dashboard | `src/components/tabs/DashboardTab.tsx` — calls, reach, PMF, Closed PO — no date window |

---

## Required behavior

### Goal configuration

- Staff-configurable monthly Active Account target
- Default = **5** new accounts / month
- Selling days / remaining selling days in month (define calendar rule: weekdays or custom)

### Metrics

| Metric | Definition sketch |
|--------|-------------------|
| Outreach sent | Count `product_outreach` with `sent_at` in window (manual + agent origins) |
| New accounts opened MTD | Prospects with `converted_at` in month (and status active) |
| Projected attainment | Extrapolate from MTD pace vs remaining days |
| Planning conversion assumption | Bootstrap rate until enough attributed conversions |
| Actual outreach→account conversion | Attributed conversions / attributed outreach (define cohort window) |
| Recommended daily outreach pace | f(goal remaining, days left, conversion rate) with smoothing + minimum-data floor |

### Attribution (required for learning)

Design an attributable path:

```text
system_message (sent, prospect_id, …)
  → prospect converts (converted_at)
  → attribution record links conversion to contributing outreach
```

Minimum viable attribution options (pick in implementation, document choice):

1. **Last-touch:** most recent product_outreach send to prospect before `converted_at` within N days
2. **First-touch** in window
3. **Explicit** staff-selected contributing message at convert time (highest confidence)

Store enough to learn: `prospect_id`, `system_message_id`(s), `catalog_item_id`, channel snapshot, lead state at convert, `converted_at`.

Loose “same month” joins without message linkage are **not** sufficient for learning weights.

### Performance slices

- By retail channel (`prospects.category` / allocation channel)
- By product (`catalog_item_id`)
- By prospect-fit band (`priority` / `fit_score` buckets)
- By Warm/Hot conversion rates (Phase 3 state at or before convert)

### Leading vs primary

| Tier | Examples |
|------|----------|
| Primary | Active Account conversion |
| Leading | Opens, clicks, replies, Warm/Hot, calls |

Pace optimization keys primarily off conversion; leading indicators inform confidence and Call Today, not vanity volume.

### Adaptive volume

1. Insufficient attributed data → use documented planning assumption.
2. Enough data → blend or replace with measured rate.
3. Smoothing / caps prevent wild day-to-day swings.
4. Minimum sample size before trusting measured rate.

---

## Proposed data / schema changes

| Change | Purpose |
|--------|---------|
| `outreach_goals` or staff `app_settings` row | Monthly target, selling-day calendar, planning assumption, smoothing params, Top-N, cooldown (may share with Phase 1) |
| `account_conversion_attribution` (or columns on prospects) | Link convert → system_message(s); `attribution_model`, `attributed_at` |
| Optional convert metadata | `converted_by`, `conversion_source` (`outreach` \| `call` \| `wholesale` \| `manual`) |

Do not put goals in `catalog_settings`.

---

## Server / API changes

| Module | Responsibility |
|--------|----------------|
| Goal CRUD | Staff read/update monthly target + params |
| `computeOutreachPace(...)` | Recommended sends/day |
| `computeGoalProgress(...)` | MTD accounts, projection |
| Attribution writer | Hook from convert flow and/or nightly reconciler |
| Performance reports | Channel/product/fit/Warm-Hot slices for Phase 1/5 |

Extend `convertToActiveAccount` (or post-convert staff API) to record attribution without breaking existing convert UX.

---

## UI changes

| Surface | Change |
|---------|--------|
| Settings or Account/Briefing admin | Edit monthly target + planning assumption |
| Dashboard and/or Briefing | Goal MTD, projection, recommended pace |
| Convert modal | Optional “linked outreach” confirmation |
| Later | Simple performance table for channel/product |

---

## Business rules

- Default target = 5 / month.
- New account = transition to `active_account` with `converted_at` in period (exclude already-active no-ops).
- Planning assumption is explicit and visible to staff (not hidden magic).
- Do not change pace recommendations on &lt; N attributed conversions (config).
- Agent still does not send.
- Learning updates Phase 1 weights / Phase 5 allocation as **inputs**, not autonomous dispatch.

---

## Reusable existing files / functions

- `src/lib/convertToActiveAccount.ts`
- `src/lib/systemMessages.ts`
- `src/lib/callAggregates.ts` / `DashboardTab.tsx` (pattern only — new metrics)
- Phase 3 lead evaluation
- Phase 1 allocation stubs

---

## New files / components likely required

- Migration(s) for goals + attribution
- `src/lib/outreachGoals.ts`, `src/lib/outreachPace.ts`, `src/lib/outreachAttribution.ts`
- Settings UI fragment
- Dashboard/Briefing KPI cards
- Tests for pace math edge cases (0 conversions, end of month, over-goal)

---

## Tests

- Default goal 5
- MTD count uses `converted_at` window
- Pace uses planning assumption below sample threshold
- Pace switches/blends after threshold
- Attribution links message → convert
- Performance aggregations exclude unattributed converts from “learned” weights (or mark confidence)
- No Resend side effects

---

## Acceptance criteria

- [ ] Staff can set monthly Active Account target (default 5)
- [ ] System computes MTD progress, projection, recommended daily outreach
- [ ] Planning assumption documented and used until data suffices
- [ ] Conversion attribution links System Message → Prospect → Active Account
- [ ] Channel/product/fit/Warm-Hot performance available for learning inputs
- [ ] Primary vs leading metrics clearly separated in UI copy

---

## Dependencies

- `converted_at` convert path (live)
- CRM-linked `system_messages` (Phase 0+)
- Phase 3 states for Warm/Hot performance slices
- Phase 1/5 consumers of pace + weights

---

## Non-goals

- Autosend when behind pace
- Replacing call PMF dashboard entirely
- Full BI warehouse
- Guaranteed causal multi-touch attribution science (start with a clear simple model)

---

## Migration / deployment considerations

- Seed default goal row = 5
- Backfill attribution optionally for recent converts (best-effort last-touch) — label confidence
- Feature-flag adaptive weights into Phase 1 until trusted

---

## Risks / edge cases

| Risk | Mitigation |
|------|------------|
| Convert without any outreach | `conversion_source = manual/call`; exclude from outreach conversion rate denominator carefully |
| Multiple sends before convert | Document last-touch vs multi-credit rules |
| Mid-month goal edit | Recalculate pace from remaining target |
| Over-goal early | Pace may floor at minimum touches or zero — product choice |
| Dual category on channel performance | Snapshot channel code at send time into payload/attribution |

---

## Completion checklist

- [ ] Goals settings shipped
- [ ] Pace + progress libraries tested
- [ ] Attribution on convert path
- [ ] Performance slice queries
- [ ] Briefing/Dashboard KPIs wired or exported for Phase 5
- [ ] Planning assumption value decided and documented
