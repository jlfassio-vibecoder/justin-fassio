# Phase 1C — Temporary Dual-Write Compatibility (implementation plan)

**Status:** Ready for implementation approval  
**Date:** 2026-08-14  
**Branch:** `feature/multi-line-multi-territory-implementation`  
**Prerequisites:** Phase 1A + Phase 1B applied on disposable local Supabase only (`…100000`, `…110000`, `…115000`, `…120000`)

**Sources of truth (do not redesign architecture):**

- [docs/epics/multi-line-multi-territory-crm.md](../docs/epics/multi-line-multi-territory-crm.md) Phase 1 / expand-contract step 3
- [docs/plans/multi-line-phase-1-schema-foundation.md](../docs/plans/multi-line-phase-1-schema-foundation.md) §10, §13, §14, §16–§21, Appendix G PR 3
- [plan/multi-line-phase-1b-ogr-backfill.md](multi-line-phase-1b-ogr-backfill.md) §11 remainder

This document is the **agent-executable** Phase 1C implementation brief. Follow it exactly. Do not invent territory, currency, or non-OGR accounts. Do not begin Phase 2.

---

## Locked decisions (no agent discretion)

| Decision                         | Choice                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sync direction                   | **One-way** `prospects` → OGR `retailer_line_accounts`. No RLA → prospects reverse sync (Phase 3)                                                |
| Line scope                       | **OGR only**. Never insert Eagle Peak / Big Fish / BKG / prospective accounts or targets                                                         |
| Implementation layer             | **DB triggers only**. No React, routes, API handlers, `LINE_SELECT`, feature flags, or `database.ts`                                             |
| Territory on **new** RLA insert  | Same as 1B: `territories.code = bc` → OGR–BC; else NULL + `non_bc_territory` / `ambiguous_territory` queue. Never infer from address/city/region |
| Territory on RLA **update**      | **Do not change** `sales_line_territory_id`                                                                                                      |
| Currency on CAD-only inserts     | CAD `legacy_cad_column` defaults. Never invent USD. Never alter `total_amount_cad`                                                               |
| Hosted / staging / production DB | **Forbidden**. Foundation “staging smoke” = **local disposable-DB smoke** for this plan                                                          |
| `src/types/database.ts`          | **Do not change**                                                                                                                                |
| Commit / push / deploy           | **Forbidden** unless the user separately asks after implementation                                                                               |

---

## Non-goals / Phase 2+ exclusions

Do **not** in Phase 1C:

- Change React islands, API routes, pages, `LINE_SELECT` consumers, or public RPCs
- Enable or introduce `FEATURE_MULTI_LINE_UI` / application cutover
- Switch reads or writes to line accounts as the UI source of truth
- Reverse-sync RLA → `prospects`
- Create Eagle Peak / Big Fish / BKG / prospective operational accounts
- Infer territory from address/city/region
- Invent USD or combine CAD and USD
- Touch staging, production, or any hosted database
- Rename `prospects` → `retailers` or drop dual-write columns
- Write `retailer_field_changes` (Phase 4)
- Add staff-line RLS, territory admin UI, Prospective Lines UI
- Commit or push unless the user separately asks

Those remain **Phase 2+**.

---

## Reinspection snapshot (plan authorship)

| Check                       | Result                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Branch                      | `feature/multi-line-multi-territory-implementation`                                          |
| HEAD at plan authorship     | `ded8fa3` (Phase 1B committed)                                                               |
| 1A / 1B migrations          | Present: `…100000`, `…110000`, `…115000`, `…120000`                                          |
| 1C migration / tests / plan | **Absent** before this plan file (`…130000`, `multiLinePhase1cDualWrite.test.ts`)            |
| App write paths             | Still legacy-only; no `retailer_line_accounts` / `retailer_line_account_id` writes in `src/` |

If any hard-stop later finds missing active OGR, missing OGR–BC, or non-OGR operational accounts already created by 1C code, **stop** and report — do not guess.

---

## 1. Ordered implementation steps

