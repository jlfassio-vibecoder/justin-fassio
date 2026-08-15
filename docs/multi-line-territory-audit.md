# Multi-Line / Multi-Territory CRM Audit

**Status:** Audit only. No production code, migrations, or data were changed.  
**Branch inspected:** `feature/multi-line-multi-territory-implementation` at `main` (`879a24a`, includes merged Agentic Outreach Phases 0–5).  
**Date:** 2026-08-14  
**Revised:** 2026-08-14 — Big Fish is a **confirmed represented line** (not prospective). Prospective Lines is a separate acquisition pipeline (~12 research-only candidates).

This document is the source of truth for a line-first CRM that can represent multiple principals and different territory rights per line without commingling account data. It waits for explicit approval before any schema or application work.

**Represented lines (intended):** Old Guys Rule (active), Eagle Peak (active or onboarding), Big Fish (confirmed represented; onboard without mixing OGR data).  
**Prospective Lines:** a distinct acquisition workspace for up to ~12 candidate principals. Research and retailer-target mapping only — no selling, orders, commissions, automated outreach, public catalogs, or active-line KPIs.

---

## 1. Executive findings

The live CRM is a **single-retailer, single-lifecycle, OGR-and-BC operating system** with a thin, unused multi-line catalog layer.

1. **There is no retailer master separate from the commercial account.** `prospects` is both the real-world store identity and the sales account. Prospect vs Active Account is a column (`account_status`), not two tables and not per line.
2. **Catalog is already line-scoped. Retailers are not.** `catalog_items.line_id` and `UNIQUE (line_id, sku)` exist. Directory, scoring, notes, contacts, reorder cadence, outreach goals, and most activities hang off `prospects.id` with no `sales_line_id`.
3. **A `lines` table exists but the app hardcodes `ogr`.** Seeded rows are Old Guys Rule (`active`) and Busted Knuckles Garage (`inactive`). **Eagle Peak and Big Fish do not exist in the database.** Busted Knuckles is not a substitute for either. Product intent: add Eagle Peak and Big Fish as **represented** lines; keep a separate **Prospective Lines** pipeline for other candidates.
4. **Territory is a retailer field, not a line-rights assignment.** `prospects.territory_id` is required and points at one of five seeded codes (`bc`, `ab`, `ca`, `or`, `wa`). California is the entire state. There is no `sales_line_territories`, no exclusive/non-exclusive rights, no Northern California region, and no parent/child geography.
5. **Operational data is BC + CAD.** Seeds and the named prospect-list import are BC. Directory regions are six BC corridors. Scoring uses BC subterritory density. Orders and call values are `*_cad` only. Wholesale catalog pricing is USD + CAD MSRP/landed.
6. **AI is globally OGR/BC.** Agent system prompt, APF, Suggest, Ask AI, Add via AI, fill-blanks, and outreach draft generation assume Old Guys Rule apparel in British Columbia. APF can pass a `lineCode` but defaults to `ogr` and still loads the same retailer row.
7. **RLS is staff-wide, not line-scoped.** Approved owner/rep sees every prospect, order, catalog item, and message. There is no per-line or per-territory policy.
8. **Highest-risk commingling is not theoretical.** Converting a store to Active Account for Eagle Peak would flip the same `account_status` that OGR uses. Orders, notes, fit scores, and reorder dates would mix unless the schema is split first.

**Do not implement until the unresolved business questions in §14 are answered.** In particular: Busted Knuckles fate; Eagle Peak / Big Fish legal names, currencies, and territories; Northern California boundary; whether OGR also has OR/WA; and whether `prospects.id` should be preserved as the retailer PK. Big Fish’s _existence as a represented line_ is decided — only onboarding details remain.

---

## 2. Current-state architecture

### 2.1 Identity model

```
prospects (integer PK)
  ├── account_status: prospect | active_account | inactive   ← GLOBAL
  ├── territory_id → territories (bc|ab|ca|or|wa)           ← GLOBAL
  ├── notes, fit_score, priority, grade, qualification…     ← GLOBAL
  ├── account_contacts (role buyer|manager|owner)
  ├── orders (optional line_id, total_amount_cad only)
  ├── account_reorder_settings (1:1 on prospect)
  ├── calls (prospect_id, optional unused line_id)
  ├── prospect_updates (no FK)
  ├── system_messages, gmail_thread_links, calendar_event_links
  └── wholesale_order_requests
```

Prospects and active accounts **share one table**. UI splits them in memory:

- `RepCommandCenter`: `pipelineProspects = accountStatus !== 'active_account'`; `activeAccounts = accountStatus === 'active_account'`.
- `ProspectsTab` / `ActiveAccountsTab` both consume `Prospect`.

Conversion (`src/lib/convertToActiveAccount.ts`) updates the same row: `account_status = 'active_account'`, `converted_at`, optional `orders` insert with nullable `line_id`. Demote clears status only; it does not delete orders or contacts.

### 2.2 What already exists for “lines”

| Artifact                | Evidence                                                                 | Used in staff app?                                    |
| ----------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `lines` table           | `supabase/schema.sql:26-58` — `code`, `name`, `active`, marketing fields | Catalog/settings lookup only                          |
| Seed `ogr`              | Active, showroom `/old-guys-rule-wholesale`                              | Yes, hardcoded                                        |
| Seed `bkg`              | Inactive “Busted Knuckles Garage”                                        | No `src/` usage except `LineKey`                      |
| `catalog_items.line_id` | `NOT NULL`, `UNIQUE (line_id, sku)`                                      | Always filtered to `ogr` in `fetchCatalogItems`       |
| `catalog_settings`      | 1:1 per line                                                             | `fetchOgrCatalogSettings()` hardcodes `ogr`           |
| `orders.line_id`        | Nullable FK                                                              | Convert modal can stamp it; lists do not filter by it |
| `calls.line_id`         | Nullable FK                                                              | **Not in `CALL_SELECT`**; UI never sets it            |
| `LineKey`               | `src/types/index.ts` `'ogr' \| 'bkg'`                                    | Header OGR button; `onSelectOgr` is a no-op           |
| Public RPCs             | `get_public_ogr_products` etc.                                           | Public wholesale site only                            |

**There is no `principals` table, no `sales_line_territories`, no `retailer_line_accounts`.**

### 2.3 Shared vs commercial fields on `prospects` today

**Closer to shared retailer identity (still incomplete):**

