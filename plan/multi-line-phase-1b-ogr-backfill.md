# Phase 1B — OGR Backfill and Validation (implementation plan)

**Status:** Ready for implementation approval  
**Date:** 2026-08-14  
**Branch:** `feature/multi-line-multi-territory-implementation`  
**Prerequisites:** Phase 1A migrations applied on disposable local Supabase only (`…100000`, `…110000`, `…115000`)

**Sources of truth (do not redesign architecture):**

- [docs/epics/multi-line-multi-territory-crm.md](../docs/epics/multi-line-multi-territory-crm.md)
- [docs/plans/multi-line-phase-1-schema-foundation.md](../docs/plans/multi-line-phase-1-schema-foundation.md) §10–§12 and §22

This document is the **agent-executable** Phase 1B implementation brief. Follow it exactly. Do not invent territory, currency, or non-OGR accounts. Do not begin Phase 1C.

---

## Locked decisions (no agent discretion)

| Decision                             | Choice                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Territory auto-assign                | **BC only** → OGR–BC; OR/WA/CA/AB/norcal/unknown → NULL + review queue                                                         |
| Non-OGR `orders`/`calls`.`line_id`   | **Hard stop** immediately (no queue-then-fail)                                                                                 |
| Review-queue uniqueness              | **Add** partial unique index `(entity_type, entity_id, reason) WHERE resolved_at IS NULL` in `…120000`; mirror in `schema.sql` |
| Call estimate multi-currency columns | **Fill** when `order_value_cad IS NOT NULL` and conversion fields null, same CAD/`legacy_cad_column` pattern                   |
| `src/types/database.ts`              | **Do not change**                                                                                                              |
| Dual-write / UI / API / hosted DB    | **Forbidden** in 1B                                                                                                            |

---

## Non-goals / Phase 1C exclusions

Do **not** in Phase 1B:

- Create `supabase/migrations/20260814130000_multi_line_phase1_dual_write.sql`
- Add `AFTER INSERT OR UPDATE` sync triggers on `prospects` / `account_contacts`
- Add `BEFORE INSERT` fillers that set `retailer_line_account_id` on new orders/calls for ongoing dual-write
- Change React islands, API routes, `LINE_SELECT`, feature flags, or public RPCs
- Touch staging, production, or any hosted database
- Clone accounts into Eagle Peak, Big Fish, or BKG
- Create operational accounts for prospective lines
- Infer missing territory from address/city/region
- Invent USD or combine CAD and USD
- Commit or push unless the user separately asks

Those remain **Phase 1C** (dual-write) or **Phase 2+** (application cutover).

---

## 1. Ordered implementation steps

1. Confirm branch + Phase 1A migrations exist; ensure `…120000` and `…130000` are absent.
2. Run blocking preflight SQL on **local** DB (§3); **stop** if any hard-stop fires.
3. Record preflight counts (§3.2).
4. Create `supabase/migrations/20260814120000_multi_line_phase1_ogr_backfill.sql` with the sequence in §4.
5. Mirror the new review-queue partial unique index in `supabase/schema.sql`.
6. Create `src/lib/multiLinePhase1bBackfill.test.ts` (SQL-text assertions; pattern of `multiLinePhase1aSchema.test.ts`).
7. Apply locally: `npx supabase migration up --local` (or `db reset` then up through `…120000` if the local chain is dirty).
8. Run validation/reconciliation queries (§7); confirm expected counts.
9. Run `npm run check` and the focused Vitest file.
10. Append a short **Implementation results — Phase 1B** section to `docs/plans/multi-line-phase-1-schema-foundation.md` (status/results only; no architecture rewrite).
11. **Stop.** Do not commit/push unless asked. Do not start Phase 1C.

---

## 2. Exact files to create or modify

