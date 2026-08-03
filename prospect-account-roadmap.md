# Prospect-to-Account lifecycle roadmap

Phased plan for converting BC prospects into Active Accounts with order history and AI reorder reminders.  
Companion to [`roadmap.md`](roadmap.md).

**Branch context:** `feature/prospect-to-account-lifecycle` (from `main`). Phase V requires the AI agent stack from `feature/ai-agent-integration` (or `main` after that work lands).

## How to use (Plan Mode)

Each phase below is sized for **one Plan Mode session → one implementation PR**.

1. Open Plan Mode and paste the phase’s **Plan prompt**.
2. Review the plan; adjust only if exit criteria or out-of-scope need changing.
3. Implement on a dedicated branch; gate with `npm run check` (+ manual smoke listed).
4. Check the phase boxes in this file when the PR merges.

Do **not** combine phases in one plan unless a later phase explicitly lists a dependency merge.

---

## Locked architecture

**Single retailer table.** Extend `prospects` with lifecycle columns — do **not** create a separate `accounts` table. `calls.prospect_id` and directory IDs stay stable; “Active Account” is a status on the same row.

| Concern            | Decision                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Status             | `account_status text` check: `'prospect' \| 'active_account' \| 'inactive'`, default `'prospect'`                               |
| Conversion meta    | `converted_at`, `initial_order_date` on `prospects`                                                                             |
| Orders             | New `orders` table; `account_id integer` references `prospects(id)`                                                             |
| Reorder cadence    | New `account_reorder_settings` (1:1 on `account_id → prospects.id`)                                                             |
| Call outcomes      | Keep **`Closed PO / Written Order`** as the order-placed trigger; add **`Account Converted`** as an explicit conversion outcome |
| Active Accounts UI | Dedicated top-level tab (`TabKey = 'accounts'`), **not** a filter inside Prospects                                              |
| AI reorder         | Phase V only — depends on `/api/agent` + CRM tools from the AI agent branch                                                     |

```text
LogCall (Closed PO / Account Converted) ─┐
Convert to Active Account button ────────┼─► convertToActiveAccount()
                                         │     ├─ prospects.account_status = active_account
                                         │     ├─ orders (initial)
                                         │     └─ account_reorder_settings
Active Accounts tab ◄────────────────────┘
  ├─ AccountOrderHistoryModal
  └─ AI reorder banner ─► /api/agent getReorderSuggestions
```

---

## Phase I — Data foundation

**Status:** Done (this PR)  
**Goal:** Idempotent SQL + TypeScript types only. No UI.  
**Depends on:** nothing  
**Estimate:** 1 PR

### In scope

- [x] Migration: `prospects` lifecycle columns, `orders`, `account_reorder_settings`, indexes, RLS via `is_approved_staff()`
- [x] Mirror updates in [`supabase/schema.sql`](supabase/schema.sql)
- [x] [`src/types/database.ts`](src/types/database.ts): `AccountStatus`, `OrderType`, `ApparelSeason`, `OrderStatus`, table shapes
- [x] Extend [`src/lib/prospects.ts`](src/lib/prospects.ts): map new fields; optional `accountStatus` filter on fetch
- [x] Thin libs: [`src/lib/orders.ts`](src/lib/orders.ts), [`src/lib/accountReorderSettings.ts`](src/lib/accountReorderSettings.ts)
- [x] Domain constants: [`src/lib/apparelSeasons.ts`](src/lib/apparelSeasons.ts)

### Out of scope

- Conversion UX, Active Accounts tab, order modals, AI tools

### Exit criteria

- [x] `npm run check` green
- [x] Migration idempotent (safe to re-run)
- [x] Types compile; no tab UI yet

### Plan prompt

```text
Implement prospect-account-roadmap.md Phase I (Data foundation) only.
Do not start Phase II+. Gate with npm run check.
```

---

## Phase II — Conversion workflow

**Status:** Done (this PR)  
**Goal:** Prospect → Active Account from Log Call and a detail Convert action.  
**Depends on:** Phase I  
**Estimate:** 1 PR

### In scope

- [x] `src/lib/convertToActiveAccount.ts` — set status + timestamps, insert initial order, upsert reorder settings
- [x] [`LogCallModal`](src/components/LogCallModal.tsx): after save, if outcome is `Closed PO / Written Order` or `Account Converted`, prompt convert / log initial order
- [x] Add outcome option `Account Converted`
- [x] Minimal prospect detail slide-over with **Convert to Active Account**
- [x] Unit tests for convert helper + LogCallModal conversion branch

