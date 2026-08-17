# Bulk account upload and AI enrichment

Status: final product / design document  
Scope: documentation only. This document does not authorize implementation, data import, schema apply, outreach, or hosted writes.  
First implementation target: verified Old Guys Rule (OGR) historical customers in Washington and Oregon.  
Later reuse: Faire customer files, ZoomInfo leads, research prospects, Eagle Peak books.

---

## 1. Objective

Give an owner a reusable, idempotent workflow to:

1. Upload an XLSX or CSV of real retailers for a represented sales line.
2. Map, normalize, and preview those rows against the existing retailer identity + line-account model.
3. Import them as a traceable batch without creating duplicate retailers, line accounts, contacts, notes, or enrichment jobs.
4. Run the existing AI profile-search / research-update capability across the batch.
5. Review protected or uncertain AI changes before they overwrite identity data.
6. Leave verified historical OGR customers classified as opened-but-dormant reactivation candidates — not as never-purchased BC-style prospects, and not as currently active accounts unless a qualifying recent order exists.

The first cohort is 24 unique verified OGR customers from two workbooks (13 Oregon, 11 Washington, one in-file duplicate). These records are seed profiles for a later lookalike-prospect workflow. Lookalike discovery is a boundary in this document, not part of the first implementation.

---

## 2. Current AI Ingest audit

The product label “AI Ingest” is not a named module. In the running app it is the one-at-a-time **Add via AI** create path plus the per-row **Verify & Update** / **Fill Blank Fields** research path. Contact ingest is a sibling flow.

### 2.1 Where the user starts

| Entry                                     | File                                                                          | What it does                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Prospects toolbar **+ Add via AI**        | `src/components/tabs/ProspectsTab.tsx`                                        | Opens `AddProspectAiModal`. Creates a new retailer.                                                   |
| Messages **Add via AI from this message** | `src/components/messages/MessageThreadPanel.tsx`                              | Same modal, prefilled with inbound company/website and optional buyer/phone/email/city/channel seeds. |
| Row action **Verify & Update**            | `ProspectsTab.tsx`, `src/components/tabs/ActiveAccountsTab.tsx`               | Opens `AiUpdateResearchModal` in `update` mode.                                                       |
| Row action **Fill Blank Fields**          | same tabs                                                                     | Opens `AiUpdateResearchModal` in `fill-blanks` mode.                                                  |
| Contacts **+ Add via AI**                 | `src/components/tabs/ContactsTab.tsx`, `src/components/AddContactAiModal.tsx` | Contact-first ingest; may create a prospect or attach to a name-matched account.                      |

There is no bulk upload UI, no import-batch object, and no XLSX/CSV parser in the app (`xlsx` / `exceljs` / `papaparse` are not dependencies).

### 2.2 Inputs the create path accepts

The modal UI (`src/components/AddProspectAiModal.tsx`) collects only:

- company name (required)
- website URL (optional)

The client (`src/lib/enrichProspect.ts`) and API (`src/pages/api/prospects/enrich.ts`) also accept `contactName`, `phone`, `email`, `city`, `retailChannelHint`, `territoryCode`, and `salesLineId`. Those extra fields are used when Messages passes `enrichSeeds`. They are not shown on the Prospects modal.

**Conclusion:** the public create UX is name-first (name + optional website). The server path can take additional identity seeds, but the Prospects entry point does not collect address, state, ZIP, store type, or former-rep code.

### 2.3 How it searches

1. `POST /api/prospects/enrich` authenticates with `requireApprovedStaffClient` (`src/lib/agentAuth.ts`).
2. Rate limit: 20 requests / 10 minutes per user, key `enrich:${userId}` (`src/lib/agentRateLimit.ts`). Shared in-memory window; not a batch queue.
3. `gateStaffAiContext` (`src/lib/aiLineContext.ts`): if `FEATURE_MULTI_LINE_AI` is on, `sales_line_id` is required and BKG / declined / terminated lines are rejected. Flag off → legacy OGR/BC, no line id required.
4. `createEnrichedProspect` → `inferEnrichedProspectFields` (`src/lib/createEnrichedProspect.ts`).
5. `researchCompany` (`src/lib/companyWebResearch.ts`) calls Vercel AI Gateway `openai/gpt-4o` with the Perplexity search tool (`maxResults: 5`, optional `searchDomainFilter` when a website hostname is present). Soft-fails to a name-only prompt if search returns nothing.
6. `generateObject` with `enrichedProspectSchema` produces structured CRM fields.

Research-update uses the same stack:

- Preview: `POST /api/prospects/research-update` → `previewProspectResearchUpdate` (`src/lib/updateProspectResearch.ts`).
- Apply: `POST /api/prospects/research-update/apply` → `applyProspectResearchUpdate`.
- Fill-blanks: `inferFillBlankProspectFields` (`src/lib/fillBlankProspectFields.ts`) researches, extracts evidence, then applies deterministic BC scoring (`seedFitScore`, `priorityGrade`, `bcTerritory`).

### 2.4 Retailer identity create / match

`createEnrichedProspect` **always inserts a new `prospects` row**. It allocates the next integer id (`max(id)+1`) and retries once on unique violation. It does **not** search for an existing retailer by name, address, email, or website.

Name matching exists elsewhere and is unused by Add via AI:

- `findCompanyMatches` (`src/lib/companyMatch.ts`) — exact then substring, used by Add Contact via AI.
- `matchSheetToCrm` (`src/lib/prospectListImport.ts`) — `external_id`, then normalized name + city. Offline HTML → SQL for the BC research list, not an in-app workflow.
- `wholesaleProspectMatch.ts` — inbound wholesale form match by email then name.

**Material limitation:** repeating Add via AI for the same store creates a second retailer.

### 2.5 Line-account create and `sales_line_id`

After insert, `stampLineAccountIfNeeded` writes `retailer_line_accounts` with:

```ts
relationship_status: 'prospect';
```

`sales_line_id` comes from gated AI context when the AI flag is on. If missing and `lineCode !== 'bkg'`, it **silently defaults to the OGR line**. Unique violations are ignored.

Independently, `prospects` insert/update triggers `ensure_ogr_retailer_line_account_from_prospect` (`supabase/schema.sql`). That function maps `prospects.account_status` onto OGR `relationship_status` and, on insert, assigns a sales-line territory **only for BC**. OR/WA/CA/AB/norcal get `sales_line_territory_id = null` and `backfill_review_reason = 'non_bc_territory'`.

A later AI fill-blanks or notes write that touches a synced column will re-run that trigger and **reset OGR `relationship_status` from `prospects.account_status`**. Historical import therefore cannot write RLA `opened` while leaving `account_status = prospect`.

### 2.6 Defaults today (relationship, activity, productivity, territory, account status)