- `name`, `address`, `city`, `phone`, `website`
- `territory_id` (wrong layer — see §8)
- `category` / taxonomy JSONB (`secondary_channels`, `lifestyle_themes`, …) — currently OGR-tuned
- `external_id` (BC sheet ids such as `BC-001`)

**Line-specific but stored globally:**

- `account_status`, `converted_at`, `initial_order_date`
- `notes`, `fit`, `fit_score`, `ideal_opening_units`, `priority`, `provisional_grade`
- `verification_status`, `buyer_verified`, `apparel_capability`, `existing_ogr`
- `qualification_status`, `next_action`, `source_note`
- `region`, `primary_district`, `subterritory` (BC planning geography)

**Missing on the retailer row (needed for a true master):**

- Country, province/state as first-class columns (only via territory)
- Postal / ZIP
- Latitude / longitude
- Google Place ID / other external business ids
- Legal name vs DBA
- Audit history for verified identity fields (catalog has `catalog_field_changes`; prospects do not)

### 2.4 Activities, catalog, and money

| Domain                         | Attachment                                                                  | Line-safe?                                            |
| ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Contacts                       | `account_contacts.account_id → prospects.id`                                | No — shared across all future lines                   |
| Calls                          | `calls.prospect_id` (no FK); `line_id` unused                               | No                                                    |
| Notes                          | `prospects.notes` + `prospect_updates`                                      | No                                                    |
| Orders                         | `orders.account_id`; CAD header only; **no line items / `catalog_item_id`** | Weak (`line_id` optional, UI unfiltered)              |
| Reorder AI                     | `account_reorder_settings.account_id` PK                                    | No                                                    |
| Quotes / samples / commissions | **Do not exist** as tables                                                  | N/A                                                   |
| Product email / outreach       | `system_messages.prospect_id` + `catalog_item_id`                           | Catalog item implies a line; selection still OGR-only |
| Gmail / Calendar links         | `prospect_id`                                                               | No                                                    |
| Wholesale cart requests        | `wholesale_order_requests` + items with `catalog_item_id`                   | Items are SKU-level; request is retailer-level        |
| Outreach goals / briefing      | Singleton `outreach_goal_settings`                                          | Global KPI, not per line                              |

### 2.5 Application shell

- Staff app: `/app` → `AuthGate` (`client:load`) → `RepCommandCenter`.
- Navigation is **tabs in React state**, not `/app/lines/:lineSlug/...`.
- Query params: `?tab=`, `?sku=`, `?draftId=`, `?prospectId=` (read on mount; tab changes do not write the URL).
- Header subtitle: “Independent Sales Representative — British Columbia”.
- Line switcher: OGR selected; BKG “coming soon” from original design was removed from the current Header (Messages took that slot). `onSelectOgr` is empty.

Public OGR wholesale is a separate tree: `/old-guys-rule-wholesale/`.

---

## 3. Hardcoded OGR and BC dependencies

### 3.1 Old Guys Rule (non-exhaustive but representative)

| Area                  | Location                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Catalog fetch         | `src/lib/catalog.ts:257-267` `.eq('code', 'ogr')`                                            |
| Catalog settings      | `src/lib/catalogSettings.ts` `fetchOgrCatalogSettings`                                       |
| Line helper           | `src/lib/lines.ts:54-58` `resolveOgrLineId`                                                  |
| Catalog API           | `src/pages/api/catalog/items/[sku].ts`                                                       |
| Catalog import        | `scripts/catalog-import/from-json.ts` always `'ogr'`                                         |
| Outreach product pool | `src/lib/outreachProductSelection.ts`                                                        |
| Draft generation      | `src/lib/generateOgrProductOutreachDraft.ts` (“Old Guys Rule apparel”)                       |
| Product email APIs    | `src/pages/api/staff/ogr-product-email/**`                                                   |
| Public RPCs           | `get_public_ogr_products`, `get_public_ogr_product_by_slug`, `get_public_ogr_supplier_terms` |
| Agent prompt          | `src/pages/api/agent.ts:10-11`                                                               |
| Agent tools           | `src/lib/agentCrmTools.ts` `DEFAULT_LINE_CODE = 'ogr'`                                       |
| AI prefill            | `src/lib/aiAssistPrefill.ts`                                                                 |
| Add via AI            | `src/lib/createEnrichedProspect.ts`                                                          |
| Fill blanks           | `src/lib/fillBlankProspectFields.ts` “OGR themes”                                            |
| Taxonomy              | `src/lib/crmRetailTaxonomy.ts` “Canonical OGR CRM retail taxonomy”                           |
| Prospect column       | `existing_ogr`                                                                               |
| Type union            | `LineKey = 'ogr' \| 'bkg'`                                                                   |
| Public site           | `src/pages/old-guys-rule-wholesale/**`                                                       |

### 3.2 British Columbia / Vancouver / CAD

| Area                       | Location                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| Territory default          | `src/lib/territories.ts` `BC_TERRITORY_CODE`; unknown province → `bc`                            |
| Directory regions          | `src/lib/prospects.ts` `ProspectRegion` = six BC corridors                                       |
| Directory filters          | `src/lib/directoryOptions.ts`                                                                    |
| Enrichment geo             | `src/lib/prospectEnrichment/bcTerritory.ts`                                                      |
| Fit score geo ±1           | `src/lib/prospectEnrichment/seedFitScore.ts`                                                     |
| Priority / Okanagan Tier 1 | `src/lib/prospectEnrichment/priorityGrade.ts`                                                    |
| Add-via-AI schema          | BC cities/regions enum in `createEnrichedProspect.ts`                                            |
| Named list import          | `src/lib/prospectListImport.ts` “BC named prospect list”                                         |
| Seed                       | `supabase/migrations/20260802251000_seed_catalog_prospects.sql` (ids 1–249, BC)                  |
| BC upsert                  | `supabase/migrations/20260804120000_upsert_bc_prospect_list.sql`                                 |
| Timezone                   | `outreach_goal_settings.business_timezone` default `America/Vancouver`; `AGENT_OUTREACH_PREP_TZ` |
| Consumer tax               | `src/lib/retailPricing.ts` `BC_GST_RATE`, `BC_PST_RATE`                                          |
| Header copy                | `Header.tsx` “British Columbia”                                                                  |
| Orders / calls             | `total_amount_cad`, `order_value_cad`                                                            |
| Landed cost                | USD wholesale → CAD landed via FX (default 1.45)                                                 |