1. Confirm branch + Phase 1A/1B migrations exist; ensure `…130000` is absent.
2. Confirm local DB has 1A+1B applied on `127.0.0.1:54322` only (§3); **stop** if preflight fails.
3. Create `supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql` with the objects in §4.
4. Mirror 1C functions and triggers in `supabase/schema.sql`.
5. Create `src/lib/multiLinePhase1cDualWrite.test.ts` (SQL-text assertions; pattern of `multiLinePhase1aSchema.test.ts` / `multiLinePhase1bBackfill.test.ts`).
6. Apply locally: `npx supabase migration up --local` (or `db reset` then up through `…130000` if the local chain is dirty).
7. Run local disposable-DB smoke queries (§7); confirm expected behaviors.
8. Run `npx vitest run src/lib/multiLinePhase1cDualWrite.test.ts` then `npm run check`.
9. Append a short **Implementation results — Phase 1C** section to `docs/plans/multi-line-phase-1-schema-foundation.md` (status/results only; no architecture rewrite).
10. **Stop.** Do not commit/push unless asked. Do not start Phase 2.

---

## 2. Exact files to create or modify

| File                                                                  | Action                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql` | **Create** — dual-write triggers and helper functions only   |
| `supabase/schema.sql`                                                 | **Modify** — mirror 1C functions/triggers only               |
| `src/lib/multiLinePhase1cDualWrite.test.ts`                           | **Create** — migration SQL string assertions                 |
| `docs/plans/multi-line-phase-1-schema-foundation.md`                  | **Modify** — 1C implementation-results section after success |

**Do not touch:** `src/types/database.ts`, React/API/routes, historical migrations (`…100000`–`…120000`), production/staging data, public RPCs.

---

## 3. Preflight checks and stop conditions

### 3.1 Blocking queries (local `127.0.0.1:54322` only)

```sql
-- Must exist: status = active
select id, status, default_currency from lines where code = 'ogr';

-- Must exist: active OGR–BC sales_line_territories
select slt.id, slt.status, slt.rights_type
from sales_line_territories slt
join lines l on l.id = slt.sales_line_id
join territories t on t.id = slt.territory_id
where l.code = 'ogr' and t.code = 'bc' and slt.status = 'active';

-- 1B already applied: OGR RLA count should equal prospects
select
  (select count(*) from prospects) as prospects,
  (select count(*) from retailer_line_accounts rla
     join lines l on l.id = rla.sales_line_id where l.code = 'ogr') as ogr_accounts;

-- Must be 0
select l.code, count(rla.id)
from lines l
left join retailer_line_accounts rla on rla.sales_line_id = l.id
where l.code in ('eagle-peak','big-fish','bkg') or l.status = 'prospective'
group by 1;

-- Dual-write not yet installed
select tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relname in ('prospects', 'account_contacts')
  and tgname like '%ogr%sync%';
```

### 3.2 Hard stops (abort before writing 1C if true)

1. `lines.code = 'ogr'` missing or `status <> 'active'`.
2. OGR–BC `sales_line_territories` row missing or not `active`.
3. Any existing `retailer_line_accounts` for `eagle-peak`, `big-fish`, `bkg`, or `lines.status = 'prospective'`.
4. Phase 1B not applied (OGR RLA count ≠ prospects count on a DB that already has prospects).
5. Hosted/staging/production connection detected — **never proceed**.

---

## 4. Dual-write objects (one migration)

Single migration file = one Postgres transaction. Order inside `…130000`:

```
helpers → prospect AFTER sync → contact AFTER sync → BEFORE INSERT fillers → mirror-ready names
```

```mermaid
flowchart LR
  ui[Unchanged staff UI and APIs]
  prospects[prospects]
  contacts[account_contacts]
  ops[orders calls and peers]
  rla[OGR retailer_line_accounts]
  rlc[retailer_line_contacts]
  ui --> prospects
  ui --> contacts
  ui --> ops
  prospects -->|"AFTER INSERT OR UPDATE"| rla
  contacts -->|"AFTER INSERT"| rlc
  ops -->|"BEFORE INSERT fill"| rla
```

Prospective / order / outreach guards from Phase 1A remain in place. Do **not** recreate them in 1C.

### 4.1 Shared helper

```sql
create or replace function public.ogr_retailer_line_account_id_for_retailer(p_retailer_id integer)
returns uuid
language sql
stable
as $$
  select rla.id
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  where rla.retailer_id = p_retailer_id
    and rla.relationship_status <> 'terminated'
  limit 1;