| Concern                               | Current Add via AI default                                                     | Evidence                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `prospects.account_status`            | `'prospect'` (table default; insert does not set it)                           | `supabase/schema.sql` prospects check; `createEnrichedProspect.ts` insert   |
| RLA `relationship_status`             | `'prospect'`                                                                   | `stampLineAccountIfNeeded`                                                  |
| Activity                              | derived view: no orders → **`never_ordered`**, not `dormant`                   | `retailer_line_account_activity` in `supabase/schema.sql`                   |
| Productivity                          | view always **`unclassified`** while `lines.productivity_thresholds` is unused | `retailer_line_account_productivity`                                        |
| Territory                             | `territoryCode` or **`bc`**                                                    | `resolveTerritoryIdByCode(..., input.territoryCode \|\| BC_TERRITORY_CODE)` |
| Region                                | AI enum of six **BC** districts                                                | `PROSPECT_REGIONS` in `createEnrichedProspect.ts`                           |
| City                                  | schema describes “BC city or town”                                             | same file                                                                   |
| `source_note`                         | `'Add via AI'`                                                                 | insert extras                                                               |
| `converted_at` / `initial_order_date` | null                                                                           | not written                                                                 |
| `buyer_verified`                      | false (table default)                                                          | schema                                                                      |
| `existing_ogr`                        | null                                                                           | not written                                                                 |
| Fit / notes                           | `fit = "{score}/10 — {two sentences}"`                                         | `formatProspectFit`                                                         |
| `prospects.notes`                     | not written by AI create                                                       | insert omits `notes`                                                        |

Directory split (`src/lib/retailerLineAccounts.ts` `splitDirectoryByAccountOrLineRelationship`): OGR uses overlaid `accountStatus`; Eagle Peak / Big Fish selling snapshots split on RLA `opened`. Overlay maps RLA `opened` → directory `active_account` (`src/lib/ogrCommercial.ts`, `src/lib/prospects.ts`).

### 2.7 Contacts

Add via AI creates a buyer contact **only when `contactName` is provided** (`insertBuyerContact`). Role `buyer`, `is_primary: true`, notes `'Inbound / Add via AI'`, then `retailer_line_contacts` upsert. The Prospects modal does not collect a contact name, so most Add via AI rows have **no contact**.

Add Contact via AI (`src/lib/createEnrichedContact.ts`) researches the person, may invent nothing for email/phone/title, and either attaches to a matched account or creates a new prospect with `relationship_status: 'prospect'`.

### 2.8 Profile fields and taxonomy

Create path infers: cleaned name, primary channel (`PRIMARY_RETAIL_CHANNELS`), BC region, city, optional address/phone, fit score, two-sentence notes. Website and retail-channel hint are stored only if the user supplied them — the model does not write `website` on create.

Fill-blanks can also propose: website, subterritory, primary district, retail category, apparel capability, verification status, fit score, ideal opening units, priority, provisional grade, next action. BC geography mappers (`src/lib/prospectEnrichment/bcTerritory.ts`) return “Needs mapping” for non-BC `territoryCode`. Scoring still uses OGR/Okanagan rubrics when `lineCode` is missing or `ogr`.

Never filled by AI today: `external_id`, `buyer_verified`, `existing_ogr`, social links as first-class columns, postal code, structured state, former-rep code, import batch id.

### 2.9 How profile notes are generated

There is no dedicated profile-note field with fact/inference labels.

- Create / Verify & Update: two sentences from `generateObject`, stored inside `prospects.fit` via `formatProspectFit`.
- Fill-blanks: `buildReasonForInclusion` (`src/lib/prospectEnrichment/planningCopy.ts`) — template copy plus optional “customer alignment” evidence. Not labeled as sourced vs inferred.
- Staff-editable `prospects.notes` / RLA `notes` are a separate field (`updateProspectNotes`). AI ingest does not write them.
- The Perplexity **research brief is not persisted**.

### 2.10 `retailer_field_changes`

Table: `supabase/schema.sql` (`source` in `user | ai | import | calculated | unknown`; optional `sales_line_id`, `retailer_line_account_id`).

Writers: `src/lib/retailerFieldChanges.ts`, called from `applyProspectResearchUpdate` after a successful update. Rows are an **after-the-fact audit log**, not a pending-review queue. There is no UI to approve/reject a `retailer_field_changes` row. Create-via-AI does **not** write field-change rows.

### 2.11 Protected / verified fields

`VERIFIED_IDENTITY_FIELDS = ['name', 'address', 'phone', 'website']` (`src/lib/retailerFieldChanges.ts`).

A row is treated as verified identity when `buyer_verified = true` **or** `verification_status` matches `/^verified$/i`.

On apply, if verified and `confirmVerifiedOverwrite` is not true, those identity fields are stripped from the patch. The apply API accepts `confirmVerifiedOverwrite`; **`AiUpdateResearchModal` never sends it**. Fill-blanks also never writes `externalId`, `buyerVerified`, or `existingOgr` (`mergeFillBlankFields`).

`verification_status` values actually produced by fill-blanks are `'Website confirmed'`, `'Directory lead'`, `'Unverified'` — none of which match `/^verified$/i`. So **buyer-verified is the only reliable protection today**. Historical import must set `buyer_verified` (and/or a true `verified` status) on identity fields that came from the workbook, or AI Update can overwrite them.

### 2.12 Provenance and confidence

| Data                                          | Stored?                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Actor, source=`ai`, old/new value, timestamps | Yes, on research **apply** only                                         |
| Model / provider                              | No (`openai/gpt-4o` and Perplexity are hardcoded, not recorded per row) |
| Research brief                                | No                                                                      |
| Confidence score                              | No                                                                      |
| Source URLs                                   | Extracted in fill-blank evidence schema, **not written** to CRM         |
| Create-via-AI provenance                      | `source_note = 'Add via AI'` only                                       |

### 2.13 Failures, partial results, retries, duplicates

- Web research soft-fails; enrichment continues from the name.
- Create insert retries once on id collision only.
- No retry queue, no cancel of in-flight Gateway calls (modal close after start does not abort the server job).
- Preview is per row and re-runs paid research every open.
- Duplicate businesses are not detected on create.
- Partial create: prospect insert can succeed, then contact or RLA stamp can fail and return 502 with an orphan retailer.
- 20/10 min rate limit makes even a 24-row sequential enrich likely to 429.

### 2.14 Line context: OGR, Eagle Peak, Big Fish

Phase 4 (`src/lib/aiLineContext.ts`, `src/lib/salesLineAiProfiles.ts`, migration `supabase/migrations/20260816090000_multi_line_phase4_ai_profiles.sql`) can bind staff AI to ogr / eagle-peak / big-fish personas when the AI flag is on. Flag off is OGR/BC. Default prompts and `enrichedProspectSchema` remain BC-region and OGR-apparel shaped. Eagle Peak / Big Fish catalogs are empty; APF is research-only.

**Bulk import should use the same gate (`sales_line_id` required when the AI flag is on; never silent OGR default in the new API).** The current create helper still defaults to OGR when line id is omitted — the bulk path must not copy that fallback.

### 2.15 Helpers the bulk workflow should reuse

| Helper                                                                             | Reuse as                                                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `researchCompany` / `inferEnrichedProspectFields` / `inferFillBlankProspectFields` | Per-row enrichment engines                                                        |
| `previewProspectResearchUpdate` / `applyProspectResearchUpdate`                    | Batch enrich preview + apply                                                      |
| `mergeFillBlankFields` / `FILL_BLANK_ALLOWLIST`                                    | Safe fill of blanks                                                               |
| `isVerifiedIdentityStatus` / `insertRetailerFieldChanges`                          | Protected fields + audit                                                          |
| `normalizeProspectName` / `matchSheetToCrm` patterns                               | Duplicate matching (extend; do not use BC `external_id` as the primary key)       |
| `territoryCodeFromProvince` / `resolveTerritoryIdByCode`                           | WA/OR/BC mapping                                                                  |
| `gateStaffAiContext` / `requireApprovedOwnerClient`                                | Auth + line isolation                                                             |
| `catalogIngest` report/merge shape (`src/lib/catalogIngest.ts`)                    | UX pattern for counts, conflicts, fill-blank vs conflict — not the catalog tables |
| `crmRetailTaxonomy` / `CATEGORY_MAPPING_GUIDANCE`                                  | Store-type mapping                                                                |
| `suggestedAssignmentForLocation` (`src/lib/salesLineTerritories.ts`)               | Attach OR/WA OGR SLT when an active assignment exists                             |
| `AiUpdateResearchModal` / `buildResearchUpdateDiffs`                               | Review UI for uncertain AI diffs                                                  |
| `findCompanyMatches`                                                               | Intra-CRM name collision warnings                                                 |

