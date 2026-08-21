# Log Call modal audit

Date: 2026-08-20  
Scope: Pre-split snapshot of call logging UX and data paths.

## Architecture (before)

- Single modal: `src/components/LogCallModal.tsx`
- Mounted once from `RepCommandCenter.tsx`; `openModal(prospect?)` sets `storeId` only — no prospect vs account mode branch
- Title always **Log Prospect Call**; store label **Store prospect**
- **Draft as: Email / Call script** is AI-only (`CallDraftFormat` `'email' | 'script'` in `aiAssistPrefill.ts`). “Script” is a 30–60s talk-track prompt, not a logged contact method
- Outcomes: `CALL_OUTCOMES` in `callOutcomes.ts` (prospecting-heavy)
- Feedback: `OBJECTION_TAGS` in `objectionCatalog.ts` (four prospect-oriented chips)
- Schema already has `calls.follow_up_date`; modal never wrote it
- Convert prompt correctly skipped when `accountStatus` is `active_account` or `inactive`
- Generic `openModal()` without a row defaulted to `prospects[0]`
- Contacts live in `account_contacts` (`fetchContactsForAccount`); calls only store `contact_name` text
- Retail category is `prospects.category` using `PRIMARY_RETAIL_CHANNELS` from `crmRetailTaxonomy.ts`
- After non-conversion save, modal always opened AI Assist and closed

## Gaps

| Issue                                              | Impact                                              |
| -------------------------------------------------- | --------------------------------------------------- |
| Title “Log Prospect Call”                          | Wrong for Active / Inactive accounts                |
| Draft as Call script                               | Confuses AI draft format with logging a call        |
| Shared prospecting outcomes / PMF / objection tags | Wrong vocabulary for opened accounts                |
| No follow-up date UI                               | Outcome “Follow-up Scheduled” had nowhere to land   |
| No previous-calls history in modal                 | Notes and structured fields not visible on reopen   |
| Retail channel read-only                           | Could not correct channel while logging             |
| No contact prefill from CRM                        | Manual re-typing every call                         |
| `prospects[0]` default                             | Generic Log Call could save against the wrong store |

## Target (this change)

True Call Log split: prospect mode vs account mode, previous calls for prospect + sales line, editable retail channel, contact prefill, `follow_up_date`, optional post-save AI (default off), required store selection when opened without context.

## Call ↔ contact limitation (current)

- `calls` stores **`contact_name` (text) only** — there is no `account_contact_id` / `contact_id` column. Historical call rows keep that name snapshot even if the CRM contact is later edited. **No migration** in this pass.
- Log Call may track `selectedContactId` in UI after picking or creating a CRM contact, but **save still persists the formatted name string** via `buildLogCallInsert`.
- **Add new contact** from Log Call reuses `insertAccountContact` (`account_contacts`). Client junction upsert uses **explicit `salesLineId`** + existing RLA only — **no client-created RLA**, no OGR fallback.
- **OGR DB-trigger exception (unchanged):** `account_contacts_sync_ogr_retailer_line_contact` may still ensure an OGR RLA + junction on insert (Phase 1 dual-write).
- Exact email match is a hard duplicate; name-only match warns and allows Create anyway. Primary replace demotes then restores prior primary if create fails.
- Creating a contact never happens from free-text typing alone; Details lists refetch via `contactsReloadToken` → `AccountContactsSection`.
