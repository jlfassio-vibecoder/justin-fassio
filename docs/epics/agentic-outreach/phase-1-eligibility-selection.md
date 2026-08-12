# Phase 1 — Eligibility & Selection

**Epic:** [Agentic Outreach & Lead Qualification](./README.md)  
**Depends on:** [Phase 0 — Foundations](./phase-0-foundations.md)  
**Blocks:** Phase 2 (required), Phase 5 (required), informs Phase 4 channel learning

---

## Objective

Deterministically decide **who** may receive outreach and **which product** to feature, so limited daily outreach capacity is spent on highest-probability prospects first — before any AI copy generation.

---

## Why this phase exists

Live CRM and catalog have rich fields, but automated selection is unsafe today:

- no DNC / unsubscribe / contact-level bounce rollup
- no prospect outreach cadence (reorder cadence is Active Account–only)
- dual channel systems (`category` vs `retail_category`)
- Top-ranked logic exists for public badges (cutoff 32), not as an outreach pool API
- agent CRM tools (`getProspectSummary`) under-select planning fields

Phase 1 builds the filter + rank + product-match layer that Phases 2 and 5 call.

---

## Current live-code foundation

### Prospects / contacts

| Artifact | Location |
|----------|----------|
| Table | `prospects` — status `prospect` \| `active_account` \| `inactive`; `converted_at`; `fit_score`; `priority`; `provisional_grade`; `category`; taxonomy JSONB; `retail_category`; etc. |
| Contacts | `account_contacts` — `email`, `is_primary`, roles |
| Taxonomy | `src/lib/crmRetailTaxonomy.ts` |
| Channel map | `src/lib/prospectEnrichment/crmChannelFromRetailCategory.ts` |
| Seed score | `src/lib/prospectEnrichment/seedFitScore.ts`, `priorityGrade.ts` |
| Convert | `src/lib/convertToActiveAccount.ts` |
| Soft company match | `src/lib/companyMatch.ts` |

### Catalog / ranking

| Artifact | Location |
|----------|----------|
| Rank | `salesVolumeRankByProductId` — `src/lib/wholesaleFilters.ts` |
| Top badge cutoff | `BEST_SELLER_BADGE_MAX_RANK = 32` — `src/lib/crmRetailTaxonomy.ts` |
| New | `catalog_items.is_new` / `CatalogItem.isNew` |
| Channels on product | `recommended_channels` (max `MAX_RECOMMENDED_CHANNELS`) |
| Email load gate | `loadPublishedOgrProductForEmail` |
| Filters | `src/lib/catalogFilters.ts` (`NEW`, etc.) |

### Outreach history / bounce

| Artifact | Location |
|----------|----------|
| Sends | `system_messages` (`prospect_id`, `to_email`, `sent_at`, bounce/complaint timestamps) |
| Index | `system_messages_prospect_sent_at_idx`, `system_messages_to_email_idx` |
| Active cadence only | `account_reorder_settings` + `src/lib/reorderCadence.ts` |

---

## Required behavior

### Prospect eligibility (hard filters)

Exclude or fail closed unless explicitly overridden by staff (agent path must not override):

1. `account_status = 'inactive'`
2. Target audience for **new accounts:** prefer `account_status = 'prospect'` (Active Accounts are out of primary goal path; optional nurture mode is out of Epic scope unless product later expands)
3. No usable contact email (empty/invalid format — reuse `isValidOgrProductEmailRecipient` rules where applicable)
4. Duplicate risk: same email already selected in the current batch; prefer primary contact; avoid multiple contacts at same account in one day
5. Pending agent draft already exists for same prospect (or prospect+product) in non-terminal draft/queued state
6. Bounce/complaint suppression: email or contact appeared on `system_messages` with `bounced_at` / `complained_at` / status bounced|complained (define lookback or permanent until cleared)
7. Outreach cooldown: last successful `product_outreach` send to prospect or email within configured window
8. Missing required CRM fields for ranking may demote rather than hard-exclude (configurable)

### Ranking (soft ordering)

Order eligible prospects by best-fit first using live signals, e.g.:

- `priority` / `provisional_grade` / `fit_score`
- channel match to today’s allocation
- apparel capability / qualification hints
- recency of last touch (older first within band, or cooler first — document chosen rule)
- territory density optional later

Deterministic sort; no LLM required for ordering in v1.

### Product eligibility

Pool = union of:

- Top-ranked: sales volume rank ≤ configured N (default align with `BEST_SELLER_BADGE_MAX_RANK` **32**, or product-decided 30)
- New: `is_new = true`

Intersect with `loadPublishedOgrProductForEmail` gates.

### Prospect ↔ product fit

Prefer products whose `recommended_channels` intersect prospect `category` / `secondary_channels` / themes.  
Fallback: best Top/New item for primary channel, then global Top/New.

### Pipeline order

```text
hard eligibility → channel allocation slice → rank prospects → pick product per prospect
→ (Phase 2) AI copy only on survivors
```