### 2.16 Remaining assumptions the bulk feature must correct

The current feature is still **OGR-default, BC-default, name-first, and single-record**:

1. **Single-record only** — one modal, one Gateway call, no batch, no progress, no cancel remaining.
2. **Name-only UX** — address/state/ZIP/store type/contact from a spreadsheet cannot be entered in the Prospects modal.
3. **No deterministic duplicate protection** on create.
4. **Always `relationship_status = prospect`** — cannot express historical purchaser.
5. **Territory and region are BC** unless a seed overrides territory; AI region enum cannot emit Oregon/Washington.
6. **Activity view treats “no order rows” as `never_ordered`**, which would mislabel verified past customers if we do not extend the view.
7. **OGR dual-write trigger** will clobber RLA status from `prospects.account_status` on later updates.
8. **OR/WA line territories are not auto-attached** (`non_bc_territory`).
9. **No postal code on `prospects`** (postal exists on wholesale request tables only).
10. **No persisted research brief, confidence, or model provenance.**
11. **`retailer_field_changes` is not a review queue** — apply is immediate.
12. **Rate limit and sequential paid calls** cannot support a 24-row, let alone ZoomInfo-scale, enrich.
13. **Notes live in `fit`**, mixed with a numeric score, with no sourced-vs-inferred labeling.
14. **Workbooks are not in the repository**; mapping below is from the business brief, not a checked-in file parse.

---

## 3. User personas and permissions

| Persona            | Role                                             | Bulk import                                    | Batch AI enrich                                                                                           | Approve protected AI changes | Outreach send     |
| ------------------ | ------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------- |
| Owner              | `profiles.role = 'owner'`, `status = 'approved'` | Yes                                            | Yes                                                                                                       | Yes                          | Out of scope here |
| Rep                | approved `rep`                                   | No (read import report and resulting accounts) | No for starting a batch; may run single-row Verify & Update / Fill Blank on accounts they can already see | No for batch-protected queue | Out of scope      |
| Buyer / unapproved | —                                                | No                                             | No                                                                                                        | No                           | No                |

Rationale: import writes commercial relationship status, identity, and line markers. That is owner work, matching Prospective Lines (`requireApprovedOwnerClient` in `src/lib/agentAuth.ts`). Reps already have directory AI on individual rows; they must not re-import spreadsheets.

All API handlers use the caller JWT + `is_approved_staff()` / `is_approved_owner()` RPC. No service-role bypass for domain CRUD. Secrets (`AI_GATEWAY_API_KEY`) stay server-side.

---

## 4. Product decisions

These are decided for the first implementation. Open items are in §24.

1. **Reuse AI Ingest, do not fork it.** Bulk enrichment calls the same research + fill-blank + apply helpers, with a job runner around them.
2. **First source type is `historical_customer` for OGR WA/OR.** Faire, ZoomInfo, research prospect, and Other are specified so the UI and batch metadata can carry them; only historical customer is built in phase 1.
3. **Do not fabricate orders, purchase dates, conversion dates, revenue, or productivity class.**
4. **Do not mark `activity_status = active` without a qualifying non-draft order in the previous 365 days.**
5. **Verified past purchaser is `relationship_status = opened`**, not `prospect`.
6. **Keep the three concepts separate:** commercial relationship, order activity, reactivation/outreach state. Do not overload `relationship_status` with dormancy or unresponsive.
7. **OGR dual-write stays consistent:** for this cohort write `prospects.account_status = 'active_account'` **and** RLA `relationship_status = 'opened'` so the existing trigger cannot demote the line account on the next notes/fit update.
8. **Identity from the workbook is treated as staff-verified import identity**, not buyer-verified. Set `verification_status = 'import_verified'` (or equivalent non-`/^verified$/i` token plus an import protection flag — see §17). AI must not overwrite name/address/city/territory/postal/contact/email supplied by the file unless the owner confirms.
9. **`buyer_verified` stays false** unless a later buyer confirmation exists. Spreadsheet contact names are not proof of current buyer identity.
10. **Enrichment default for this cohort is fill-blanks, not Verify & Update.** Historical addresses must not be replaced by a similarly named store the model found in another city.
11. **No emails, Gmail drafts, or outreach sends** from import or enrichment.
12. **Idempotency is mandatory.** Same file + same line + same source type + same normalized row fingerprint → no new retailer, RLA, contact, note, or enrich job.
13. **Lookalike discovery is explicitly out of the first build.** Imported customers are seeds only.
14. **Eagle Peak ZoomInfo import is specified as a source type, not implemented.**
15. **Directory placement:** opened historical customers appear under **Active Accounts**, not Prospects, with a **Reactivation** filter. They are not current producing accounts until activity says so.

---

## 5. Customer status and reactivation model

### 5.1 Three separate concepts

| Concept                            | System of record                                                                                         | Mutated by                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Historical commercial relationship | `retailer_line_accounts.relationship_status` (+ OGR `prospects.account_status` while dual-write remains) | Import, conversion, demotion, unresponsive cadence (owner) |
| Recent ordering activity           | View `retailer_line_account_activity` (not a stored column)                                              | Real `orders` rows only                                    |
| Reactivation / outreach state      | Line-account **markers** (see §17), not relationship status                                              | Import defaults, owner cadence, new qualifying order       |

Do not erase purchase history because a buyer does not reply.

### 5.2 Exact mapping for the OGR WA/OR cohort

Source files do not contain purchase dates or order values. Treat the workbook as **attestation of past purchase**, not as an order ledger.

| Field                                       | Value                                                                                                       | Why                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| RLA `relationship_status`                   | `opened`                                                                                                    | Verified past purchaser, not a never-sold prospect                           |
| `prospects.account_status` (OGR dual-write) | `active_account`                                                                                            | Keeps trigger parity; overlay already maps `opened` → `active_account`       |
| `converted_at`                              | **null**                                                                                                    | Do not invent a conversion timestamp                                         |
| `initial_order_date`                        | **null**                                                                                                    | File has no order date                                                       |
| `orders` rows                               | **none created**                                                                                            | Do not fabricate orders                                                      |
| Activity (extended view)                    | `dormant`                                                                                                   | Past purchaser, no qualifying order in the last 12 months can be established |
| Productivity                                | `unclassified`                                                                                              | Insufficient order history; view already returns this                        |
| Marker `historical_purchaser`               | set                                                                                                         | Line-specific commercial fact                                                |
| Marker `reactivation_candidate`             | set                                                                                                         | Outreach state for this cohort                                               |
| Marker `reactivation_unresponsive`          | unset                                                                                                       | Cadence has not run                                                          |
| `existing_ogr`                              | `'yes'`                                                                                                     | They were OGR customers; merchandising fact, distinct from markers           |
| `qualification_status`                      | `'reactivation'`                                                                                            | Planning label; does not replace markers                                     |
| `next_action`                               | owner-confirmed default, e.g. “Confirm operating status and current buyer; do not treat as a new prospect.” | Import may seed; AI fill-blanks must not overwrite with BC travel templates  |

