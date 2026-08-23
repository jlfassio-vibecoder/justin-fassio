# Phase 4 — Goals, Attribution & Learning

**Epic:** [Agentic Outreach & Lead Qualification](./README.md)  
**Depends on:** Phases [0](./phase-0-foundations.md)–[3](./phase-3-engagement-qualification.md) for full loop; goal config can begin after Phase 0  
**Blocks:** Phase 5 pace + Briefing KPIs

---

## Objective

Make **Prospect → Active Account** the measurable primary success event, with staff-configurable monthly targets (default **5**), adaptive daily outreach pace, attributable conversion learning, and performance breakdowns by channel, product, prospect-fit, and Warm/Hot — so targeting and volume recommendations improve over time.

---

## Why this phase exists

Phase 4 closes the **learning loop**: attributed conversions drive adaptive pace and measured weights for channel allocation, product selection, fit-band ranking, and lead-rule calibration. Without attribution, volume and rotation recommendations cannot be honest.

**Shipped (Aug 2026):** goals settings, pace/progress, conversion attribution, performance slices, and learning inputs wired into Phase 1 nightly selection and Phase 3 lead qualification.

---

## Current live-code foundation

| Artifact        | Location                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------- |
| Goals           | `outreach_goal_settings` — `src/lib/outreachGoals.ts` (default target **5**, planning rate **1.5%**) |
| Pace / progress | `src/lib/outreachPace.ts`, `src/lib/outreachGoalDashboard.ts`                                |
| Convert         | `src/lib/convertToActiveAccount.ts` — sets `account_status = active_account`, `converted_at` |
| Attribution     | `account_conversion_attribution` — `src/lib/outreachAttribution.ts` (staff-confirmed + last-touch) |
| Performance     | `src/lib/outreachPerformance.ts` — slices + `attributionCohort` for lead-rule calibration    |
| Channel weights | `src/lib/outreachChannelWeights.ts` → `outreachNightlyPrep` → `allocateChannelsForDay`       |
| Product weights | `src/lib/outreachProductWeights.ts` → `selectProductForProspect`                             |
| Fit-band weights| `src/lib/outreachFitBandWeights.ts` → `compareOutreachProspectRank`                          |
| Lead rules      | `src/lib/outreachLeadRuleCalibration.ts`, `resolveOutreachLeadRules.ts` → lead lists + convert snapshot |
| UI              | `OutreachGoalsSettingsCard`, `DashboardTab`, `AgentBriefingTab` learning slices              |
| Outreach ledger | `system_messages` with `prospect_id`, `catalog_item_id`, engagement                          |
| Lead states     | Phase 3 — `outreachLeadState.ts`, provisional + measured rules                               |

---

## Required behavior

### Goal configuration

- Staff-configurable monthly Active Account target
- Default = **5** new accounts / month
- Selling days / remaining selling days in month (define calendar rule: weekdays or custom)

### Metrics

| Metric                             | Definition sketch                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Outreach sent                      | Count `product_outreach` with `sent_at` in window (manual + agent origins)        |
| New accounts opened MTD            | Prospects with `converted_at` in month (and status active)                        |
| Projected attainment               | Extrapolate from MTD pace vs remaining days                                       |
| Planning conversion assumption     | Bootstrap rate until enough attributed conversions                                |
| Actual outreach→account conversion | Attributed conversions / attributed outreach (define cohort window)               |
| Recommended daily outreach pace    | f(goal remaining, days left, conversion rate) with smoothing + minimum-data floor |

### Attribution (required for learning)

Design an attributable path:

```text
system_message (sent, prospect_id, …)
  → prospect converts (converted_at)
  → attribution record links conversion to contributing outreach
```

Minimum viable attribution — **implemented choice:**

1. **Staff-confirmed** at convert (highest confidence) when staff selects contributing message
2. **Last-touch** fallback within `lastTouchWindowDays` (default 45) when staff does not choose
3. **None** when no qualifying outreach in window

Store enough to learn: `prospect_id`, `system_message_id`(s), `catalog_item_id`, channel snapshot, lead state + score at convert, `rules_version`, `converted_at`.

Loose “same month” joins without message linkage are **not** sufficient for learning weights.

### Performance slices

- By retail channel (`prospects.category` / allocation channel) — sends + attributed conversions
- By product (`catalog_item_id`)
- By prospect-fit band (`fit_score` buckets via `fitBandKey`)
- By lead state (Warm/Hot/Cold at convert; send denominators via historical state at send time)

Slices feed **reporting** (Dashboard, Briefing) and **weight computation** (channel, product, fit-band, lead-rule calibration). Unattributed converts are excluded from learned numerators.

### Learning loop wiring

| Input | When measured | Consumer |
| ----- | ------------- | -------- |
| Pace / volume | `totalAttributed >= minAttributedConversions` | `outreachNightlyPrep` capacity |
| Channel weights | Same global gate + `MIN_CHANNEL_SENDS` per slice | `allocateChannelsForDay` |
| Product weights | Same + `MIN_PRODUCT_SENDS` | `selectProductForProspect` (within tier) |
| Fit-band weights | Same + `MIN_FIT_BAND_SENDS` | `compareOutreachProspectRank` (after `fitScore`) |
| Lead rules | Same + `MIN_LEAD_STATE_SENDS`; cohort from attribution rows | `resolveOutreachLeadRules` → lead lists + convert snapshot |