| File                                                                    | Action                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `supabase/migrations/20260814120000_multi_line_phase1_ogr_backfill.sql` | **Create** — backfill DML, review-queue unique index, assertions |
| `supabase/schema.sql`                                                   | **Modify** — add review-queue partial unique index only          |
| `src/lib/multiLinePhase1bBackfill.test.ts`                              | **Create** — migration SQL string assertions                     |
| `docs/plans/multi-line-phase-1-schema-foundation.md`                    | **Modify** — 1B implementation-results section after success     |

**Do not touch:** `src/types/database.ts`, React/API, historical migrations, `…130000`, production/staging data, public RPCs.

---

## 3. Preflight checks and stop conditions

### 3.1 Blocking queries (run manually before apply; also embed as hard stops in migration)

```sql
-- Must be 0 rows
select l.code, count(*)
from orders o
join lines l on l.id = o.line_id
where l.code <> 'ogr'
group by 1;

select l.code, count(*)
from calls c
join lines l on l.id = c.line_id
where l.code <> 'ogr'
group by 1;

-- Must exist: status = active, default_currency = CAD
select id, status, default_currency from lines where code = 'ogr';

-- Expect bc/or/wa active unconfirmed; no ca/ab
select t.code, slt.status, slt.rights_type
from sales_line_territories slt
join lines l on l.id = slt.sales_line_id
join territories t on t.id = slt.territory_id
where l.code = 'ogr'
order by 1;

-- Must be 0 RLA rows for these
select l.code, count(rla.id)
from lines l
left join retailer_line_accounts rla on rla.sales_line_id = l.id
where l.code in ('eagle-peak','big-fish','bkg') or l.status = 'prospective'
group by 1;
```

### 3.2 Preflight counts to record

```sql
select count(*) as prospects from prospects;
select account_status, count(*) from prospects group by 1 order by 1;
select t.code, count(*) from prospects p join territories t on t.id = p.territory_id group by 1 order by 1;
select count(*) as orders from orders;
select line_id is null as line_null, count(*) from orders group by 1;
select count(*) as calls from calls;
select count(*) as contacts from account_contacts;
select count(*) as reorder from account_reorder_settings;
select count(*) as system_messages from system_messages;
select count(*) as gmail from gmail_thread_links;
select count(*) as calendar from calendar_event_links;
select count(*) as threads from message_threads;
select count(*) as wholesale from wholesale_order_requests;
select count(*) as attribution from account_conversion_attribution;
select count(*) as prospect_updates from prospect_updates;
select count(*) as orphan_calls from calls c
  left join prospects p on p.id = c.prospect_id where p.id is null;
select count(*) as orphan_updates from prospect_updates u
  left join prospects p on p.id = u.prospect_id where p.id is null;
select count(*) as rla_before from retailer_line_accounts;
select count(*) as targets_before from retailer_line_targets;
```

### 3.3 Hard stops (abort migration with `RAISE EXCEPTION`)

Abort if any of these are true:

1. Any `orders.line_id` or `calls.line_id` references a line whose `code <> 'ogr'`.
2. `lines.code = 'ogr'` is missing or `status <> 'active'`.
3. OGR–BC `sales_line_territories` row is missing or not `active`.
4. Any existing `retailer_line_accounts` for `eagle-peak`, `big-fish`, `bkg`, or `lines.status = 'prospective'`.
5. Manual operator stop: conflicting directory import is running (not a SQL assert).

Prefer **fail immediately** on non-OGR `line_id` so a partial stamp cannot commit. Surface offending IDs in the exception message.

---

## 4. Backfill and review-queue sequence

Single migration file = one Postgres transaction. Order inside `…120000`:

```
preflight → unique index → insert RLA → BC assign / non-BC queue → stamp ops → CAD finance → orphan queue → assert
```