### 5.3 Activity view correction (required)

Today (`supabase/schema.sql`):

- no non-draft orders → `never_ordered`
- order in last 365 days → `active`
- older orders only → `dormant`

`never_ordered` is wrong for a verified historical purchaser with no imported ledger. **Do not store `activity_status`.** Extend the view:

1. Qualifying order in last 365 days → `active` (unchanged).
2. Else if any qualifying order exists → `dormant` (unchanged).
3. Else if line-account marker `historical_purchaser` is present → `dormant`.
4. Else → `never_ordered`.

Productivity view stays `unclassified` until thresholds and order history exist.

### 5.4 Later state transitions (not part of import)

| Event                                                    | Relationship                                                        | Activity                                | Markers                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Qualifying order logged in last 12 months                | `opened`                                                            | `active` (from orders)                  | Clear `reactivation_candidate` and `reactivation_unresponsive`; keep `historical_purchaser`  |
| No response after the owner-defined reactivation cadence | **`inactive`**                                                      | still `dormant` unless an order appears | Keep `historical_purchaser`; set `reactivation_unresponsive`; clear `reactivation_candidate` |
| Owner restarts outreach                                  | stay `inactive` or return to `opened` only by explicit owner action | unchanged                               | Move unresponsive → candidate; never drop `historical_purchaser`                             |
| True never-purchased lookalike                           | `prospect`                                                          | `never_ordered`                         | **no** `historical_purchaser`                                                                |

**Decision:** after the defined cadence with no response, `relationship_status` **should become `inactive`**. That records a paused commercial relationship. It must **not** become `prospect`. `historical_purchaser` stays.

Cadence length (touches / days) is an unresolved product number (§24). Import does not start a cadence clock automatically beyond setting `reactivation_candidate`.

### 5.5 How they appear in existing views

| View                                   | Default membership for this cohort            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prospects**                          | **Excluded**                                  | Prospects is the never-purchased / not-yet-opened pipeline. `account_status !== 'active_account'` today also includes `inactive`, which would mix unresponsive historical customers with research prospects. Phase 1: keep opened historicals out. Follow-up: Prospects default should be `relationship_status in ('prospect','qualified')` only, so later `inactive` historicals still do not look like new prospects. |
| **Active Accounts**                    | **Included**                                  | Because `opened` / `active_account`. Sub-label: not “producing” until activity is `active`. Show $0 lifetime value when no orders exist; do not hide the row.                                                                                                                                                                                                                                                           |
| **Reactivation filter / view**         | **Included**                                  | Recommended additive filter on Active Accounts (and later a dedicated tab if volume grows): `historical_purchaser` AND (`reactivation_candidate` OR `reactivation_unresponsive`). Columns: state, territory, last touch (null at import), activity=`dormant`.                                                                                                                                                           |
| Outreach lead lists / nightly briefing | **Excluded until an explicit later decision** | Current briefing selects `relationship_status = 'opened'` (`src/lib/outreachBriefing.ts`). Importing 24 opened dormant accounts must **not** dump them into automated outreach. Gate: require `reactivation_candidate` **and** an owner “ready for outreach” batch flag, still with **no send** in this feature.                                                                                                        |

Inactive-after-cadence accounts: **Reactivation (unresponsive)** filter, not the default Prospects list.

---

## 6. Import sources and source-specific defaults

Owner selects **represented sales line** first, then **source type**. Defaults below assume OGR. Eagle Peak / Big Fish reuse the same machine; they do not reuse OGR `existing_ogr` semantics.

| Source type         | Code                  | Relationship                                                                                                                       | Activity intent                | Markers                                          | `existing_ogr` (OGR only) | AI default                   | First build                                                                         |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------ | ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Historical customer | `historical_customer` | `opened`                                                                                                                           | dormant via marker + no orders | `historical_purchaser`, `reactivation_candidate` | `yes`                     | fill-blanks                  | **Yes**                                                                             |
| Faire customer      | `faire_customer`      | `opened` if attested purchaser; else owner must confirm. For the supplied Faire workbook of past OGR customers: same as historical | same                           | same + `source:faire` in batch metadata          | `yes` when historical     | fill-blanks                  | Mapping yes; can import in same OGR cohort if classified as historical/Faire hybrid |
| ZoomInfo lead       | `zoominfo_lead`       | `prospect`                                                                                                                         | `never_ordered`                | none of the historical markers                   | `unknown` / null          | fill-blanks                  | **No** (schema/UI ready only)                                                       |
| Research prospect   | `research_prospect`   | `prospect`                                                                                                                         | `never_ordered`                | none                                             | `Unknown`                 | fill-blanks or create-enrich | **No**                                                                              |
| Other               | `other`               | owner-selected on confirm step; default `prospect`                                                                                 | from relationship              | owner-selected                                   | owner-selected            | fill-blanks                  | **No**                                                                              |

**Faire + historical combined cohort:** the two supplied workbooks describe the same verified OGR customer set (one overlapping legal name). Product behavior: one import program, two source files, source type per file, merge on normalized name + geography. Do not create two retailers for Peninsula Pharmacies.

---

## 7. End-to-end user flow

1. Owner opens **Import accounts** (owner-only; Prospects / Active Accounts toolbar, OGR line selected).
2. Select represented sales line (current line preselected; changeable among represented lines).
3. Select source type (`historical_customer` for this cohort).
4. Upload `.xlsx` or `.csv` (one sheet / first sheet).
5. System detects headers and proposes column map from aliases (§9).
6. Owner adjusts mapping. Unmapped optional columns stay empty; required mapped fields must cover business name.
7. Normalize names, addresses, states, ZIP/postal, contacts, emails.
8. Detect in-file duplicates; collapse or skip with preview.
9. Match against existing retailers and prior import fingerprints (deterministic).
10. Preview proposed retailers + OGR line accounts with warnings.
11. Confirm classification defaults (shown, editable by owner before commit): relationship, markers, existing_ogr, next_action, whether to run AI after import.
12. Commit as a batch (all-or-nothing per row; failed rows stay `needs_review` without creating siblings).
13. Optionally run AI fill-blanks on the batch (all or selected).
14. Review uncertain / protected AI proposals; approve or reject.
15. Open the import report. No outreach is sent.

---

## 8. Screen / state descriptions

### 8.1 Entry

- Button: **Import accounts** next to **+ Add via AI**, visible to owners only.
- If current line is BKG / declined / terminated: disable with the same staff-AI error copy.
- Deep link: `/app?tab=prospects&import=1` is sufficient; no new public route required.

### 8.2 Wizard states

| State       | Purpose                                            | Primary actions                 |
| ----------- | -------------------------------------------------- | ------------------------------- |
| `select`    | Line + source type + file                          | Continue                        |
| `map`       | Header row, column mapping, sample values          | Back / Continue                 |
| `normalize` | Parsed rows, in-file dupes, parse warnings         | Back / Continue                 |
| `preview`   | Proposed retailers / RLAs / contacts, match status | Back / Confirm defaults         |
| `confirm`   | Classification defaults, “run AI after import”     | Start import                    |
| `importing` | Progress counts; cancel remaining row commits      | Cancel remaining                |
| `imported`  | Report; start or skip enrichment                   | Enrich all / selected / Done    |
| `enriching` | Per-row AI progress, failures, cancel remaining    | Retry failed / Cancel remaining |
| `review`    | Uncertain matches + protected field diffs          | Approve / reject / skip         |
| `complete`  | Final report, link to Reactivation filter          | Close                           |