Schema already **allows** AB, CA, OR, WA territories. Application logic and seed **do not operate them**.

---

## 4. Data-commingling risks

Ranked by damage if Eagle Peak is activated on the current schema.

| #   | Risk                                                                                          | Why it happens                                                    | Blast radius                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **One `account_status` per store**                                                            | Convert/demote is retailer-global                                 | Opening Eagle Peak would mark an OGR prospect as an Active Account (or hide an OGR account from the prospect list)                                                 |
| 2   | **One notes / score / grade / next-action blob**                                              | Planning columns live on `prospects`                              | Eagle Peak AI Update overwrites OGR qualification                                                                                                                  |
| 3   | **Contacts are retailer-only**                                                                | `account_contacts.account_id`                                     | Canopy buyer mixed with apparel buyer; primary-contact unique index is per retailer                                                                                |
| 4   | **Orders listed for the retailer, not the line**                                              | `fetchOrdersForAccounts` filters `account_id` only                | Dashboard LTV, last order, reorder suggestion mix CAD apparel with (future) canopy USD                                                                             |
| 5   | **Reorder settings 1:1 on prospect**                                                          | PK = `account_id`                                                 | One cadence, one `ai_reorder_notes`                                                                                                                                |
| 6   | **Calls unscoped**                                                                            | `line_id` unused; `CALL_SELECT` omits it                          | Call Today / PMF dashboard mixes principals                                                                                                                        |
| 7   | **Outreach eligibility is global**                                                            | `selectOutreachTargets` loads all `account_status = 'prospect'`   | Nightly prep could email OGR copy to an Eagle Peak-only store, or vice versa                                                                                       |
| 8   | **APF defaults to OGR catalog**                                                               | `getAccountProductFit` default `ogr`                              | Scoring a Northern California canopy account against OGR tees                                                                                                      |
| 9   | **Territory on the retailer**                                                                 | Cannot be “BC for OGR, OR for Eagle Peak”                         | Same store cannot sit in two line territories                                                                                                                      |
| 10  | **California = whole state**                                                                  | `territories.code` check `'ca'`                                   | Assigning CA for Eagle Peak would imply Southern California rights                                                                                                 |
| 11  | **RLS is all-staff**                                                                          | `is_approved_staff()`                                             | Cannot hide Prospective Lines (acquisition candidates) from active selling except by UI convention; Big Fish as a represented line would otherwise share OGR lists |
| 12  | **Integer `prospects.id` reused everywhere**                                                  | Calls/updates have **no FK**                                      | Migration must remap activities carefully or keep retailer ids stable                                                                                              |
| 13  | **Duplicate stores**                                                                          | No unique `(name, city, territory)`; import matching is heuristic | Splitting lines without a retailer master will duplicate or silently merge                                                                                         |
| 14  | **Catalog `field_meta` / `catalog_field_changes` exist; prospect identity has no equivalent** | AI fill-blanks can write `website`/`address`                      | Cross-line AI can clobber verified address without audit                                                                                                           |

---

## 5. Proposed entity relationship model

Keep the **three layers** requested. Prefer **evolving existing tables** over a greenfield rename where that preserves live OGR ids.

```
principals
    └── sales_lines (evolve `lines`)
            ├── sales_line_territories ──► geo_territories (evolve `territories`)
            └── retailer_line_accounts ──► retailers (evolve `prospects` identity)
                    ├── retailer_line_contacts ──► retailer_contacts (evolve `account_contacts`)
                    ├── activities / calls / notes / tasks
                    ├── orders / quotes / samples (line-account scoped)
                    ├── system_messages / gmail / calendar links
                    └── AI runs / scoring snapshots
```

### 5.1 Recommended table mapping (v1)

| Proposed concept      | Recommended physical name                            | Rationale                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Principal             | `principals` (**new**)                               | OGR, Eagle Peak, Big Fish are different companies. Optional in a thin v1 if `sales_lines` carries company fields, but a separate table avoids stuffing contracts onto the line row.                                      |
| Sales line            | **Keep `lines`**, extend columns                     | Avoids rewriting `catalog_items.line_id` and public RPCs in the same migration. Add `status`, `principal_id`, `default_currency`, `commission_rate`, dates. Treat `active boolean` as derived or migrate to status enum. |
| Geo territory         | **Keep `territories`**, replace CHECK                | Drop `code in ('bc','ab','ca','or','wa')`. Add `level`, `parent_territory_id`, optional geometry/metadata. Seed Northern California as a **child region**, not `ca`.                                                     |
| Line territory rights | **`sales_line_territories` (new)**                   | Never store rights on the retailer.                                                                                                                                                                                      |
| Retailer master       | **`retailers` as renamed/split `prospects`**         | Preserve integer ids as `retailers.id` so `calls.prospect_id` can be migrated to `retailer_id` without collision.                                                                                                        |
| Line account          | **`retailer_line_accounts` (new)**                   | Commercial relationship. `UNIQUE (retailer_id, sales_line_id)`.                                                                                                                                                          |
| Shared contacts       | Keep `account_contacts` → rename `retailer_contacts` | Person identity.                                                                                                                                                                                                         |
| Line contact role     | **`retailer_line_contacts` (new)**                   | Buyer role, primary flag, engagement **per line account**.                                                                                                                                                               |

Do **not** put `territory_id` on `retailers` as the source of truth for rights. Retailer location (address, city, province, country) is identity. Assignment is `retailer_line_accounts.sales_line_territory_id` (nullable until staff confirms).

### 5.2 Cardinality rules

- One retailer → many line accounts.
- One sales line → many line accounts and many `sales_line_territories`.
- At most **one non-terminated** line account per `(retailer_id, sales_line_id)` — unique constraint plus a status check so historical terminated rows can exist if needed (partial unique index `WHERE status NOT IN ('terminated')` if history is required).
- A line account’s territory assignment **must** reference a `sales_line_territories` row for **that** line (composite FK or trigger). Do not assign OGR BC rights to an Eagle Peak account.

### 5.3 Existing `bkg` row

Leave `lines.code = 'bkg'` (Busted Knuckles Garage, `active = false`) untouched until the user decides. **Do not reuse it for Eagle Peak or Big Fish.** Add new codes, e.g. `eagle-peak`, `big-fish`, as **represented** lines (`onboarding` until catalog/territories/accounts are ready, then `active`). Reserve `status = 'prospective'` exclusively for the **Prospective Lines** acquisition pipeline (up to ~12 candidates), not for Big Fish.