```mermaid
flowchart TD
  preflight[Preflight hard stops]
  idx[Review queue partial unique index]
  insertRla[Insert one OGR RLA per prospect]
  terr{territories.code = bc?}
  assignBc[Set OGR-BC sales_line_territory_id]
  queueTerr[NULL territory plus review queue]
  stamp[Stamp contacts and operational FKs]
  finance[Fill CAD original_* only]
  orphans[Queue orphans do not delete]
  assert[End-of-migration assertions]
  preflight --> idx --> insertRla --> terr
  terr -->|yes| assignBc
  terr -->|no or ambiguous| queueTerr
  assignBc --> stamp
  queueTerr --> stamp
  stamp --> finance --> orphans --> assert
```

### 4.1 Schema add (in same migration)

```sql
create unique index if not exists migration_review_queue_unresolved_entity_uidx
  on migration_review_queue (entity_type, entity_id, reason)
  where resolved_at is null;
```

Mirror the same index in `supabase/schema.sql` next to the existing `migration_review_queue` definitions.

### 4.2 Insert one OGR line account per prospect

`INSERT … SELECT` from `prospects`:

- `retailer_id = prospects.id` (preserve IDs)
- `sales_line_id =` OGR line id
- Leave all `prospects` columns untouched

**Status map:**

| `prospects.account_status` | `relationship_status` |
| -------------------------- | --------------------- |
| `prospect`                 | `prospect`            |
| `active_account`           | `opened`              |
| `inactive`                 | `inactive`            |

Do not invent `qualified` or `terminated`.

**Copy commercial/planning columns** (foundation §10.2):

`converted_at`, `initial_order_date`, `notes`, `fit`, `fit_score`, `ideal_opening_units`, `priority`, `provisional_grade`, `verification_status`, `buyer_verified`, `apparel_capability`, `existing_ogr`, `qualification_status`, `next_action`, `source_note`, `region`, `primary_district`, `subterritory`, `secondary_channels`, `retail_subchannels`, `venue_contexts`, `lifestyle_themes`, `retail_capabilities`.

**Idempotent predicate:** insert only where no non-terminated OGR account exists for that `retailer_id` (matches `retailer_line_accounts_retailer_line_operational_uidx`).

Never insert RLAs for Eagle Peak, Big Fish, BKG, or prospective lines.

### 4.3 Territory assignment (BC only)

Join `prospects.territory_id` → `territories.code`. **Never** read address/city/region.

| Geo                              | `sales_line_territory_id` | `backfill_review_reason` | Review queue |
| -------------------------------- | ------------------------- | ------------------------ | ------------ |
| `bc`                             | OGR–BC assignment id      | NULL                     | No           |
| `or`, `wa`, `ca`, `ab`, `norcal` | NULL                      | `non_bc_territory`       | Yes          |
| Unknown / join miss              | NULL                      | `ambiguous_territory`    | Yes          |

OGR–OR and OGR–WA rights rows remain on `sales_line_territories`. They are **not** auto-attached to retailer accounts.

### 4.4 Stamp contacts and operational records

Stamp `retailer_line_account_id` to the OGR account for that retailer. Use `WHERE retailer_line_account_id IS NULL`. Skip when parent prospect/account id is null. **Do not delete** anything.

| Source                                                          | Join key      | Also                                                                                                                                     |
| --------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `account_contacts`                                              | `account_id`  | Insert `retailer_line_contacts` with same `role` / `is_primary`; `ON CONFLICT (retailer_line_account_id, account_contact_id) DO NOTHING` |
| `orders`                                                        | `account_id`  | Set `line_id = ogr` where null; fill CAD financials (§4.5)                                                                               |
| `calls`                                                         | `prospect_id` | Stamp only if prospect exists; set `line_id = ogr` where null **and** prospect exists                                                    |
| `system_messages`                                               | `prospect_id` | Stamp when non-null and prospect exists                                                                                                  |
| `account_reorder_settings`                                      | `account_id`  | Stamp                                                                                                                                    |
| `gmail_thread_links`, `calendar_event_links`, `message_threads` | `prospect_id` | Stamp when non-null and prospect exists                                                                                                  |
| `wholesale_order_requests`                                      | `prospect_id` | Stamp when non-null; **do not** copy USD wholesale totals onto CAD order columns                                                         |
| `account_conversion_attribution`                                | `prospect_id` | Stamp                                                                                                                                    |
| `prospect_updates`                                              | `prospect_id` | Stamp when prospect exists (no new `prospect_id` FK)                                                                                     |