Closing the wizard does not delete a committed batch. Enrichment can be resumed from **Import history**.

### 8.3 Preview row statuses

- `create_retailer` — new identity + new OGR RLA
- `link_existing` — existing retailer, create or update OGR RLA
- `update_rla` — OGR RLA exists; apply markers / blanks only
- `in_file_duplicate` — collapsed into the surviving row
- `prior_import_skip` — fingerprint already imported for this line
- `needs_review` — ambiguous match, failed address parse, missing state, etc.
- `blocked` — validation error; will not import

### 8.4 Counts (always visible from preview onward)

- Uploaded rows
- Unique businesses
- Duplicate spreadsheet rows
- Existing records linked
- New retailers created
- Line accounts created or updated
- Contacts created
- Rows requiring review
- AI enrichment completed
- AI enrichment failed
- Records ready for outreach (definition: imported, `reactivation_candidate`, not `needs_review`, enrichment not failed; **ready ≠ emailed**)

---

## 9. Spreadsheet mapping rules

The two workbooks were **not present in this repository** at design time. Mapping uses the business brief. Implementation must detect actual headers and keep aliases, not hard-code one spelling.

### 9.1 Historical workbook

`OGR Washington and Oregon acounts (1).xlsx`  
Expected payload: business name, former rep code, shipping address.

| Source (aliases)                                          | Target                                                    | Rule                                                                                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Business name / Account / Store / Customer / Ship To Name | `prospects.name`                                          | Required. Trim, collapse whitespace, preserve legal punctuation. Normalized form used only for matching.                                                                 |
| Ship To / Shipping address / Address                      | parse → street, city, state, ZIP                          | See §9.4. Street → `prospects.address`. City → `prospects.city`. State → `territory_id` via `territoryCodeFromProvince`. ZIP → new `prospects.postal_code` (blank-safe). |
| Former rep / Rep / Rep code                               | import row `former_rep_code`; copy into RLA `source_note` | Do not invent a CRM user. Store as text provenance.                                                                                                                      |
| (none)                                                    | store type, contact, email, phone, website                | Leave blank for AI fill-blanks.                                                                                                                                          |
| Filename                                                  | batch `source_filename`                                   | Exact uploaded name.                                                                                                                                                     |
| Source type                                               | `historical_customer`                                     | From wizard, not the sheet.                                                                                                                                              |

Classification (not from columns): relationship `opened`, activity dormant via marker, productivity `unclassified`, markers `historical_purchaser` + `reactivation_candidate`, `existing_ogr = yes`.

Profile note seed (staff, not AI):  
`Sourced: Listed as a verified past OGR customer in {filename}. Former rep code: {code or "not provided"}. Shipping address from file. No purchase date or order value was supplied.`  
`Inference: Treat as dormant reactivation candidate until a qualifying order is logged. Do not assume current buyer, phone, or website.`

### 9.2 Faire workbook

`Wa & Oregon Faire Accounts.xlsx`  
Expected payload: business name, address, store type, contact name, limited email.

| Source (aliases)                          | Target                                      | Rule                                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business / Shop / Retailer / Account name | `prospects.name`                            | Required.                                                                                                                                                                                 |
| Address / Ship To / Street                | parse as §9.4                               | Same as historical.                                                                                                                                                                       |
| Store type / Type / Category / Channel    | `retail_category` (raw) + mapped `category` | Map through `mapRetailCategoryToChannel` / `crmRetailTaxonomy`. Unmapped → `other` + `needs_review` if confidence is low. **Do not run Okanagan fit scoring as a requirement to import.** |
| Contact / Buyer / Name                    | `account_contacts.full_name` role `buyer`   | Create only if non-empty after normalize. `is_primary` if this is the first contact. **Not** `buyer_verified`.                                                                            |
| Email                                     | `account_contacts.email`                    | Lowercase; validate shape; blank if missing. Limited coverage is expected.                                                                                                                |
| Filename / source type                    | batch metadata                              | `faire_customer` (or `historical_customer` if owner classifies the Faire file as the same attested purchaser set — confirm step).                                                         |

Same commercial defaults as historical when the owner keeps “verified past purchaser”. If a future Faire file is only a marketplace lead list, source type ZoomInfo/research rules apply instead.

### 9.3 Shared CRM fields both files must set