### 5.4 Prospective Lines and research-only retailer targets

Prospective Lines are candidate principals under evaluation, not a fourth represented book.

| Allowed                                                                     | Forbidden                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Line record with `status = prospective`                                     | Represented picker, `active` / selling workspace                                 |
| ICP notes, agreement drafts, geographic interest                            | Public catalog / showroom RPCs                                                   |
| Research-only **retailer targets** (mapping a retailer to a candidate line) | `retailer_line_accounts` in selling statuses (`prospect`, `opened`, `active`, …) |
| Manual research notes                                                       | Orders, commissions, quotes, samples as commercial records                       |
| Owner/admin research workspace (`/app/prospective-lines`)                   | Automated outreach, nightly prep, Daily Briefing KPIs                            |
| Promote-to-represented as an explicit owner action later                    | Convert-to-active-account, reorder cadence, line-sheet send                      |

**Research-only retailer target** is a distinct row type (recommended: `retailer_line_targets` or a line-account `status = 'research_target'` that application and DB CHECKs exclude from selling). Targeting a store for a prospective line must **not** create an OGR-style prospect account and must **not** flip `account_status` on the shared retailer.

Capacity: design for **approximately 12** prospective line records without schema changes.

---

## 6. Shared versus line-specific field matrix

| Field / concern                                             | Layer                           | Notes vs today                                                                                             |
| ----------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Legal / public name                                         | Retailer                        | Today: `prospects.name`                                                                                    |
| Street, city, province/state, postal, country               | Retailer                        | Today: `address`, `city`; province implied by territory; **no postal/country/lat/lng**                     |
| Main phone, website                                         | Retailer                        | Exists                                                                                                     |
| Lat/lng, Place ID                                           | Retailer (**new**)              | Missing                                                                                                    |
| Generic retail channel (physical store type)                | Retailer, lightly               | Today: OGR taxonomy on the same row — split: generic channel on retailer; line ICP weights on line account |
| Duplicate keys (`external_id`, Place ID)                    | Retailer                        | `external_id` is BC-sheet scoped; keep as `source_external_ids` JSON or typed source table                 |
| Account status / grade / priority / fit score               | **Line account**                | Today global                                                                                               |
| Qualification, scoring evidence, next action                | **Line account**                | Today global                                                                                               |
| Apparel / category fit, competing brands, `existing_ogr`    | **Line account**                | Rename `existing_ogr` → line-specific competing/incumbent field                                            |
| Opening-order estimate, price list, currency, terms, credit | **Line account**                | Mostly missing; orders are CAD headers                                                                     |
| Notes, AI insights, suggested actions                       | **Line account**                | Today `prospects.notes`                                                                                    |
| Contacts (person)                                           | Shared person                   | Today mixed                                                                                                |
| Contact role / primary / engagement                         | **Line account via junction**   | Today `is_primary` unique per retailer                                                                     |
| Calls, appointments, tasks                                  | **Line account**                | Today `prospect_id`                                                                                        |
| Orders, quotes, samples, returns, commission                | **Line account**                | Orders exist (CAD); others missing                                                                         |
| Last order / reorder prediction                             | **Line account**                | Today 1:1 settings                                                                                         |
| Territory rights                                            | **sales_line_territories**      | Today retailer FK                                                                                          |
| Assigned salesperson                                        | **Line account**                | Missing (all staff see all)                                                                                |
| Catalog / SKUs / published showroom                         | **Sales line**                  | Already `line_id`                                                                                          |
| Outreach drafts / Resend ledger                             | **Line account + catalog_item** | Catalog implies line; must also stamp `retailer_line_account_id`                                           |
| Outreach monthly goal / briefing                            | **Per sales line**              | Today singleton                                                                                            |
| Portfolio KPI                                               | Explicit report only            | Must be labelled; default dashboards stay in-line                                                          |

**Never** sum revenue, mix statuses, or reuse qualification scores across lines except a labelled portfolio view that shows **line name + status only** (or opt-in metrics).

---

## 7. Proposed navigation and page hierarchy

Move from tab-global CRM to **line-first workspace**.

### 7.1 Routes

```
/app                              → last-used line or line picker
/app/lines                        → portfolio (all enabled lines)
/app/lines/:lineSlug              → line home (status, territories, KPIs)
/app/lines/:lineSlug/briefing     → Daily Agent Briefing (scoped)
/app/lines/:lineSlug/prospects
/app/lines/:lineSlug/accounts
/app/lines/:lineSlug/accounts/:lineAccountId
/app/lines/:lineSlug/contacts     → contacts in this line context
/app/lines/:lineSlug/catalog
/app/lines/:lineSlug/territories  → admin assignments for this line
/app/lines/:lineSlug/dashboard
/app/retailers/:retailerId        → portfolio identity only (no blended performance)
/app/prospective-lines            → acquisition pipeline (owner/admin)
/app/prospective-lines/:lineSlug  → research workspace + retailer targets only
```

Do **not** use `/app?prospectId=` as the canonical line-account URL. Keep query-param deep links as compatibility aliases that resolve through the selected line.

**Represented line picker:** Old Guys Rule, Eagle Peak, Big Fish (Big Fish may show Onboarding until catalog/territories exist).  
**Prospective Lines:** separate navigation, owner/admin, **Prospective** badge. Excluded from briefing, outreach cron, public catalog, convert, orders, and active-line KPIs. Cap UX around ~12 candidates.

### 7.2 Header

```
Eagle Peak                    [Line ▾]
Territories: Northern California | Oregon | Washington
Status: Onboarding
```

All lists, search, dashboard cards, and AI chips inherit `sales_line_id` from this context. Switching lines unmounts the previous line’s data.

### 7.3 Cross-line badges

On an OGR account row, if another **non-terminated** `retailer_line_account` exists:

- Chip: `Also Eagle Peak` or `2 lines`
- Click → line switcher **or** a summary of `{ lineName, status }` only
- **No** orders, notes, scores, buyers, or tasks from the other line

### 7.4 Tabs to keep, scoped

Briefing, Line Sheet, Dashboard, Calls, Prospects, Active Accounts, Contacts, Messages, Calendar, Insights — each query adds `sales_line_id` / `retailer_line_account_id`. Messages/Gmail remain dangerous until links are migrated (see §10).

---

## 8. Territory model

### 8.1 Current