**Do not stamp:** `profiles`, catalog tables, `outreach_goal_settings`.

### 4.5 Null / conflicting `line_id` and CAD financial backfill

| Case                                           | Action                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| `orders.line_id` / `calls.line_id` is non-OGR  | Hard stop (preflight); never commit stamps            |
| `orders.line_id` is null                       | After hard-stop passes, set to OGR and stamp RLA      |
| `calls.line_id` is null and prospect exists    | Set to OGR and stamp RLA                              |
| `calls.line_id` is null and prospect is orphan | Leave `line_id` null; queue orphan; do not invent OGR |
| Catalog / wholesale items / public RPCs        | Untouched                                             |

**Orders financial fill** (only where `conversion_source IS NULL` or `original_currency IS NULL`):

- `original_amount = total_amount_cad`
- `original_currency = 'CAD'`
- `exchange_rate = 1`
- `exchange_rate_date = order_date`
- `converted_amount = total_amount_cad`
- `converted_currency = 'CAD'`
- `conversion_source = 'legacy_cad_column'`
- Do **not** alter `total_amount_cad`. Do **not** invent USD.

**Calls estimate fill** when `order_value_cad IS NOT NULL` and conversion fields null:

- Same CAD / rate `1` / `legacy_cad_column` pattern on `order_value_original_*` / `order_value_converted_*` / `order_value_conversion_source`
- Treat as estimate, not booked revenue

### 4.6 Orphans — detect, do not delete

Queue and leave source rows unchanged (except skip stamp):

- `calls.prospect_id` not in `prospects` — reason e.g. `orphan_call`
- `prospect_updates.prospect_id` not in `prospects` — reason e.g. `orphan_prospect_update`
- Linked rows with non-null `prospect_id` that does not resolve (rare where FK exists)

Do **not** queue every null-`prospect_id` Gmail/Calendar/thread/wholesale row (normal unlinked state). Do not auto-merge lookalike retailers.

### 4.7 Review queue insert pattern

```sql
insert into migration_review_queue (entity_type, entity_id, reason, payload)
select …
where not exists (
  select 1 from migration_review_queue q
  where q.entity_type = …
    and q.entity_id = …
    and q.reason = …
    and q.resolved_at is null
);
```

---

## 5. Transaction and idempotency requirements

- One migration file = one Postgres transaction. Any `RAISE EXCEPTION` rolls back all DML in the file.
- Re-apply safe:
  - Skip existing non-terminated OGR RLAs
  - Stamp only where `retailer_line_account_id IS NULL`
  - Fill finance only where conversion fields are null
  - Queue inserts guarded by `NOT EXISTS` unresolved `(entity_type, entity_id, reason)`
- Partial unique index makes duplicate unresolved review rows fail closed
- End-of-migration asserts must `RAISE EXCEPTION` if reconciliation fails (transaction rolls back)

---

## 6. Local migration-testing procedure