$$;
```

Also provide an internal helper (same migration) to **ensure** an OGR RLA exists for a prospect id (used by contact sync and optionally by fillers that must create-then-stamp). Reuse the same column map / BC-only territory rules as §4.2 insert path. Prefer calling one shared PL/pgSQL routine from both prospect and contact triggers to avoid divergent mapping.

### 4.2 `AFTER INSERT OR UPDATE ON prospects`

**Function:** `public.sync_ogr_retailer_line_account_from_prospect()`  
**Trigger:** `prospects_sync_ogr_retailer_line_account`

Behavior:

1. If `pg_trigger_depth() > 1`, return `NEW` immediately.
2. Resolve `lines.code = 'ogr'` and `status = 'active'`; else `RAISE EXCEPTION`.
3. **INSERT** OGR RLA when no non-terminated OGR row exists for `NEW.id`:
   - `retailer_id = NEW.id`
   - status map:

| `prospects.account_status` | `relationship_status` |
| -------------------------- | --------------------- |
| `prospect`                 | `prospect`            |
| `active_account`           | `opened`              |
| `inactive`                 | `inactive`            |

- copy foundation §10.2 commercial/planning columns (same list as 1B):  
  `converted_at`, `initial_order_date`, `notes`, `fit`, `fit_score`, `ideal_opening_units`, `priority`, `provisional_grade`, `verification_status`, `buyer_verified`, `apparel_capability`, `existing_ogr`, `qualification_status`, `next_action`, `source_note`, `region`, `primary_district`, `subterritory`, `secondary_channels`, `retail_subchannels`, `venue_contexts`, `lifestyle_themes`, `retail_capabilities`
- territory (insert only): join `NEW.territory_id` → `territories.code`
  - `bc` → OGR–BC `sales_line_territory_id`
  - `or`/`wa`/`ca`/`ab`/`norcal` → NULL + `backfill_review_reason = 'non_bc_territory'` + review-queue row
  - unknown / join miss → NULL + `ambiguous_territory` + review-queue row
- review-queue insert guarded by `NOT EXISTS` unresolved `(entity_type, entity_id, reason)`

4. **UPDATE** existing non-terminated OGR RLA **only if commercial columns differ** (update-only-if-changed). Do **not** touch `sales_line_territory_id`, `retailer_id`, or `sales_line_id`.
5. Trigger `WHEN` on UPDATE: fire only when commercial/mapped columns `IS DISTINCT FROM` old values (not name/city/address/`territory_id`/identity).
6. Never write Eagle Peak / Big Fish / BKG / prospective `sales_line_id`.
7. Never write back to `prospects`.

Identity columns stay on `prospects` only (§10.1): `id`, `name`, `category`, `city`, `address`, `phone`, `website`, `territory_id`, `external_id`, `retail_category`, timestamps.

### 4.3 `AFTER INSERT ON account_contacts`

**Function:** `public.sync_ogr_retailer_line_contact_from_account_contact()`  
**Trigger:** `account_contacts_sync_ogr_retailer_line_contact`

Behavior:

1. Depth guard (`pg_trigger_depth() > 1` → return).
2. If OGR RLA missing for `NEW.account_id`, create it via the shared ensure path using the parent `prospects` row (so contact-after-prospect in one transaction works; contact insert against an existing prospect also works).
3. Insert into `retailer_line_contacts` with same `role` / `is_primary` / `notes`.
4. `ON CONFLICT (retailer_line_account_id, account_contact_id) DO NOTHING`.
5. **No AFTER UPDATE** on contacts (not in foundation §13). Contact `role` / `is_primary` edits stay on `account_contacts` until Phase 3.
6. **No AFTER DELETE** — `retailer_line_contacts.account_contact_id` references `account_contacts(id) ON DELETE CASCADE`.

### 4.4 `BEFORE INSERT` fillers — orders and peers

Shared pattern: if `NEW.retailer_line_account_id IS NULL` and retailer/prospect resolves to a non-terminated OGR RLA (create via ensure if prospect exists and RLA missing), set `NEW.retailer_line_account_id`.

| Table                            | Fill when                                        | Extra                                                                                                                                 |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `orders`                         | RLA null and `account_id` resolves               | Set `line_id` to OGR if null; if non-null and not OGR → `RAISE EXCEPTION`; CAD defaults if conversion fields null                     |
| `calls`                          | RLA null and `prospect_id` exists in `prospects` | Same `line_id` rule; leave orphan `line_id`/RLA null; CAD estimate fill when `order_value_cad IS NOT NULL` and conversion fields null |
| `system_messages`                | RLA null and non-null `prospect_id` resolves     | Stamp RLA only                                                                                                                        |
| `gmail_thread_links`             | same                                             | Stamp RLA only                                                                                                                        |
| `calendar_event_links`           | same                                             | Stamp RLA only                                                                                                                        |
| `message_threads`                | same                                             | Stamp RLA only                                                                                                                        |
| `wholesale_order_requests`       | same                                             | Stamp RLA only; **do not** copy USD wholesale totals onto CAD order columns                                                           |
| `account_conversion_attribution` | same                                             | Stamp RLA only                                                                                                                        |
| `prospect_updates`               | same                                             | Stamp RLA only                                                                                                                        |
| `account_reorder_settings`       | RLA null and `account_id` resolves               | Stamp RLA only                                                                                                                        |

**Do not stamp:** `profiles`, catalog tables, `outreach_goal_settings`.  
**BEFORE INSERT only** — no operational UPDATE fillers in 1C.

**Orders CAD defaults** (only when conversion fields null / CAD-only insert):

- `original_amount = total_amount_cad`
- `original_currency = 'CAD'`
- `exchange_rate = 1`
- `exchange_rate_date = order_date`
- `converted_amount = total_amount_cad`
- `converted_currency = 'CAD'`
- `conversion_source = 'legacy_cad_column'`
- Do **not** alter `total_amount_cad`
- Do **not** invent USD

**Calls estimate fill** when `order_value_cad IS NOT NULL` and conversion fields null: same CAD / rate `1` / `legacy_cad_column` pattern on `order_value_original_*` / `order_value_converted_*` / `order_value_conversion_source`.

Suggested function names (implementer may keep these exact names for schema mirror + tests):

| Function                                                             | Attached to                                       |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `public.fill_ogr_retailer_line_account_on_order()`                   | `BEFORE INSERT ON orders`                         |
| `public.fill_ogr_retailer_line_account_on_call()`                    | `BEFORE INSERT ON calls`                          |
| `public.fill_ogr_retailer_line_account_on_system_message()`          | `BEFORE INSERT ON system_messages`                |
| `public.fill_ogr_retailer_line_account_on_reorder_settings()`        | `BEFORE INSERT ON account_reorder_settings`       |
| `public.fill_ogr_retailer_line_account_on_gmail_thread_link()`       | `BEFORE INSERT ON gmail_thread_links`             |
| `public.fill_ogr_retailer_line_account_on_calendar_event_link()`     | `BEFORE INSERT ON calendar_event_links`           |
| `public.fill_ogr_retailer_line_account_on_message_thread()`          | `BEFORE INSERT ON message_threads`                |
| `public.fill_ogr_retailer_line_account_on_wholesale_order_request()` | `BEFORE INSERT ON wholesale_order_requests`       |
| `public.fill_ogr_retailer_line_account_on_conversion_attribution()`  | `BEFORE INSERT ON account_conversion_attribution` |
| `public.fill_ogr_retailer_line_account_on_prospect_update()`         | `BEFORE INSERT ON prospect_updates`               |

A shared private helper that sets RLA (and optionally `line_id` / CAD) is preferred over copy-pasted bodies.

---

## 5. Exact legacy write paths requiring synchronization

These paths must keep working **without application code changes**. Triggers alone provide compatibility.

### 5.1 `prospects` (→ OGR RLA)

| Writer                                      | File                                | Op     | Why dual-write matters                         |
| ------------------------------------------- | ----------------------------------- | ------ | ---------------------------------------------- |
| `createEnrichedProspect` / `insertProspect` | `src/lib/createEnrichedProspect.ts` | INSERT | New retailer must get OGR RLA                  |
| `createInboundProspect`                     | `src/lib/wholesaleProspectMatch.ts` | INSERT | Wholesale inbound new store                    |
| `updateProspectNotes`                       | `src/lib/prospects.ts`              | UPDATE | Notes mirror                                   |
| `updateProspectTaxonomy`                    | `src/lib/prospects.ts`              | UPDATE | Taxonomy jsonb mirror                          |
| `convertToActiveAccount`                    | `src/lib/convertToActiveAccount.ts` | UPDATE | `active_account` → `opened` + commercial dates |
| `demoteToProspect`                          | `src/lib/convertToActiveAccount.ts` | UPDATE | `prospect` status reverse                      |
| `applyProspectResearchUpdate`               | `src/lib/updateProspectResearch.ts` | UPDATE | Research / fill-blanks commercial fields       |

API routes that only delegate to the above stay untouched:  
`src/pages/api/prospects/enrich.ts`, `…/research-update/apply.ts`, `…/wholesale/order-requests.ts`.

### 5.2 `account_contacts` (→ OGR `retailer_line_contacts`)

| Writer                    | File                                | Op     |
| ------------------------- | ----------------------------------- | ------ |
| `insertAccountContact`    | `src/lib/accountContacts.ts`        | INSERT |
| `insertBuyerContact`      | `src/lib/createEnrichedProspect.ts` | INSERT |
| `insertContactForAccount` | `src/lib/createEnrichedContact.ts`  | INSERT |
| Wholesale contact insert  | `src/lib/wholesaleProspectMatch.ts` | INSERT |

`updateAccountContact` / `deleteAccountContact`: no 1C sync trigger required (UPDATE deferred; DELETE cascades junction).

### 5.3 `orders` / `calls` / peers (→ stamp `retailer_line_account_id`)

| Writer                         | File                                        | Table                            | Op     | Notes                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------- | -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insertOrder`                  | `src/lib/orders.ts`                         | `orders`                         | INSERT | Sets `account_id`, often `line_id` via `resolveOgrLineId`, `total_amount_cad`; omits RLA/finance                                                                      |
| Convert initial order          | `src/lib/convertToActiveAccount.ts`         | `orders`                         | INSERT | Via `insertOrder`                                                                                                                                                     |
| Log Call                       | `src/components/LogCallModal.tsx`           | `calls`                          | INSERT | Direct client insert; omits `line_id` and RLA                                                                                                                         |
| `upsertAccountReorderSettings` | `src/lib/accountReorderSettings.ts`         | `account_reorder_settings`       | UPSERT | BEFORE INSERT covers insert path; upsert update path may leave RLA null if row already existed pre-1C — acceptable for 1C (1B stamped existing); new inserts get fill |
| Wholesale `prospect_updates`   | `src/pages/api/wholesale/order-requests.ts` | `prospect_updates`               | INSERT | Stamp when prospect resolves                                                                                                                                          |
| `recordConversionAttribution`  | `src/lib/outreachAttribution.ts`            | `account_conversion_attribution` | INSERT | Stamp when prospect resolves                                                                                                                                          |