| Field                               | Rule                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prospects.region`                  | Use `Oregon` or `Washington` from parsed state. **Do not** force Okanagan/Shuswap/Island. `region` is unconstrained text in the DB.                                                                                |
| `primary_district` / `subterritory` | Leave null or `Needs mapping`. Do not run `mapBcTerritory` on US cities.                                                                                                                                           |
| `territory_id`                      | `or` or `wa`. If parse fails → `needs_review`, do **not** default to BC.                                                                                                                                           |
| `sales_line_territory_id`           | If an active OGR assignment exists for that geo (`OGR_ALLOWED_GEO` includes `or`,`wa`), attach it. Else leave null and flag `territory_assignment_missing` — do not write `non_bc_territory` as a silent dead-end. |
| `source_note`                       | `Import {source_type} batch {batch_id} from {filename}` plus former rep if present.                                                                                                                                |
| `fit`                               | Leave blank at import. Do not invent a 1–10 score. AI fill-blanks may later fill using **US-safe** prompts, not BC district boosts.                                                                                |
| `website` / `phone`                 | Blank unless present in the file.                                                                                                                                                                                  |

### 9.4 Combined `Ship To` parse and manual review

Do not assume parse is correct.

Pipeline:

1. Normalize whitespace, commas, and `USA`/`US`/`United States` suffixes.
2. Try structured parse: street, city, state (name or 2-letter), ZIP/ZIP+4.
3. Accept state only if it maps to `or` or `wa` for this cohort (other US states → review, still do not default BC).
4. If ZIP present without state, infer state from ZIP **only as a warning suggestion**, never auto-commit.
5. If a single line cannot be split with high confidence (missing comma, city glued to street, two addresses, PO Box + street, multi-location companies), mark `address_parse_uncertain`.
6. Preview shows **raw Ship To** next to **parsed parts**. Owner can edit parsed fields before import.
7. On import, persist both `raw_address_text` (batch row) and structured columns. AI must treat structured import fields as protected identity.

Peninsula Pharmacies-style rows with the same name and two similar Ship To strings: if parsed city/state/ZIP match after normalize, collapse; if they disagree, `needs_review` (possible two locations).

### 9.5 Peninsula Pharmacies in-file duplicate

Workbook fact: 25 rows, 24 unique businesses, duplicate `PENINSULA PHARMACIES, INC`.

Preview behavior:

1. Normalize names (`normalizeProspectName`: lowercase, `&`→`and`, punctuation stripped).
2. Group by normalized name + normalized state + normalized ZIP (ZIP optional).
3. Show a **Duplicate spreadsheet rows: 1** chip and a group: “2 rows → 1 business”.
4. Survivor = first data row unless the second has strictly more populated fields (contact/email/store type); then merge non-empty fields into the survivor **without overwriting non-empty survivor values**.
5. The other row status = `in_file_duplicate` / skip. It is not imported as a second retailer.
6. Report: uploaded 25, unique 24, duplicate spreadsheet rows 1.

If a later file re-uploads Peninsula Pharmacies, fingerprint match → `prior_import_skip` or `update_rla` (markers only), never a third identity.

---

## 10. Validation and duplicate behavior

### 10.1 Row validation

| Check                                                      | Severity                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Empty business name                                        | blocked                                                         |
| Unparseable address with no city and no state              | needs_review                                                    |
| State not OR/WA for this cohort                            | needs_review (do not coerce to BC)                              |
| Email present but invalid                                  | needs_review; do not import the email                           |
| Contact name without any other identity                    | allowed                                                         |
| Store type unmapped                                        | warning; category `other`                                       |
| Name matches an existing CRM retailer in another territory | needs_review (possible chain / collision with BC research book) |
| Name matches existing OGR RLA                              | link / update, not create                                       |

Do not compare this cohort to the ~612 BC research rows as a project. Only **deterministic collision protection** when a normalized name (+ city/state when present) hits an existing retailer.

### 10.2 In-file duplicates

Fingerprint: `normalizeProspectName(name) + '|' + stateCode + '|' + postal5`.

Same fingerprint → collapse as §9.5. Same name, different state → two businesses. Same name, missing both state and ZIP → `needs_review` rather than auto-collapse.

### 10.3 Existing CRM and prior-import protection

Match order (stop at first high-confidence hit):

1. **Prior import fingerprint** for this `sales_line_id` + source type (idempotent skip/update).
2. **`external_id`** if the sheet mapped one (not expected for these files).
3. Normalized name + territory code (or city).
4. Normalized name only → if exactly one CRM hit in OR/WA, link; if any hit in BC or multiple hits, `needs_review`.
5. Email exact match on `account_contacts` → link that account, `needs_review` if names disagree.

On `link_existing`:

- Do not overwrite verified / import-protected identity.
- Fill blanks (address, city, postal, website) from the sheet.
- Ensure OGR RLA exists; set relationship/markers for historical source type **only if** the existing RLA is `prospect`/`qualified` or already `opened`. If existing is `terminated`, `needs_review`. If existing is `inactive` with `historical_purchaser`, do not silently reopen; `needs_review`.
- Do not attach a second primary contact; add a non-primary contact if the name/email is new.

**Never create a second OGR operational RLA** (partial unique index already forbids it).

---

## 11. Import-batch behavior

### 11.1 Batch record

Each upload commit creates `account_import_batches`:

- `id`, `sales_line_id`, `source_type`, `source_filename`, `content_sha256`
- `created_by`, timestamps
- `status`: `previewed | committed | enriching | enrichment_partial | completed | cancelled`
- `classification_snapshot` jsonb (the confirmed defaults)
- `report` jsonb (the counts)

Rows: `account_import_rows` with row number, raw payload, normalized payload, fingerprint, match decision, `retailer_id`, `retailer_line_account_id`, `account_contact_id`, `status`, `error`.

Unique: `(sales_line_id, fingerprint)` where status in imported/skipped-duplicate **or** unique `(batch_id, row_number)`.

Re-uploading the same file (same hash) for the same line: offer **Resume / view report** instead of a second commit. Re-uploading with the same rows but a new filename still hits fingerprints.

### 11.2 Commit semantics

- Preview writes **no** retailers.
- Commit is row-idempotent. A retried commit of the same batch id does not duplicate.
- Per row: insert/update retailer → insert/update RLA → optional contact → field-change rows with `source = 'import'` → import-row status `imported`.
- Do not write `prospect_updates` noise beyond one batch summary note on the RLA.
- Do not write `orders`, `converted_at`, or `initial_order_date`.
- Do not enqueue outreach.

### 11.3 Idempotent enrichment jobs

`account_enrichment_jobs`: `(batch_id, retailer_id, mode)` unique for non-cancelled jobs. Re-run of “enrich all” skips rows already `completed` unless the owner chooses **Re-run failed only** or **Re-research selected**.

---

## 12. AI enrichment workflow

### 12.1 Intent

Extend Fill Blank Fields / Verify & Update. Default for historical import: **fill-blanks**.

Owner can:

- Select a committed batch (or a subset of rows).
- Run profile search for all, selected, or failed-only.
- Fill missing website, phone, email, store type/taxonomy, social/location details **when publicly evidenced**.
- Generate a concise profile note with sourced vs inferred sections (§13).
- See progress (n/m), per-row success/fail, cancel remaining.
- Retry failed rows.
- Review uncertain matches (wrong city, chain homonym, directory-only evidence).
- Skip verified / import-protected fields.
- Record source URLs, timestamps, confidence, model/provider on each proposed change.

### 12.2 Engine

For each selected row, server job:

1. `gateStaffAiContext({ kind: 'account', salesLineId, retailerLineAccountId, prospectId })`.
2. Prefer `inferFillBlankProspectFields` with a **US/OGR persona override**: do not require BC regions; pass city/state; set `lineCode: 'ogr'` for taxonomy guidance but **disable `mapBcTerritory` scoring boosts** (treat like non-BC: district “Needs mapping”).
3. Optional second pass for website/phone only via `researchCompany({ fillBlanksFocus: true, city, persona })`.
4. Persist research brief + evidence JSON on the enrichment job row (missing today).
5. Auto-apply only **blank, unprotected, high-confidence** fields (official website + matching city/state).
6. Queue everything else as **proposed** `retailer_field_changes` with a new `status` of `pending` (§17), not immediate apply.

Do not use create-path `enrichedProspectSchema` as-is: it forces BC `region` and overwrites name/city.

### 12.3 Uncertain match review

Flag for human review when:

- Researched city/state disagrees with import identity.
- Multiple official sites.
- Evidence is directory-only (`directoryOnly`).
- Name match is a chain with other CRM rows.
- Model returns address/phone but confidence is low or brief says “not found”.

Owner actions: apply, reject, or keep blank. Rejected proposals stay in field-changes as `rejected`.

### 12.4 What AI may fill vs must not invent

| Allowed if evidenced                                                                                                            | Forbidden                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website, phone, published email, store type, taxonomy arrays, social URLs (store in notes or future columns), city confirmation | Buyer identity, unpublished emails, purchase history, commercial terms, order dates, `existing_ogr` changes, `buyer_verified`, fabricated addresses |

### 12.5 Progress, retry, cancel

- Queue is server-side (not 20 sequential browser fetches).
- Cancel remaining: mark queued jobs `cancelled`; in-flight Gateway call may finish but must not apply after cancel.
- Retry failed: new job row or reset `failed` → `queued`; do not duplicate completed applies.
- Rate limit: bulk jobs use a **job-level** budget, not `checkAgentRateLimit` 20/10 min. Still cap concurrency (recommend 1–2 parallel Gateway calls) to control spend.

Single-row Verify & Update remains available on the account after import.

---

## 13. Profile-note and provenance rules

### 13.1 Note structure

Write AI/staff profile notes to **RLA `notes`** (and OGR-mirrored `prospects.notes` while dual-write remains), **not** into `fit` as `"7/10 — …"`.

Required sections:

```
Sourced
- {fact} — {url or "import file {filename}"} — {date}

Inference
- {judgment explicitly labeled as model or staff inference}