1. Ensure Docker + local Supabase are running (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
2. Confirm Phase 1A is applied (`…100000`, `…110000`, `…115000`).
3. Prefer `npx supabase migration up --local` to apply only `…120000`.
4. If the local chain is inconsistent, `npx supabase db reset` then migrate through `…120000`.
5. **Never** point CLI or `psql` at hosted/staging/production.
6. After apply, run §7 reconciliation queries.
7. Confirm staff UI still loads against `prospects` (unchanged); empty→filled RLA tables require no dual-write for read compatibility.
8. Do not rely on re-running an already-recorded migration for idempotency proof; instead write SQL with idempotent predicates and assert them in tests. Optional: manually re-run the DML blocks in a transaction that rolls back, or restore snapshot and re-apply once.

---

## 7. Validation and reconciliation checks

### 7.1 End-of-migration asserts (must fail the migration if false)

- `count(retailer_line_accounts where ogr) = count(prospects)`
- Eagle Peak / Big Fish / BKG / prospective operational accounts = 0
- `retailer_line_targets` = 0
- OGR active SLT codes still exactly `{bc, or, wa}`, all `unconfirmed`
- Every `orders` row with known `account_id` has `retailer_line_account_id` pointing at that retailer’s OGR account
- Every stamped order/call `line_id` is OGR (orphans with null `line_id` excluded)
- Orders with filled `original_*` use `CAD` / rate `1` / `conversion_source = 'legacy_cad_column'`; `total_amount_cad` unchanged
- BC prospects have OGR–BC `sales_line_territory_id`; non-BC accounts have NULL territory and an unresolved queue row
- Orphan calls/updates appear in the queue when any exist; source row counts unchanged
- `prospects.id` set unchanged (count + max id stable vs preflight snapshot recorded in migration notices or asserts)

### 7.2 Manual post-apply queries

```sql
select
  (select count(*) from prospects) as prospects,
  (select count(*) from retailer_line_accounts rla
     join lines l on l.id = rla.sales_line_id where l.code = 'ogr') as ogr_accounts;

select l.code, count(rla.id)
from lines l
left join retailer_line_accounts rla on rla.sales_line_id = l.id
where l.code in ('eagle-peak', 'big-fish', 'bkg') or l.status = 'prospective'
group by 1;

select t.code, slt.rights_type, slt.status
from sales_line_territories slt
join lines l on l.id = slt.sales_line_id
join territories t on t.id = slt.territory_id
where l.code = 'ogr'
order by 1;

select count(*) as orders_missing_rla
from orders o
where o.retailer_line_account_id is null;

select reason, count(*)
from migration_review_queue
where resolved_at is null
group by 1
order by 1;

-- BC accounts should have territory; non-BC should not
select
  t.code as geo,
  count(*) filter (where rla.sales_line_territory_id is not null) as with_slt,
  count(*) filter (where rla.sales_line_territory_id is null) as without_slt
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
join prospects p on p.id = rla.retailer_id
join territories t on t.id = p.territory_id
group by 1
order by 1;
```

---

## 8. Rollback procedure (1B data-only)

Phase 1B does not install dual-write. Rollback is data-only; leave 1A schema/triggers in place.

1. `UPDATE` operational tables: set `retailer_line_account_id = NULL`.
2. Clear finance fields only where `conversion_source = 'legacy_cad_column'` / `order_value_conversion_source = 'legacy_cad_column'` (do **not** null `total_amount_cad` / `order_value_cad`).
3. Prefer snapshot restore for `orders.line_id` / `calls.line_id` if nulls were filled and exact prior nulls are unknown.
4. `DELETE` from `retailer_line_accounts` where `sales_line_id` is OGR (cascades `retailer_line_contacts`).
5. `DELETE` unresolved 1B `migration_review_queue` rows (by reason / created_at window / payload marker).
6. Leave 1A tables, seeds, and triggers intact.

**Snapshot before any non-local apply** (local disposable DB: optional but recommended before first apply):  
`prospects`, `orders`, `calls`, `account_contacts`, `system_messages`, `account_reorder_settings`, `gmail_thread_links`, `calendar_event_links`, `message_threads`, `wholesale_order_requests`, `account_conversion_attribution`, `prospect_updates`.

`prospects` remains UI source of truth. Rollback never reconstructs the staff app from line accounts.

---

## 9. Commands and tests

```bash
# Local only — apply Phase 1B migration
npx supabase migration up --local
# If local chain is dirty:
# npx supabase db reset

# Focused test
npx vitest run src/lib/multiLinePhase1bBackfill.test.ts

# Full gate
npm run check
```

### 9.1 `multiLinePhase1bBackfill.test.ts` must assert

Read `20260814120000_multi_line_phase1_ogr_backfill.sql` (and `schema.sql` for the unique index) and assert:

- Inserts OGR accounts from `prospects`
- Never inserts Eagle Peak / Big Fish / BKG / prospective accounts
- Maps the three `account_status` values only (`prospect` / `opened` / `inactive`)
- Assigns territory only when `territories.code = 'bc'`
- Queues non-BC / ambiguous / orphans; never `DELETE` from operational tables (`orders`, `calls`, `prospects`, etc.)
- Hard-stops on non-OGR `orders.line_id` / `calls.line_id`
- Fills CAD `legacy_cad_column` only; no USD literals on orders finance backfill
- Uses idempotent `WHERE NOT EXISTS` / `IS NULL` predicates
- Contains end-of-migration count assertions
- Contains review-queue partial unique index; mirrored in `schema.sql`
- Does **not** create dual-write triggers (`AFTER INSERT OR UPDATE ON prospects`, etc.)

Do **not** weaken Phase 1A tests that forbid backfill inside `…100000` / `…110000`.

---

## 10. Completion criteria

Phase 1B is complete when all are true:

- [ ] `20260814120000_multi_line_phase1_ogr_backfill.sql` exists and applied cleanly on local DB
- [ ] Review-queue partial unique index mirrored in `schema.sql`
- [ ] `multiLinePhase1bBackfill.test.ts` passes
- [ ] `npm run check` passes
- [ ] OGR RLA count = prospects count; IDs preserved; legacy columns untouched
- [ ] Status map `prospect|active_account|inactive` → `prospect|opened|inactive`
- [ ] Only BC accounts have `sales_line_territory_id`; all other geos queued
- [ ] Contacts and listed operational tables stamped or queued; orphans not deleted
- [ ] Null OGR-safe `line_id` filled; conflicting non-OGR `line_id` never committed
- [ ] CAD `original_*` filled without inventing USD or altering `total_amount_cad`
- [ ] Zero Eagle Peak / Big Fish / BKG / prospective accounts; zero targets
- [ ] Foundation plan has a short Phase 1B implementation-results note
- [ ] No dual-write, no UI/API cutover, no hosted DB touch
- [ ] No commit/push unless the user separately requested it

---

## 11. Explicit Phase 1C exclusions (remainder)

Out of scope until a separate Phase 1C request:

- `20260814130000_multi_line_phase1_dual_write.sql`
- `AFTER` upsert OGR accounts from `prospects` / contacts
- `BEFORE INSERT` fill `retailer_line_account_id` + CAD defaults on new orders
- Recursion guards (`pg_trigger_depth()` / update-only-if-changed)
- Staging dual-write smoke: insert prospect → OGR account appears
- Application cutover and `FEATURE_MULTI_LINE_UI` (Phase 2+)

---

## 12. Migration file outline (for the implementing agent)

Structure `20260814120000_multi_line_phase1_ogr_backfill.sql` approximately as:

1. Header comment: Phase 1B only; no dual-write; BC-only territory; local-first
2. `create unique index if not exists migration_review_queue_unresolved_entity_uidx …`
3. `DO $$ … $$` preflight hard stops (raise with offending counts/ids)
4. Resolve `ogr_line_id` and OGR–BC `sales_line_territory_id` into variables / CTEs
5. `INSERT INTO retailer_line_accounts … SELECT … FROM prospects` with status map + commercial columns + BC/non-BC territory CASE; idempotent anti-join
6. `INSERT INTO migration_review_queue` for non-BC / ambiguous RLAs
7. Stamp operational tables + `retailer_line_contacts`
8. Update null `line_id` to OGR where safe; fill CAD finance on orders and qualifying calls
9. Queue orphan calls / prospect_updates
10. Final `DO $$ … $$` reconciliation asserts

Preserve all existing IDs. Prefer set-based SQL over row loops unless a hard stop needs to list sample ids.

---

**Stop after Phase 1B implementation and local validation.** Do not begin Phase 1C.