- Flat `territories` with CHECK on five codes.
- `prospects.territory_id` NOT NULL; NULL backfilled to BC (`20260806170000_territories.sql`).
- Intra-territory: `region`, `primary_district`, `subterritory` (BC planning sheet).
- **No rights_type, dates, contract source, or line assignment.**

### 8.2 Proposed `territories` (geo)

| Column                | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `id`                  | PK                                                                                    |
| `country_code`        | `CA` / `US`                                                                           |
| `level`               | `country` \| `province_state` \| `region` \| `corridor` \| `county`                   |
| `name`                | Display                                                                               |
| `code`                | Stable slug (`bc`, `or`, `norcal`, `us-ca-sonoma`, …) — **drop the five-value CHECK** |
| `parent_territory_id` | Hierarchy                                                                             |
| `metadata` jsonb      | FIPS/SGC codes, bbox, notes                                                           |
| `geometry`            | Optional later (PostGIS); not required for v1                                         |

**Northern California must not equal `ca`.** v1 recommendation: define an explicit `norcal` **region** whose children are a **staff-approved county list** (stored as child `county` rows or as `metadata.counties[]` until GIS is justified). Until the agreement wording is confirmed, seed `norcal` as `status = proposed` on the Eagle Peak assignment only.

### 8.3 Proposed `sales_line_territories`

| Column                               | Purpose                                               |
| ------------------------------------ | ----------------------------------------------------- |
| `sales_line_id`                      | FK `lines`                                            |
| `territory_id`                       | FK geo                                                |
| `rights_type`                        | `exclusive` \| `limited_exclusive` \| `non_exclusive` |
| `status`                             | `proposed` \| `active` \| `expired` \| `disputed`     |
| `effective_date` / `expiration_date` | Contract window                                       |
| `contract_source`                    | Agreement filename / URL / note                       |
| `restrictions`                       | Text/json (accounts, channels, house accounts)        |
| `notes`                              |                                                       |

Admin UI: open a line → only that line’s assignments → add/modify without touching other lines.

### 8.4 Territory-by-line matrix **supported by evidence today**

| Line                    | In database?          | Territory rights in DB   | Evidence of assigned geography                                                                                                                                  |
| ----------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old Guys Rule           | Yes (`ogr`, active)   | None (retailer-level BC) | Seed + import = British Columbia. Schema _allows_ AB/CA/OR/WA but nothing assigns them to OGR. **OR/WA for OGR is not evidenced.** California is not evidenced. |
| Busted Knuckles Garage  | Yes (`bkg`, inactive) | None                     | No catalog, no prospects, unused in `src/`                                                                                                                      |
| Eagle Peak              | **No**                | **No**                   | Not in schema, seed, or UI                                                                                                                                      |
| Big Fish                | **No**                | **No**                   | Not in schema, seed, or UI. **Business decision: confirmed represented line** — still no rights or accounts in DB.                                              |
| Prospective Lines (≤12) | **No**                | **No**                   | Not in product. Research pipeline only.                                                                                                                         |

**Do not encode hoped-for geography as data until confirmed.** Planning assumption for _design_ (not migration):

| Line              | Status (intended)                                                                       | Territories (intended, unconfirmed)                                              |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| OGR               | Active (represented)                                                                    | BC confirmed in data; OR/WA maybe; CA not assumed                                |
| Eagle Peak        | Active or onboarding (represented)                                                      | Northern CA (undefined), OR, WA; not BC/AB unless confirmed                      |
| Big Fish          | Confirmed represented; onboard as `onboarding` until catalog/territories/accounts exist | None until confirmed — do not copy OGR BC                                        |
| Prospective Lines | `prospective` (not represented)                                                         | Optional _interest_ notes only; not `sales_line_territories` with selling rights |

Retailer **footprint** (CA, OR, WA, BC, AB) is the agency’s possible working area, not a grant of rights.

### 8.5 Assignment rule

AI and import **must not** set `sales_line_territory_id` from address alone. Location can _suggest_ a matching active assignment; staff confirms. A Portland store may be OGR-unassigned and Eagle Peak–Oregon.

---

## 9. AI isolation requirements

### 9.1 Inventory of AI surfaces

| Surface             | Entry                                                      | Today’s scope                                                              |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Ask AI / coach      | `AIAssistantModal` → `POST /api/agent`                     | System prompt: BC OGR apparel; tools keyed by `prospectId`                 |
| Suggest             | `buildSuggestDraft`                                        | OGR/BC copy; CRM tools by prospect id                                      |
| APF Brief           | `buildApfDraft` → `getAccountProductFit`                   | Default `lineCode=ogr`; catalog anchors for that code; scores in the model |
| Assist / call draft | `buildAssistDraft` / `buildCallDraft`                      | OGR/BC                                                                     |
| AI Update           | `AiUpdateResearchModal` → `/api/prospects/research-update` | Writes **prospect** columns                                                |
| Fill blanks         | `fillBlankProspectFields.ts`                               | OGR themes; deterministic BC scoring                                       |
| Add via AI          | `/api/prospects/enrich` → `createEnrichedProspect`         | BC OGR; model may assign `fitScore`                                        |
| Contact enrich      | `/api/contacts/enrich`                                     | Can create a prospect                                                      |
| Outreach drafts     | `generateOgrProductOutreachDraft`                          | OGR apparel prompt; OGR published SKUs                                     |
| Landed rates        | `/api/pricing/landed-rates`                                | “BC apparel wholesale rep”                                                 |
| Reorder notes       | `getReorderSuggestions`                                    | Orders + settings by `account_id` (CAD)                                    |
| Public live chat AI | `/api/chat/ai-reply`                                       | Buyer/OGR wholesale context (separate from staff CRM)                      |

### 9.2 Required request context (every staff AI call)

```
sales_line_id
retailer_line_account_id   // omit only for line-level tools (catalog, ICP)
territory assignment id    // permitted sales_line_territories
data_scope                 // which tables the tools may read
```

Refuse the request if the line account does not belong to the selected line.

### 9.3 Hard prohibitions

- Load `catalog_items` for another `line_id`
- Apply OGR seed-fit / Okanagan / apparel taxonomy to Eagle Peak
- Concatenate notes, calls, or orders across line accounts
- Use another line’s USD/CAD price list
- Change another line’s `account_status`
- Auto-assign territory from city/state
- Run APF, outreach, convert, or order tools against a **Prospective Line** or a research-only retailer target
- Use Big Fish catalog/prompts while working OGR or Eagle Peak (and the reverse)