Unknown
- Purchase dates, current buyer, … (omit rather than guess)
```

If a section would be empty, omit it. Never blend sourced and inferred in one unlabeled paragraph.

Import seed note (§9.1) is `source = import`. AI additions append with a timestamped block; they do not delete the import block.

`fit` / `fit_score` remain optional planning fields. Historical import leaves them null until fill-blanks can score **without inventing BC geography**. Prefer leaving fit blank over a meaningless Okanagan-based score.

### 13.2 Provenance on field changes

Each applied or pending change stores:

- `source`: `import` | `ai` | `user`
- `actor_id`
- `sales_line_id`, `retailer_line_account_id`
- old/new value, `created_at`
- **New:** `provider` (`openai/gpt-4o`), `tool` (`perplexity_search`), `confidence` (0–1 or `high|medium|low`), `source_urls` jsonb, `research_job_id`

Create-via-AI today stores none of this; bulk must not regress.

---

## 14. Lookalike workflow boundary

Verified OGR customers, once enriched, are **seed profiles**. A later workflow may:

1. Analyze recurring traits (store type, product mix, tourism orientation, location, audience, channel, apparel capability).
2. Search for similar **net-new** retailers.
3. Create those hits as OGR **prospects** (`relationship_status = prospect`, activity `never_ordered`).
4. Tag `lookalike_prospect` (or `source_note` / batch `source_type = lookalike`). **Never** copy `historical_purchaser`, `existing_ogr = yes`, or `opened`.
5. Require owner review before insert and before any contact.

Immediate bulk import **stops at seed quality**. It does not search for lookalikes, does not add discovered prospects, and does not email them.

Preserve the distinction in every list: historical customer vs AI-discovered lookalike vs BC research prospect vs ZoomInfo lead.

---

## 15. Error, retry, and cancellation behavior

| Event                      | Behavior                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| File parse error           | Stay on `map`; no batch commit                                                                                 |
| Gateway 5xx / empty brief  | Row `enrichment_failed`; others continue                                                                       |
| 429 / spend cap            | Pause queue; surface retry-after; do not mark remaining as failed until owner cancels                          |
| Ambiguous CRM match        | `needs_review`; no insert                                                                                      |
| Partial row write          | Transaction per row (retailer + RLA + contact + import_row). On failure, leave no orphan retailer for that row |
| Owner cancel during import | Finish current row; remaining stay `queued`/`cancelled`; report partial counts                                 |
| Owner cancel during enrich | Finish in-flight research persist; do not apply after cancel                                                   |
| Duplicate file             | Resume existing batch                                                                                          |
| Dual-write trigger         | Import writes both `account_status` and RLA so a later fit/notes update cannot demote `opened` → `prospect`    |

Existing Add via AI orphan (prospect inserted, contact failed) must not be copied. Bulk uses a single row transaction (Postgres via RLS-safe RPCs or ordered writes with compensating delete only if the same batch row is still `importing` — prefer one RPC).

---

## 16. Audit / history requirements

- Import batch + per-row raw and normalized payloads retained.
- `retailer_field_changes` for every imported identity field and every AI apply/reject.
- Enrichment job stores brief, evidence, model, timestamps, outcome.
- Actor is the owner user id.
- No silent service-role mutations.
- Import history screen: filename, line, source type, counts, link to Reactivation filter (`territory=or,wa` + markers).
- Do not log spreadsheet emails into client-side analytics.

---

## 17. Data and schema implications

No migration is applied by this document. Later implementation should stay additive and must not rewrite historical migrations or redesign multi-line architecture.

### 17.1 Recommended new tables

**`account_import_batches`** — §11.1.  
**`account_import_rows`** — raw/normalized JSON, fingerprint, statuses, FKs.  
**`account_enrichment_jobs`** — batch/retailer/mode, status, brief, evidence, error, provider.

RLS: approved staff read; owner write. Same `is_approved_staff` / owner RPC pattern as other staff tables.

### 17.2 Recommended additive columns

On `retailer_line_accounts`:

- `line_account_markers text[] not null default '{}'`  
  Allowed values for v1: `historical_purchaser`, `reactivation_candidate`, `reactivation_unresponsive`.  
  Do not put these in `relationship_status`.

On `prospects` (identity, shared across lines):

- `postal_code text` — nullable. Needed for WA/OR matching and Ship To parse. Wholesale `postal_code` is a different table; do not reuse it.

On `retailer_field_changes`:

- `status text not null default 'applied'` check (`pending | applied | rejected | superseded`)
- `confidence text` or numeric
- `provider text`
- `source_urls jsonb`
- `enrichment_job_id uuid`

Pending status is how bulk routes protected/uncertain AI edits through the **existing** table instead of applying first and logging after. Single-row Verify & Update can keep today’s apply-then-log behavior until it is switched to the same queue.

### 17.3 View change

Extend `retailer_line_account_activity` with the `historical_purchaser` branch in §5.3. Still not a stored activity column.

### 17.4 Dual-write and 9C

Phase 9C (`plan/multi-line-phase9c-drop-sync-triggers.sql`) is not the live schema: insert/update sync triggers still exist. Until those triggers are dropped, OGR import **must** set `prospects.account_status` in lockstep with RLA `relationship_status`. Do not wait on 9C to import.

### 17.5 What not to add

- Stored `activity_status` / `productivity_class`
- Fake `orders` for historical purchases
- A second retailer table
- A parallel enrichment microservice
- Lookalike result tables in phase 1

---

## 18. Security and authorization requirements

- Owner-only commit and batch enrich start (`requireApprovedOwnerClient`).
- All handlers `export const prerender = false`.
- Caller JWT + RLS; no `SUPABASE_SERVICE_ROLE_KEY` for retailer writes unless an existing documented exception is reused (do not add a new one).
- `FEATURE_MULTI_LINE_AI` on → every enrich job has `sales_line_id` + matching RLA; never default to OGR.
- Spreadsheet contents are staff-confidential (emails, addresses). Do not put file bytes in client logs.
- AI Gateway key remains server-only.
- Bulk enrich concurrency/spend cap distinct from `/api/agent` chat window.
- Import does not grant public wholesale access and does not invite buyer users.

---

## 19. Success metrics

Phase 1 is successful when the owner can import the two OGR WA/OR files and enrich them without corrupting the BC book or inventing commerce.

Quantitative:

- 25 uploaded rows → 24 unique businesses committed (or 24 plus documented review holds).
- 0 duplicate retailers for Peninsula Pharmacies.
- 0 new `orders` rows from import.
- 0 rows with `relationship_status = prospect` for this historical cohort.
- 0 rows with fabricated `converted_at` / `initial_order_date`.
- 0 rows defaulted to BC territory because state parse failed (those must be `needs_review`).
- Re-upload of the same files → 0 additional retailers, RLAs, contacts, notes, or enrich jobs.
- AI does not change import-protected name/address/postal when fill-blanks runs.
- Enrichment failures are retryable without duplicate notes.

Qualitative:

- Accounts appear in Active Accounts + Reactivation filter, not in the Prospects pipeline.
- Profile notes distinguish sourced vs inference.
- Owner can cancel remaining enrich and retry failures.

---

## 20. Acceptance criteria

1. Owner, with OGR selected, can upload XLSX/CSV, map columns, preview, and commit a batch.
2. Historical defaults in §5.2 are applied unless the owner changes them on the confirm step.
3. Ship To parse shows raw vs structured fields; uncertain rows require review.
4. In-file Peninsula Pharmacies duplicate is collapsed or skipped in preview.
5. Deterministic fingerprints prevent duplicate identity on second upload.
6. Existing BC research retailers are not bulk-updated except on explicit high-confidence same-store match (`needs_review` otherwise).
7. Batch AI fill-blanks uses existing research helpers, records provenance, skips protected fields, supports retry/cancel.
8. Uncertain AI identity changes go through pending `retailer_field_changes`, not silent overwrite.
9. No outreach send, no lookalike search, no Eagle Peak ZoomInfo import in phase 1.
10. Directory: 24 opened-dormant OGR accounts filterable as reactivation candidates; Prospects count does not increase by 24 never-purchased leads.

---

## 21. Explicit non-goals

- Implementing this feature in the same change as the document
- Importing either workbook into hosted Supabase
- Sending email or starting outreach cadences
- Fabricating purchase dates, orders, conversion dates, revenue, or productivity classes
- Marking activity `active` without qualifying order evidence
- Demoting historical customers to never-purchased prospects
- Overwriting verified or buyer-verified data
- Redesigning the multi-line architecture
- Building the lookalike engine
- Beginning the Eagle Peak / ZoomInfo import
- Rewriting historical migrations
- Replacing Add via AI for one-off name search
- Comparing the WA/OR cohort to the ~612 BC research records as a matching project

---

## 22. Recommended implementation phases

These are implementation slices of **this** design, not a plan to write another plan.

| Phase                                | Deliverable                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **A — Schema and classification**    | Markers, postal_code, import/enrich tables, field-change pending status, activity-view historical branch. No UI.      |
| **B — Upload, map, preview, commit** | Owner wizard for OGR historical/Faire files; idempotent batch; no AI. Includes Peninsula collapse and Ship To review. |
| **C — Directory presentation**       | Reactivation filter on Active Accounts; Prospects exclusion; territory chips for OR/WA.                               |
| **D — Batch AI fill-blanks**         | Job runner reusing `researchCompany` / fill-blank helpers; progress, retry, cancel; persist briefs.                   |
| **E — Protected review**             | Pending `retailer_field_changes` UI (approve/reject) for uncertain and protected diffs.                               |
| **F — Later, separate**              | Lookalike discovery; ZoomInfo/Eagle Peak source type; unresponsive cadence automation; outreach eligibility.          |

Phase B can ship value without D/E. Do not start F in the same effort as A–E.

---

## 23. Repository areas likely affected during later implementation

| Area                      | Paths                                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema                    | `supabase/schema.sql`, new additive migration under `supabase/migrations/` (do not edit `20260804120000_*` or Phase 1–4 multi-line files)                                                                        |
| Types                     | `src/types/database.ts`                                                                                                                                                                                          |
| Import domain             | new `src/lib/accountImport/` (parse, map, fingerprint, preview, commit)                                                                                                                                          |
| Enrich jobs               | `src/lib/fillBlankProspectFields.ts`, `src/lib/updateProspectResearch.ts`, `src/lib/companyWebResearch.ts`, `src/lib/createEnrichedProspect.ts` (US region schema; **stop OGR silent default** on new bulk APIs) |
| Field changes             | `src/lib/retailerFieldChanges.ts`                                                                                                                                                                                |
| Line accounts / directory | `src/lib/retailerLineAccounts.ts`, `src/lib/prospects.ts`, `src/lib/ogrCommercial.ts`, `src/lib/salesLineTerritories.ts`, `src/lib/territories.ts`                                                               |
| Activity view consumers   | any future UI reading `retailer_line_account_activity`                                                                                                                                                           |
| APIs                      | new `src/pages/api/staff/account-import/*`, enrich-batch routes; `prerender = false`; owner gate                                                                                                                 |
| UI                        | `ProspectsTab.tsx`, `ActiveAccountsTab.tsx`, new wizard + import history + pending-change review; reuse `AiUpdateResearchModal` patterns / `RetailerDirectory`                                                   |
| Auth                      | `src/lib/agentAuth.ts`, `src/lib/auth.ts`, `src/lib/aiLineContext.ts`                                                                                                                                            |
| Tests                     | `*.test.ts` beside new helpers; do not weaken Phase 4 verified-identity tests                                                                                                                                    |
| Docs                      | this file; optional pointer from `README.md` after implementation                                                                                                                                                |

Catalog ingest (`src/lib/catalogIngest.ts`, `scripts/catalog-ingest/`) is a **pattern only**. BC list import (`src/lib/prospectListImport.ts`, `scripts/import-prospect-list.ts`) is offline SQL generation and must not become the WA/OR runtime path.

---

## 24. Blocking questions versus decisions that may remain unresolved

### Blocking before phase B commit to hosted data

None of these block **writing this design**. They block a **hosted** import later:

1. **Confirm the two workbook header rows** once the files are attached. Aliases in §9 must be verified; `Ship To` may already be split in one file and combined in the other.
2. **OGR `sales_line_territories` for `or` and `wa`:** if no active assignment exists, import still proceeds with `territory_id` set and `sales_line_territory_id` null, flagged for territory admin — confirm that is acceptable vs blocking the batch.
3. **Owner confirmation** that both files are attested past purchasers (Faire file treated as historical, not as never-sold Faire leads).

### Unresolved, with a default if still unset at implementation

| Topic                                                                                       | Default if still open                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Exact reactivation cadence (touches / days) before `inactive` + `reactivation_unresponsive` | Do **not** auto-flip status in v1. Owner marks unresponsive manually. Cadence automation is phase F.                     |
| Whether `qualification_status = 'reactivation'` is displayed in planning columns            | Yes, display; markers remain source of truth                                                                             |
| Social-link storage                                                                         | Append sourced URLs in the profile note until a dedicated column exists                                                  |
| Pending vs immediate apply for single-row Verify & Update                                   | Leave single-row as today’s apply-then-log; bulk uses pending                                                            |
| Outreach eligibility of `reactivation_candidate`                                            | Excluded from automated lead lists until a separate owner flag                                                           |
| Fit scoring for US stores                                                                   | Leave `fit` / `fit_score` blank rather than reuse Okanagan weights                                                       |
| `confirmVerifiedOverwrite` in the existing modal                                            | Unchanged in v1; bulk review UI is explicit approve                                                                      |
| Postal code column vs encoding ZIP in `address`                                             | Prefer additive `postal_code`; if schema freeze, append ZIP to `address` and still persist raw Ship To on the import row |
| Whether inactive historicals later appear in Prospects                                      | Default **no** — tighten Prospects to `prospect`/`qualified` in phase C                                                  |

### Not unresolved

- Historical purchasers are not prospects.
- No fabricated orders.
- No BC default for OR/WA rows.
- No outreach send from this feature.
- No lookalike engine in the first build.

---

## Appendix A — Current-state flow (evidence)

```
Owner/rep → ProspectsTab "+ Add via AI"
  → AddProspectAiModal (name + optional website)
  → enrichProspect (Bearer JWT)
  → POST /api/prospects/enrich
      → requireApprovedStaffClient
      → checkAgentRateLimit(enrich:user)
      → gateStaffAiContext(line_level)
      → createEnrichedProspect
          → researchCompany (gpt-4o + Perplexity)
          → generateObject(enrichedProspectSchema)  // BC regions
          → insert prospects (territory default bc, source_note Add via AI)
          → optional buyer contact if contactName
          → stamp RLA relationship_status = prospect (OGR default if no line id)
      → trigger ensure_ogr_retailer_line_account_from_prospect

Row "Fill Blank Fields" / "Verify & Update"
  → AiUpdateResearchModal
  → preview / apply research-update
  → fill-blank or overwrite core fields
  → skip identity if buyer_verified or verification_status ~= verified
  → insert retailer_field_changes (applied, no pending queue)
```

Bulk import must replace the create-always-prospect / BC-region / no-dedupe / no-batch parts of this path while reusing research, fill-blank merge, verified-identity guards, and field-change logging.