### Out of scope

- Active Accounts tab, AI suggestions, full order history UI

### Exit criteria

- [x] Can convert from call log or detail
- [x] Row shows as `active_account` in DB; initial order persisted
- [x] `npm run check` green

### Plan prompt

```text
Implement prospect-account-roadmap.md Phase II (Conversion workflow) only.
Do not start Phase III+. Gate with npm run check.
```

---

## Phase III — DRY directory + Active Accounts tab

**Status:** Done (this PR)  
**Goal:** Shared directory primitives powering Prospects and a dedicated Active Accounts tab.  
**Depends on:** Phase II  
**Estimate:** 1 PR

### In scope

- [x] Extract [`src/components/directory/RetailerDirectory.tsx`](src/components/directory/RetailerDirectory.tsx) from [`ProspectsTab`](src/components/tabs/ProspectsTab.tsx)
- [x] Refactor ProspectsTab to use shared component; exclude `active_account` by default
- [x] New [`src/components/tabs/ActiveAccountsTab.tsx`](src/components/tabs/ActiveAccountsTab.tsx): TLV / last order / season badges; `+ Log Order / Reorder` stub; AI badge slot
- [x] Wire `TabKey`, [`TabNav`](src/components/TabNav.tsx), [`RepCommandCenter`](src/components/RepCommandCenter.tsx), [`TabNav.test.tsx`](src/components/TabNav.test.tsx)

### Out of scope

- Full order history modal contents, AI engine

### Exit criteria

- [x] Dedicated Active Accounts tab (not a Prospects filter)
- [x] Prospects + Accounts share directory chrome
- [x] `npm run check` + TabNav tests green

### Plan prompt

```text
Implement prospect-account-roadmap.md Phase III (DRY directory + Active Accounts tab) only.
Do not start Phase IV+. Gate with npm run check.
```

---

## Phase IV — Order history + log order

**Status:** Done (this PR)  
**Goal:** Order timeline and log/reorder from Active Accounts.  
**Depends on:** Phase III  
**Estimate:** 1 PR

### In scope

- [x] [`AccountOrderHistoryModal.tsx`](src/components/AccountOrderHistoryModal.tsx) — timeline + apparel season filters
- [x] Log Order / Reorder form (type, line, season, amount, notes, status)
- [x] On save: update `account_reorder_settings.last_order_date`; refresh badges
- [x] Pure helpers + tests for season filter / TLV aggregate

### Out of scope

- AI pitch generation

### Exit criteria

- [x] Order CRUD-lite from Active Accounts; season filters work
- [x] `npm run check` green

### Plan prompt

```text
Implement prospect-account-roadmap.md Phase IV (Order history + log order) only.
Do not start Phase V. Gate with npm run check.
```

---

## Phase V — AI reorder reminders

**Status:** Not started  
**Goal:** Seasonal outreach suggestions + UI highlight on Active Accounts.  
**Depends on:** Phase IV **and** AI agent stack on branch (`src/pages/api/agent.ts`, `createAgentCrmTools`)  
**Estimate:** 1 PR

### Prerequisite

Rebase/merge `feature/ai-agent-integration` (or wait until that work is on `main`) before starting this phase.

### In scope

- [ ] Tool `getReorderSuggestions` on `/api/agent` CRM tools
- [ ] Persist `next_suggested_contact_date` + `ai_reorder_notes`
- [ ] Active Accounts: “AI Suggested Reorder Contact” when contact date ≤ today
- [ ] Tests for suggestion date logic (pure calendar helper; mock tool execute)

### Out of scope

- Reworking unrelated agent tools

### Exit criteria

- [ ] Suggestions return contact date + ~2-sentence pitch
- [ ] Due accounts show AI banner/icon
- [ ] `npm run check` green

### Plan prompt

```text
Implement prospect-account-roadmap.md Phase V (AI reorder reminders) only.
Requires AI agent stack on the branch. Gate with npm run check.
```

---

## Verification (every phase)

```bash
npm run check
```

Apply migrations to the linked Supabase project when ready (`supabase db push` / SQL Editor) — document in the PR; do not force remote apply without confirmation.