Gmail / Calendar / message_threads / system_messages / wholesale_order_requests inserts from existing libs follow the same BEFORE INSERT fill when they write those tables.

---

## 6. Recursion and duplicate-write protection

| Guard                  | Requirement                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Depth                  | `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;` on AFTER sync functions                                         |
| Update-only-if-changed | UPDATE OGR RLA only when mapped commercial columns differ                                                            |
| Prospect UPDATE `WHEN` | Commercial columns only — not name/city/address/`territory_id`                                                       |
| Idempotent RLA insert  | `NOT EXISTS` non-terminated OGR row (matches `retailer_line_accounts_retailer_line_operational_uidx`)                |
| Contact conflict       | `ON CONFLICT (retailer_line_account_id, account_contact_id) DO NOTHING`                                              |
| Operational fillers    | Only when `retailer_line_account_id IS NULL`                                                                         |
| No reverse write       | No trigger writes to `prospects` (prevents foundation §19 loop)                                                      |
| Amplification abort    | Roll back Phase 1C (drop triggers/functions) if recursion or write amplification is detected (foundation Appendix E) |

---

## 7. Local disposable-DB tests

### 7.1 Apply procedure

1. Ensure Docker + local Supabase are running (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
2. Confirm Phase 1A + 1B applied.
3. Prefer `npx supabase migration up --local` to apply only `…130000`.
4. If the local chain is inconsistent, `npx supabase db reset` then migrate through `…130000`.
5. **Never** point CLI or `psql` at hosted/staging/production.

### 7.2 Smoke scenarios (transactional `BEGIN` … `ROLLBACK` or delete test rows)

| #   | Action                                                        | Expect                                                                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Insert BC prospect                                            | OGR RLA appears; BC SLT set; `relationship_status = prospect`                               |
| 2   | Update `account_status` → `active_account` (+ `converted_at`) | RLA → `opened`; `converted_at` copied                                                       |
| 3   | Demote to `prospect`                                          | RLA → `prospect`                                                                            |
| 4   | Insert `account_contacts`                                     | Junction row; second identical insert path does not duplicate (`ON CONFLICT`)               |
| 5   | Insert order without RLA (CAD totals only)                    | RLA set; `line_id = ogr` if was null; CAD `legacy_cad_column`; `total_amount_cad` unchanged |
| 6   | Insert call with existing prospect                            | RLA set; `line_id = ogr`                                                                    |
| 7   | Insert non-BC prospect                                        | RLA with NULL SLT + unresolved review-queue reason                                          |
| 8   | Count EP/BF/BKG/prospective RLA                               | Still **0**                                                                                 |
| 9   | Name-only prospect update                                     | Does **not** rewrite RLA commercial columns                                                 |

### 7.3 Post-apply invariants

```sql
-- Still zero non-OGR operational accounts
select l.code, count(rla.id)
from lines l
left join retailer_line_accounts rla on rla.sales_line_id = l.id
where l.code in ('eagle-peak', 'big-fish', 'bkg') or l.status = 'prospective'
group by 1;

-- Dual-write triggers present
select c.relname, t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and (
    t.tgname like '%sync_ogr%'
    or t.tgname like '%fill_ogr%'
  )
order by 1, 2;
```

### 7.4 Commands

```bash
# Local only — apply Phase 1C migration
npx supabase migration up --local
# If local chain is dirty:
# npx supabase db reset

# Focused test
npx vitest run src/lib/multiLinePhase1cDualWrite.test.ts

# Full gate
npm run check
```

---

## 8. Failure and rollback behavior

### 8.1 Runtime failure (fail closed)

| Case                                                 | Behavior                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Missing active `ogr` line                            | `RAISE EXCEPTION` — aborts the legacy write                                                     |
| Non-OGR `orders.line_id` / `calls.line_id` on insert | `RAISE EXCEPTION` — aborts the insert                                                           |
| Unresolved retailer / orphan call prospect           | Leave `retailer_line_account_id` (and orphan `line_id`) null — do not invent OGR                |
| Trigger exception                                    | Postgres aborts the statement/transaction; UI surfaces DB error (app unchanged; do not swallow) |

### 8.2 Rollback Phase 1C only

1. `DROP TRIGGER` for all 1C dual-write / fill triggers.
2. `DROP FUNCTION` for all 1C helper and trigger functions.
3. Leave 1A schema, 1B data, and nullable `retailer_line_account_id` columns in place.
4. Do **not** reverse 1B data unless separately requested.
5. `prospects` remains UI source of truth — rollback never reconstructs the staff app from line accounts.

Expand/contract note (foundation Appendix G PR 3): rollback of 1C does not require reverting 1A/1B if triggers are dropped first and nullable columns left in place.

Snapshot before any future **non-local** apply (out of scope for this local-first plan):  
`prospects`, `orders`, `calls`, `account_contacts`, and other operational tables listed in foundation §16.

---

## 9. Compatibility while the current UI remains unchanged

| Surface                                                        | Why safe                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Staff UI / tabs / drawers / modals                             | Unchanged routes and queries; still read/write `prospects`                      |
| `LINE_SELECT` / `fetchActiveLines` / `get_public_active_lines` | Explicit columns / `active = true` → OGR only                                   |
| Convert / orders / calls inserts                               | Omit unknown columns; triggers fill `retailer_line_account_id` and CAD defaults |
| `database.ts`                                                  | Unchanged in 1C (no new columns)                                                |
| Public wholesale RPCs                                          | Unchanged                                                                       |
| `FEATURE_MULTI_LINE_SCHEMA`                                    | Documentation only — no runtime branch                                          |
| `FEATURE_MULTI_LINE_UI`                                        | **Starts Phase 2** — do not introduce                                           |

---

## 10. Tests (`multiLinePhase1cDualWrite.test.ts`)

Read `20260814130000_multi_line_phase1_dual_write.sql` (and `schema.sql` for mirrored objects) and assert:

- `AFTER INSERT OR UPDATE ON prospects` sync function/trigger present
- `AFTER INSERT ON account_contacts` sync function/trigger present
- `BEFORE INSERT` fillers for `orders`, `calls`, and listed peers
- OGR-only upsert (`code = 'ogr'`); never Eagle Peak / Big Fish / BKG inserts into `retailer_line_accounts`
- Three-value status map only (`prospect` / `opened` / `inactive`)
- BC-only territory assignment on insert; `non_bc_territory` / `ambiguous_territory`
- `pg_trigger_depth` recursion guard
- Update-only-if-changed / commercial-column `WHEN` / `IS DISTINCT FROM`
- `legacy_cad_column` CAD defaults; no USD invent on orders finance
- `ON CONFLICT DO NOTHING` for contacts; `IS NULL` / `NOT EXISTS` idempotent predicates
- Functions/triggers mirrored in `schema.sql`
- **No** `DELETE` from operational tables (`orders`, `calls`, `prospects`, etc.)
- **No** `AFTER` write back to `prospects` from RLA
- **No** React/API/route changes required by this migration

Do **not** weaken Phase 1A/1B tests that forbid dual-write inside `…100000` / `…110000` / `…120000`.

---

## 11. Completion criteria

Phase 1C is complete when all are true:

- [ ] `20260814130000_multi_line_phase1_dual_write.sql` exists and applied cleanly on local DB
- [ ] 1C functions/triggers mirrored in `schema.sql`
- [ ] `multiLinePhase1cDualWrite.test.ts` passes
- [ ] `npm run check` passes
- [ ] New BC prospect → OGR RLA with BC SLT; convert/demote/notes/taxonomy stay in sync
- [ ] New contact → OGR junction; conflict ignored
- [ ] New order/call/peers get OGR `retailer_line_account_id` without app changes
- [ ] CAD defaults only; no USD; IDs and legacy columns preserved
- [ ] Zero Eagle Peak / Big Fish / BKG / prospective operational accounts
- [ ] Recursion guards present; no write amplification
- [ ] UI/routes unchanged; no application cutover; no `FEATURE_MULTI_LINE_UI`
- [ ] Foundation plan has a short Phase 1C implementation-results note
- [ ] No hosted DB touch
- [ ] No commit/push unless the user separately requested it

---

## 12. Explicit Phase 2+ exclusions (remainder)

Out of scope until a separate Phase 2+ request:

- Line picker, routes, dual-read with `FEATURE_MULTI_LINE_UI`
- Writes originating on line accounts; stop writing line fields to `prospects` except dual-write while flag on
- Reverse sync RLA → `prospects`
- Eagle Peak / Big Fish selling, outreach, public catalogs
- Prospective Lines CRUD UI and owner/admin API 403
- AI isolation / `retailer_field_changes` writers
- Territory admin UI
- Rename `prospects` → `retailers`; drop dual-write columns
- FKs on `calls.prospect_id` / `prospect_updates.prospect_id`
- Staff-line RLS
- Hosted / staging / production apply

---

## 13. Migration file outline (for the implementing agent)

Structure `20260814130000_multi_line_phase1_dual_write.sql` approximately as:

1. Header comment: Phase 1C only; OGR dual-write; no UI/API; no EP/BF/BKG accounts; local-first; no reverse sync
2. Helper: `ogr_retailer_line_account_id_for_retailer(integer)`
3. Shared ensure/upsert routine for OGR RLA from a prospect row (BC-only territory on insert; commercial update-only-if-changed)
4. `sync_ogr_retailer_line_account_from_prospect` + trigger on `prospects` (`AFTER INSERT OR UPDATE`, commercial `WHEN` on update)
5. `sync_ogr_retailer_line_contact_from_account_contact` + trigger on `account_contacts` (`AFTER INSERT`)
6. BEFORE INSERT fill functions + triggers for orders (incl. `line_id` + CAD), calls (incl. `line_id` + estimate CAD), and peers listed in §4.4
7. No end-of-migration data asserts that mutate production-like counts; optional `DO` that asserts trigger functions exist

Preserve all existing IDs. Prefer set-based / single-row NEW-based logic. Do not delete operational rows.

---

**Stop after Phase 1C implementation and local validation.** Do not begin Phase 2. Do not commit, push, or deploy unless the user separately asks.