### 9.4 Line-specific AI configuration (`sales_line_ai_profiles`)

Suggested row per line:

- Ideal customer profile and channel weights
- Qualification rubric (deterministic functions keyed by line code)
- Product categories / competitive brands
- Opening-order and reorder assumptions
- Currency
- Prompt templates (system + APF + fill-blanks)
- Published-catalog filter

v1: JSON config on `lines` is acceptable; split table if prompts grow.

### 9.5 Verified retailer identity

Fill-blanks / AI Update may **propose** address/phone/website changes; apply to `retailers` only with:

- `retailer_field_changes` audit (mirror `catalog_field_changes`)
- no overwrite of `verification_status = verified` fields without explicit staff confirm

---

## 10. Migration plan

Goal: **zero loss of OGR history**, no automatic merge of uncertain duplicates, **no silent clone of OGR accounts onto Eagle Peak or Big Fish**, Prospective Lines never enter selling tables.

### 10.1 Principles

- Preserve `prospects.id` as `retailers.id` (integer).
- Create one `retailer_line_accounts` row per existing prospect, `sales_line_id = ogr`.
- Move line-specific columns off the retailer in the **same** transactional migration as backfill, or use a expand/contract pattern (add new tables, dual-write, backfill, switch reads, drop old columns).
- Do not delete `calls` / `prospect_updates` rows that lack FKs; attach them via `prospect_id → retailer_id` then `retailer_line_account_id` for the OGR account.
- Do not invent Eagle Peak line accounts from geography.
- Do not merge two `prospects` rows that look similar.

### 10.2 Phased expand/contract (recommended)

**Phase M0 — freeze**  
Backup. Record counts (validation queries below). Stop dual imports.

**Phase M1 — additive schema**  
Create `principals`, extend `lines`, hierarchical `territories` (keep old five rows as `province_state`), `sales_line_territories`, `retailer_line_accounts`, `retailer_line_contacts`, audit table. Do not drop columns yet.

**Phase M2 — OGR backfill**

```
principals: Old Guys Rule (or existing legal name)
lines.ogr: principal_id, status=active, default_currency=CAD (commercial) / USD wholesale as now
sales_line_territories: ogr × bc, status=active, rights_type TBD (ask user)
retailers: identity columns copied from prospects
retailer_line_accounts: one per prospect
  status mapped from account_status
  sales_line_territory_id = ogr-bc if territory was bc, else NULL + review queue
  copy scores, notes, planning fields
retailer_line_contacts: copy current account_contacts as OGR roles
orders, calls, reorder_settings, system_messages: set retailer_line_account_id
  orders.line_id null → ogr
  calls.line_id null → ogr account
```

**Phase M3 — application cutover**  
Ship line-scoped reads/writes. Keep old columns populated by trigger until confidence.

**Phase M4 — drop / rename**  
Drop line-specific columns from `retailers`. Rename tables if desired. Update types.

**Phase M5 — Eagle Peak (separate change)**  
Insert principal + represented line `status=onboarding` (or `active` if catalog is live). Insert `sales_line_territories` only for confirmed geos (OR, WA, proposed norcal). **No retailer_line_accounts until staff creates them.** Catalog import for canopies is a separate catalog job.

**Phase M6 — Big Fish (represented, separate change)**  
Insert principal + represented line `status=onboarding` until catalog, currency, and territories are confirmed. **Zero** `sales_line_territories` and **zero** line accounts until staff adds them. Do not copy OGR prospects. Feature-flag selling UI until onboarding complete.

**Phase M7 — Prospective Lines pipeline**  
Support up to ~12 `status=prospective` lines with research notes and research-only retailer targets. Database and app CHECKs forbid orders, commissions, convert, nightly prep, public RPCs, and active KPIs for this status.

### 10.3 Duplicate detection (no auto-merge)

After retailer master exists, report likely duplicates:

- Exact normalized name
- Name + city
- Shared website host
- Shared primary email on contacts
- Future Place ID

Output a **review queue**, not `UPDATE … SET`. Merging is a later explicit tool.

### 10.4 Validation queries (run before/after)

```sql
-- Counts
select account_status, count(*) from prospects group by 1;
select count(*) from orders;
select count(*) from calls;
select count(*) from account_contacts;
select count(*) from system_messages;

-- After backfill
select count(*) from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id where l.code = 'ogr';
-- must equal count(*) from prospects

select count(*) from orders o
left join retailer_line_accounts rla on rla.id = o.retailer_line_account_id
where rla.id is null;  -- must be 0

select count(*) from calls c
left join retailer_line_accounts rla on rla.id = c.retailer_line_account_id
where rla.id is null;  -- must be 0

-- No Eagle Peak / Big Fish accounts until explicitly created
select count(*) from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id where l.code in ('eagle-peak', 'big-fish');

-- Prospective lines must have zero selling accounts and zero orders
select count(*) from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id where l.status = 'prospective'
  and rla.status not in ('research_target');  -- or zero rows if targets are a separate table
```

### 10.5 Rollback

- M1–M2: reverse migration drops new tables; old `prospects` columns still source of truth.
- After M3: restore DB backup; revert app deploy. Dual-write period exists specifically so rollback does not require reconstructing notes from line accounts.
- Keep a snapshot of `prospects`, `orders`, `calls`, `account_contacts`, `system_messages` before M2.

### 10.6 Data-loss risks to watch

- `calls.prospect_id` / `prospect_updates.prospect_id` without FK → orphans if ids are regenerated.
- Import script omitting `territory_id` historically relied on BC backfill.
- `orders.line_id` null must not be left null after cutover.
- Wholesale buyer `profiles.prospect_id` must point at `retailers.id`.
- Public OGR RPCs must keep filtering `l.code = 'ogr'`.

---

## 11. Recommended database constraints