Below the gate: planning conversion assumption (pace), even channel rotation, rank-only product/fit selection, provisional lead rules (`v1-provisional`).

### Leading vs primary

| Tier    | Examples                                |
| ------- | --------------------------------------- |
| Primary | Active Account conversion               |
| Leading | Opens, clicks, replies, Warm/Hot, calls |

Pace optimization keys primarily off conversion; leading indicators inform confidence and Call Today, not vanity volume.

### Adaptive volume

1. Insufficient attributed data → use documented planning assumption.
2. Enough data → blend or replace with measured rate.
3. Smoothing / caps prevent wild day-to-day swings.
4. Minimum sample size before trusting measured rate.

---

## Proposed data / schema changes

| Change                                                     | Purpose                                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `outreach_goals` or staff `app_settings` row               | Monthly target, selling-day calendar, planning assumption, smoothing params, Top-N, cooldown (may share with Phase 1) |
| `account_conversion_attribution` (or columns on prospects) | Link convert → system_message(s); `attribution_model`, `attributed_at`                                                |
| Optional convert metadata                                  | `converted_by`, `conversion_source` (`outreach` \| `call` \| `wholesale` \| `manual`)                                 |

Do not put goals in `catalog_settings`.

---

## Server / API changes

| Module                     | Responsibility                                    |
| -------------------------- | ------------------------------------------------- |
| Goal CRUD                  | Staff read/update monthly target + params         |
| `computeOutreachPace(...)` | Recommended sends/day                             |
| `computeGoalProgress(...)` | MTD accounts, projection                          |
| Attribution writer         | Hook from convert flow and/or nightly reconciler  |
| Performance reports        | Channel/product/fit/Warm-Hot slices for Phase 1/5 |

Extend `convertToActiveAccount` (or post-convert staff API) to record attribution without breaking existing convert UX.

---

## UI changes

| Surface                            | Change                                       |
| ---------------------------------- | -------------------------------------------- |
| Convert modal                      | Staff-confirmed attribution + last-touch fallback (`ConvertAccountModal.tsx`) |
| Dashboard and Briefing             | Goal MTD, projection, pace, learning slices (channel, product, fit band, lead state) |

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
- `src/lib/callAggregates.ts` / `DashboardTab.tsx` (call PMF metrics coexist with outreach KPIs)
- Phase 3 lead evaluation + `resolveOutreachLeadRules`
- Phase 1 allocation + selection (weight consumers)

---

## Shipped libraries (Aug 2026)

- `src/lib/outreachGoals.ts`, `src/lib/outreachPace.ts`, `src/lib/outreachAttribution.ts`
- `src/lib/outreachPerformance.ts`
- `src/lib/outreachChannelWeights.ts`, `outreachProductWeights.ts`, `outreachFitBandWeights.ts`
- `src/lib/outreachLeadRuleCalibration.ts`, `resolveOutreachLeadRules.ts`
- `OutreachGoalsSettingsCard`, Dashboard/Briefing KPI + learning-slice UI
- Tests for pace math, attribution, weights, calibration, and performance aggregation

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

- [x] Staff can set monthly Active Account target (default 5)
- [x] System computes MTD progress, projection, recommended daily outreach
- [x] Planning assumption documented and used until data suffices (default **1.5%** in `outreach_goal_settings`)
- [x] Conversion attribution links System Message → Prospect → Active Account
- [x] Channel/product/fit/lead-state performance available for learning inputs and wired into nightly prep (channel, product, fit-band) and lead qualification (lead rules)
- [x] Primary vs leading metrics clearly separated in UI copy

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

- Seed default goal row = 5 (migration `20260812120000_outreach_goals_and_attribution.sql`)
- Backfill attribution optionally for recent converts (best-effort last-touch) — `backfillRecentConversionAttribution`
- Measured weights are **always-on** behind `minAttributedConversions` global gate (epic originally suggested a feature flag; conservative gate used instead)

---

## Risks / edge cases

| Risk                                 | Mitigation                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Convert without any outreach         | `conversion_source = manual/call`; exclude from outreach conversion rate denominator carefully |
| Multiple sends before convert        | Document last-touch vs multi-credit rules                                                      |
| Mid-month goal edit                  | Recalculate pace from remaining target                                                         |
| Over-goal early                      | Pace may floor at minimum touches or zero — product choice                                     |
| Dual category on channel performance | Snapshot channel code at send time into payload/attribution                                    |

---

## Completion checklist

- [x] Goals settings shipped
- [x] Pace + progress libraries tested
- [x] Attribution on convert path
- [x] Performance slice queries
- [x] Briefing/Dashboard KPIs wired or exported for Phase 5
- [x] Planning assumption value decided and documented (**1.5%** default)
- [x] Learning loop wired: channel, product, fit-band weights + lead-rule calibration