AI must not invent ineligible prospects or unpublished products.

---

## Proposed data / schema changes

| Change | Purpose |
|--------|---------|
| Optional suppression fields on `account_contacts` or side table | `do_not_contact`, `email_suppressed_at`, `suppression_reason` — or derive-only from `system_messages` in v1 |
| Config for cooldown days / Top-N / exclude active_account | Staff settings table (may land with Phase 4 goals) or code constants initially |
| Optional unique partial index | Prevent duplicate open drafts per prospect+catalog (application-enforced if index deferred) |

v1 may implement suppression as **queries against `system_messages`** without new columns; document upgrade path.

---

## Server / API changes

| Module | Responsibility |
|--------|----------------|
| `selectEligibleProspects(...)` | Hard filters + rank |
| `selectProductForProspect(...)` | Top/New pool + channel fit |
| `allocateChannelsForDay(...)` | Strategy + optional Phase 4 weights (stub OK) |
| Staff preview API | Dry-run selection for debugging (optional) |

Nightly job (Phase 5) calls these modules; Phase 2 draft generation consumes their output.

---

## UI changes

| Surface | Change |
|---------|--------|
| Phase 1 minimal | None required if APIs/libs only |
| Helpful | Staff “why selected / why excluded” debug on draft or Briefing later |

---

## Business rules

- Eligibility before AI (invariant).
- Primary success audience: prospects not yet Active Accounts.
- One outreach draft per prospect per preparation day (default).
- Do not select contacts without email.
- Prefer `is_primary` contact when multiple emails exist.
- Normalize channel codes via `crmRetailTaxonomy` / mapping helpers; do not mix raw sheet labels with CRM codes in match logic without mapping.
- Top-ranked + New are inclusive pool members; a product can qualify via either path.

---

## Reusable existing files / functions

- `src/lib/crmRetailTaxonomy.ts`
- `src/lib/prospectEnrichment/crmChannelFromRetailCategory.ts`
- `src/lib/prospectEnrichment/seedFitScore.ts`, `priorityGrade.ts`
- `src/lib/wholesaleFilters.ts` (`salesVolumeRankByProductId`)
- `src/lib/loadPublishedOgrProductForEmail.ts`
- `src/lib/catalogFilters.ts`
- `src/lib/systemMessages.ts` (history queries)
- `src/lib/ogrProductEmailLimits.ts` (email validation)
- `src/lib/prospects.ts`, `src/lib/accountContacts.ts`

---

## New files / components likely required

- `src/lib/outreachEligibility.ts` (or similar)
- `src/lib/outreachProductSelection.ts`
- `src/lib/outreachChannelAllocation.ts`
- Unit tests with fixtures for bounce, cooldown, Top/New, channel intersect
- Optional SQL view for “last outreach per prospect” if query cost warrants

---

## Tests

- Inactive / active_account / missing email excluded
- Bounce and complaint emails excluded
- Cooldown excludes recent sends
- Pending draft excludes prospect
- Ranking stable for identical inputs
- Product pool only published Top/New
- Channel intersect prefers matching `recommended_channels`
- Duplicate email in batch collapsed

---

## Acceptance criteria

- [ ] Deterministic eligibility module with documented hard rules
- [ ] Ranked prospect list for a given day/capacity
- [ ] Product selection from Top-ranked / New + publish gates
- [ ] Channel normalization path documented and tested
- [ ] No Resend / no draft insert required for unit tests of selection
- [ ] Phase 2 can consume selection results without re-filtering from scratch

---

## Dependencies

- Phase 0 draft association model (pending-draft exclusion queries agent-origin drafts)
- Live CRM + catalog + `system_messages` history

---

## Non-goals

- AI personalization / intro copy
- Final Warm/Hot thresholds
- Autosend
- Full DNC admin UI (may ship minimal flags later)
- Redesigning taxonomy vocabularies

---

## Migration / deployment considerations

- Prefer query-derived suppression first to ship faster; add denormalized flags if performance requires
- Top-N config: start constant = 32 unless product locks 30
- Document dual-category mapping pitfalls for operators

---

## Risks / edge cases

| Risk | Mitigation |
|------|------------|
| Sparse taxonomy on imported prospects | Demote rather than exclude; fall back to `retail_category` mapping |
| `fit` text vs `fit_score` divergence | Prefer `fit_score` / `priority` for sort |
| Duplicate `account_contacts` emails | Dedupe by normalized email globally in batch |
| Active Account accidentally included | Explicit status filter in tests |
| Unpublished Top seller | Publish gate removes from pool |

---

## Completion checklist

- [ ] Eligibility + selection libraries merged
- [ ] Tests cover suppression and pool rules
- [ ] Channel mapping documented in this Epic folder or code comments
- [ ] Phase 2 contract: input DTO for “selected outreach target” frozen
- [ ] Open decision on Top 30 vs 32 recorded in README