```
principals_pkey
lines_code_key                              -- keep
lines.principal_id → principals
lines.status CHECK (prospective|onboarding|active|paused|terminated)
  -- prospective = acquisition pipeline only (≤~12); never represented selling
  -- onboarding/active/paused/terminated = represented lines (OGR, Eagle Peak, Big Fish, …)

territories.parent_territory_id → territories
-- remove territories_code_check of five codes

sales_line_territories
  UNIQUE (sales_line_id, territory_id) WHERE status IN ('proposed','active','disputed')
  FK (sales_line_id, …) consistent with lines
  rights_type CHECK
  status CHECK (proposed|active|expired|disputed)

retailer_line_accounts
  UNIQUE (retailer_id, sales_line_id)           -- v1 if no history rows
  -- or UNIQUE (retailer_id, sales_line_id) WHERE status <> 'terminated'
  FK sales_line_territory_id → sales_line_territories
  CHECK: assignment’s sales_line_id = row’s sales_line_id
  status CHECK (prospect|opened|active|productive|dormant|inactive|terminated)
        -- map from today's prospect|active_account|inactive

retailer_line_contacts
  UNIQUE (retailer_line_account_id) WHERE is_primary
  -- do NOT keep “one primary per retailer”

orders.retailer_line_account_id NOT NULL (after backfill)
calls.retailer_line_account_id NOT NULL (after backfill)
system_messages.retailer_line_account_id (nullable only for non-CRM messages)

-- Add FKs that are missing today
calls.retailer_id → retailers
prospect_updates.retailer_id → retailers
```

Currency: `retailer_line_accounts.currency` (`CAD` | `USD`). `orders.total_amount` + `currency` (stop assuming CAD). Catalog may remain dual USD wholesale / local MSRP **per line settings**.

---

## 12. Security and row-level access

Today: `is_approved_staff()` full access on CRM tables (`schema.sql` ~873–886 and per-table policies). Buyers see own cart via `prospect_id`.

**v1 (single-operator agency):** keep staff-wide RLS **but** every query in the app must filter by `sales_line_id`. Represented onboarding lines (Eagle Peak, Big Fish) appear in the line picker but selling/outreach stay feature-flagged until ready. Prospective Lines: `status = 'prospective'` only in `/app/prospective-lines`; hidden from represented picker, briefing, and cron.

**v2 (if additional reps):**

```
staff_line_memberships (user_id, sales_line_id, role)
staff_line_territories (user_id, sales_line_territory_id)
```

Policies: staff can SELECT line accounts only for memberships; service-role cron already used for nightly prep — constrain cron actor to the line being prepared.

Never use service role in React islands. Cron remains secret-gated (`CRON_SECRET`) as today.

Public catalog RPCs stay **per-line** (`ogr` vs future Eagle Peak showroom). Do not create a combined public catalog.

---

## 13. Testing plan

1. **Schema tests:** unique `(retailer, line)`; cannot attach OGR territory assignment to Eagle Peak or Big Fish accounts; `prospective` excluded from `fetchActiveLines` / selling UI; cannot insert orders against prospective lines or research targets.
2. **Migration tests:** fixture of mixed `account_status` + orders + calls + messages → counts match; null `line_id` orders land on OGR; zero Eagle Peak / Big Fish line accounts until explicit staff create.
3. **UI isolation:** with two line accounts on one retailer, OGR account page shows only OGR orders/notes; badge does not leak revenue.
4. **Routing:** `/app/lines/eagle-peak/accounts/:id` 404s for an OGR-only lineAccountId.
5. **AI:** APF with Eagle Peak or Big Fish context cannot return OGR SKUs; fill-blanks uses that line’s rubric; agent tools require `retailer_line_account_id`; prospective-line tools cannot call outreach/convert.
6. **Outreach:** `selectOutreachTargets` only OGR prospects when prep run is OGR; capacity/goals per line.
7. **Currency:** USD Eagle Peak order does not enter CAD OGR LTV.
8. **Territory admin:** adding OR to Eagle Peak does not add OR to OGR.
9. **Regression:** public `/old-guys-rule-wholesale` still `code = 'ogr'`; BC directory still loads after retailer split.
10. **`npm run check`** on every PR (pre-PR gate).

---

## 14. Unresolved business questions

**Blockers for schema seed of rights:**

1. Confirm **Eagle Peak** legal principal name, line slug, status (`active` vs `onboarding`), default currency, and commission.
2. Confirm **Northern California** county list or written corridor definition. Until then, assignment stays `proposed`.
3. Confirm whether **OGR** has Oregon and/or Washington (and exclusivity). Do not backfill OR/WA onto OGR from address.
4. Confirm OGR rights in **Alberta** (seeded territory, unused).
5. Confirm **Busted Knuckles Garage**: keep dormant, retire, or still coming. Do not conflate with Eagle Peak.
6. **Big Fish (confirmed represented):** legal principal name, slug, default currency, commission, product categories, and territory rights. Do not copy OGR accounts. Onboard as empty book until those are known.
7. Map today’s `account_status` to the richer set (opened / productive / dormant) or keep three values in v1.
8. Default **rights_type** for existing OGR–BC (exclusive vs unknown).
9. Should **catalog taxonomy / lifestyle themes** stay OGR-specific or be generalized per line?
10. **Wholesale public site** for Eagle Peak: separate origin/path vs later?
11. **Outreach monthly target of 5 Active Accounts** — per line or agency-wide? Today it is a singleton.
12. Preserve **integer retailer ids** publicly (staff already uses `#123` in AI chips)?
13. Who may see **Prospective Lines** (acquisition pipeline) — owner only?
14. Research-only retailer targets: separate table vs `status = research_target` on `retailer_line_accounts`?
15. First ~12 prospective-line names, or empty pipeline at launch?

---

## 15. Phased implementation plan

Do not start Phase 1 until §14 items 1–5, 6 (Big Fish details as known), and 8 are answered. Big Fish _as a represented line_ is already decided.

| Phase | Name                       | Outcome                                                                                                     |
| ----- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **0** | This audit + decisions     | Approved field matrix, slugs, territory list, BKG policy, Eagle Peak / Big Fish onboarding details          |
| **1** | Schema foundation          | New tables + extended `lines`/`territories`; OGR backfill behind flag; line `status` includes `prospective` |
| **2** | Line context in app        | Represented line picker (OGR + placeholders for Eagle Peak / Big Fish), route prefix, scoped fetches        |
| **3** | Split remaining writes     | Convert, notes, contacts, orders, calls, reorder, outreach, goals use `retailer_line_account_id`            |
| **4** | AI isolation               | Prompts + tools + fill-blanks keyed by line profile; retailer identity audit log                            |
| **5** | Territory admin            | Line territory CRUD; norcal proposed region; stop using `prospects.territory_id` as rights                  |
| **6** | Eagle Peak onboarding      | Catalog/ICP as available; empty account book; badges; feature-flagged selling                               |
| **7** | Big Fish onboarding        | Represented line record; empty book; no OGR clone; feature-flagged selling until territories/catalog exist  |
| **8** | Prospective Lines pipeline | Up to ~12 research candidates; retailer targets; hard blocks on selling/outreach/KPIs                       |
| **9** | Cleanup                    | Drop old columns; FKs on calls; optional PostGIS; staff-line RLS if needed                                  |

**Out of scope until later:** GIS drawing tools, automatic duplicate merge, independent duplicate retailer databases, Gmail as a send system, autosend outreach.

Implementation sequencing, feature flags, and rollback for this plan live in [docs/epics/multi-line-multi-territory-crm.md](epics/multi-line-multi-territory-crm.md) (draft; requires approval).

---

## 16. Exact files likely requiring modification

### Schema / types

- `supabase/schema.sql`
- `supabase/migrations/` (new dated migration; do not rewrite old BC seeds)
- `src/types/database.ts`
- `src/types/index.ts` (`LineKey`, `TabKey` / routes)

### Line / territory / retailer core

- `src/lib/lines.ts`, `src/lib/territories.ts`, `src/lib/prospects.ts`
- `src/lib/accountContacts.ts`, `src/lib/orders.ts`, `src/lib/calls.ts`
- `src/lib/accountReorderSettings.ts`, `src/lib/convertToActiveAccount.ts`
- `src/lib/catalog.ts`, `src/lib/catalogSettings.ts`
- `src/lib/systemMessages.ts`, `src/lib/messages.ts`
- New: `src/lib/retailers.ts`, `src/lib/retailerLineAccounts.ts`, `src/lib/salesLineTerritories.ts`

### App shell / UI

- `src/pages/app/index.astro` (and new `src/pages/app/lines/...` if file-based routing is adopted)
- `src/components/auth/AuthGate.tsx`, `src/components/RepCommandCenter.tsx`
- `src/components/Header.tsx`, `src/components/TabNav.tsx`
- `src/components/tabs/*` (especially Prospects, ActiveAccounts, Catalog, Dashboard, AgentBriefing, Calls, Contacts)
- `src/components/ProspectDetailDrawer.tsx`, `AccountDetailDrawer.tsx`, `ProductDetailDrawer.tsx`
- `src/components/ConvertAccountModal.tsx`, `LogCallModal.tsx`
- `src/components/directory/RetailerDirectory.tsx`

### AI

- `src/pages/api/agent.ts`, `src/lib/agentCrmTools.ts`, `src/lib/aiAssistPrefill.ts`
- `src/lib/createEnrichedProspect.ts`, `src/lib/fillBlankProspectFields.ts`
- `src/lib/updateProspectResearch.ts`, `src/pages/api/prospects/**`
- `src/lib/prospectEnrichment/**` (BC-specific modules become OGR line strategy)
- `src/lib/generateOgrProductOutreachDraft.ts` (generalize or fork per line)
- `src/lib/outreachSelectTargets.ts`, `outreachEligibility.ts`, `outreachProductSelection.ts`
- `src/lib/outreachGoals.ts`, `outreachPace.ts`, `outreachBriefing.ts`, `outreachNightlyPrep.ts`
- `src/lib/crmRetailTaxonomy.ts` (line-specific packs)

### APIs

- `src/pages/api/catalog/items/[sku].ts`
- `src/pages/api/staff/ogr-product-email/**` (line-agnostic rename over time)
- `src/pages/api/staff/outreach/**`
- `src/pages/api/staff/gmail/**`, `calendar/**` (stamp line account on links)
- `src/pages/api/wholesale/order-requests.ts`
- `src/pages/api/lines/[code].ts`

### Import / seed (do not silently re-run against production)

- `src/lib/prospectListImport.ts`, `scripts/import-prospect-list.ts`
- `scripts/generate-directory-seed.mjs`, `scripts/seed-source/**`
- `scripts/catalog-import/from-json.ts`

### Public OGR (keep isolated)

- `src/pages/old-guys-rule-wholesale/**`
- `src/lib/wholesaleFilters.ts`, `src/lib/productUrls.ts`
- RPC definitions in `schema.sql`

### Tests (representative)

- `src/lib/*.test.ts` for prospects, convert, orders, outreach, agent tools, fill-blanks
- `src/test/api/**`
- New migration/isolation tests as in §13

---

## Appendix A — What currently exists (concise)

- One directory table (`prospects`) = retailer + account + OGR planning sheet.
- Prospect vs account = `account_status`.
- Catalog is the only robust line dimension (`ogr` / unused `bkg`).
- Territory list is five states/provinces; **data and scoring are BC**.
- Orders are CAD totals without SKUs.
- Staff UI is a single `/app` tab shell hardcoded to OGR.
- AI and outreach are OGR apparel + Vancouver timezone.
- RLS = any approved staff, all rows.
- Eagle Peak, Big Fish, Northern California, and Prospective Lines **are not in the product**. Intent: Eagle Peak + Big Fish = represented; other candidates = Prospective Lines pipeline.

## Appendix B — Highest-risk commingling problems

1. Global `account_status` / convert.
2. Global notes, scores, qualification, next action.
3. Retailer-scoped contacts, calls, reorder, order history.
4. OGR-default APF and outreach selection.
5. Territory stored on the store, with California as an entire state.

## Appendix C — Proposed architecture (concise)

Shared **retailer** identity; per-line **line accounts**; per-line **territory rights**. Catalog stays on `lines`. Every activity and AI call carries `retailer_line_account_id`. Portfolio badges never merge performance.

## Appendix D — Decisions needed from the user

See §14. Minimum to start Phase 1: Eagle Peak slug/status/currency; Big Fish slug/currency (represented; territories may wait); norcal definition or “proposed only”; OGR OR/WA/AB rights; BKG fate; Prospective Lines visibility (owner-only) and target-row shape.

## Appendix E — Numbered implementation sequence

1. Record answers to §14.
2. Additive migration (principals, line status, geo hierarchy, `sales_line_territories`, `retailer_line_accounts`, contact junction, FKs).
3. Backfill OGR only; validate counts.
4. Line picker + route prefix; filter all reads.
5. Move writes (convert, notes, orders, calls, contacts, outreach).
6. AI request context + per-line prompts/rubrics + retailer field audit.
7. Territory admin UI.
8. Enable Eagle Peak catalog + empty book (no silent account clone).
9. Enable Big Fish as represented empty book (no OGR clone).
10. Prospective Lines pipeline (~12) + research-only retailer targets.
11. Drop dual-write columns.

---

**No production code, migrations, or data were modified for this audit. Wait for approval before implementing.**
