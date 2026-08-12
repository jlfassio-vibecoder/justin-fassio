# Phase 0 — Foundations

**Epic:** [Agentic Outreach & Lead Qualification](./README.md)  
**Depends on:** Live Product Outreach / System Messages (already shipped)  
**Blocks:** Phases 1–5

---

## Objective

Establish agent-created `product_outreach` **drafts** on the existing System Message ledger, with a distinct origin, persisted intro/closing/subject, explicit CRM + catalog associations, and a review → approve → send transition that reuses the current renderer, Resend transport, and webhook path — without inventing a second mail system.

---

## Why this phase exists

Live code can **send** manual Product Email and log `system_messages` as `status = 'sent'`, `origin = 'manual_product_email'`. The schema already allows `draft` / `queued` / `scheduled`, and foreshadows `scheduled_for` / `automation_run_id`, but:

- origin CHECK allows only `manual_product_email`
- no app path inserts drafts
- intro/closing are not persisted
- agent cannot reuse the ledger without a distinct origin and draft lifecycle

Without Phase 0, later phases have nowhere safe to store reviewable agent outreach.

---

## Current live-code foundation

| Artifact | Location |
|----------|----------|
| Table | `system_messages` — migration `supabase/migrations/20260811120000_system_messages.sql` |
| Events | `system_message_events` — `20260811140000_system_message_events.sql` |
| Webhook RPC | `apply_resend_system_message_event` — `20260811150000_apply_resend_system_message_event.sql` |
| Engagement columns | `20260811160000_product_engagement_alerts.sql`, `20260811170000_engagement_receipt_monotonic.sql` |
| Insert | `insertProductOutreachSystemMessage` in `src/lib/systemMessages.ts` (always `sent` + `manual_product_email`) |
| Constants | `SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH`, `SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL` |
| Render | `renderOgrProductOutreachEmail` — `src/lib/ogrProductOutreachEmail.ts` |
| Card | `renderOgrProductEmailCard` — `src/lib/ogrProductEmailCard.ts` |
| Send | `sendOgrProductOutreachEmail` — `src/lib/sendOgrProductOutreachEmail.ts` |
| Staff API | `POST` `src/pages/api/staff/ogr-product-email.ts` |
| CRM resolve | `resolveProductOutreachCrmAssociation` |
| Sender | `resolveStaffOutreachSenderNames` — `src/lib/ogrProductEmailSender.ts` |
| Types | `src/types/database.ts` (`SystemMessage`, payload lean `{ sku, name, slug, productHref }`) |

**Status allowlist today:** `draft`, `queued`, `scheduled`, `sending`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `failed`, `cancelled`, `complained`.

**Origin allowlist today:** `manual_product_email` only (comment in migration: agent origins deferred).

---

## Required behavior

1. **Create agent drafts** with `message_type = product_outreach`, distinct agent `origin`, `status = 'draft'` (or `queued` when ready for morning review — prefer `draft` until staff opens; `queued` optional for “ready today”).
2. **Widen origin** CHECK to include the agent origin (recommended string: `agent_product_email`).
3. **Persist** `subject`, intro, and closing with the draft (columns or structured `payload` — decision in open questions).
4. **Require** `catalog_item_id`, `prospect_id`, `account_contact_id`, `to_email`, `to_name` on agent drafts (explicit CRM association — no email-only soft match for agent rows).
5. **Draft lifecycle:** create → update (staff/agent edit) → cancel → approve-and-send.
6. **Approve-and-send:** load draft → render with current product presentation + stored intro/closing → `sendOgrProductOutreachEmail` → transition row to `sent` (same ledger row preferred) → webhooks continue as today.
7. **Never** call Resend from agent/draft-create paths.
8. Manual Product Email path remains unchanged (`origin = manual_product_email`).
9. Copy Email Card remains unlogged.

---

## Proposed data / schema changes

| Change | Notes |
|--------|-------|
| Alter `system_messages.origin` CHECK | Add agent origin (e.g. `agent_product_email`) |
| Persist intro + closing | Option A: `payload.introText`, `payload.closingText` (+ existing product fields). Option B: `intro_text` / `closing_text` columns. Prefer one approach; document in migration |
| Optional draft metadata | `payload.channelAllocation?`, `payload.selectionReason?`, `created_by` already via `sent_by` or add `created_by` — decide whether `sent_by` means “author” pre-send or only sender at send time |
| Keep unused columns | `scheduled_for`, `automation_run_id` remain for Phase 5; do not invent sequence tables |

No new mail tables. Do not add a parallel `agent_emails` store.

---

## Server / API changes

| Endpoint / helper | Behavior |
|-------------------|----------|
| Draft create (staff or service) | Validate associations; insert `draft` + agent origin; no Resend |
| Draft update | Edit to/name/subject/intro/closing within limits (`ogrProductEmailLimits.ts`) |
| Draft cancel | `status = cancelled` |
| Draft get / list | By prospect, by “ready today”, by id |
| Approve-and-send | Staff JWT; load draft; re-validate product still publishable; resolve sender from **authenticated** staff; render; Resend; update same row to `sent` + `resend_email_id` + timestamps |
| Existing `POST /api/staff/ogr-product-email` | Remain for manual compose; optionally also accept `systemMessageId` for draft send — or separate `/api/staff/ogr-product-email/send-draft` |

Shared helpers must stay the only Resend entry: `sendOgrProductOutreachEmail`.

---

## UI changes

| Surface | Change |
|---------|--------|
| Minimal Phase 0 | Draft list + open in composer-like review (can be API-complete first) |
| Composer reuse | `OgrProductEmailComposerModal` pattern: load draft fields, Send calls approve-and-send |
| Product Email history | Show origin (manual vs agent); include drafts optionally filtered |

Full Line Sheet draft badge can wait for Phase 2; Phase 0 should not block on badge polish.

---

## Business rules

- Agent draft without `prospect_id` + `account_contact_id` + `catalog_item_id` is rejected.
- Contact must belong to prospect (reuse validation from `resolveProductOutreachCrmAssociation`).
- Subject default remains `Old Guys Rule — {product name}` if blank.
- Client cannot supply `html`, `from`, `signatureName`, or raw `productHref` on send (same as today).
- Approve-and-send uses the **reviewing staff** profile for From/signature (authenticated identity).
- Failed Resend must not leave a false `sent` without `resend_email_id` (align with current error handling).

---

## Reusable existing files / functions

- `src/lib/ogrProductOutreachEmail.ts`
- `src/lib/ogrProductEmailCard.ts`
- `src/lib/sendOgrProductOutreachEmail.ts`
- `src/lib/ogrProductEmailSender.ts`
- `src/lib/ogrProductEmailLimits.ts`
- `src/lib/loadPublishedOgrProductForEmail.ts`
- `src/lib/systemMessages.ts` (`resolveProductOutreachCrmAssociation`, history fetchers)
- `src/pages/api/staff/ogr-product-email.ts` (pattern + guards)
- `src/pages/api/webhooks/resend.ts`, `src/lib/resendWebhook.ts`
- `src/lib/agentAuth.ts` (`requireApprovedStaffClient`)

---

## New files / components likely required

- Migration: widen origin (+ optional intro/closing columns)
- `src/lib/systemMessages.ts` extensions: insert/update draft, send-draft transition
- API routes under `src/pages/api/staff/` for draft CRUD + send-draft
- Tests mirroring `src/test/api/ogr-product-email.test.ts`
- Optional thin UI: draft review sheet

---

## Tests

- Origin CHECK accepts agent origin; rejects unknown
- Draft insert does not call Resend
- Draft requires CRM + catalog IDs
- Intro/closing/subject round-trip on update
- Approve-and-send calls render → Resend mock → row becomes `sent` with same id
- Manual path still stamps `manual_product_email`
- Webhook still applies to agent-origin sends after `sent`
- Reject client `html` / `from` on send-draft

---

## Acceptance criteria

- [ ] Agent `product_outreach` drafts persist on `system_messages` with distinct origin
- [ ] Intro, closing, and subject are durable on the draft
- [ ] Explicit prospect, contact, and catalog associations required
- [ ] Staff can review and send via shared Resend helper; agent never imports Resend
- [ ] Post-send engagement uses existing webhook ledger
- [ ] No second mail/renderer stack introduced
- [ ] Manual Product Email behavior unchanged

---

## Dependencies

- Live System Messages + Product Email stack (shipped)
- No dependency on Phases 1–5

---

## Non-goals

- Autosend, scheduling cron, Warm/Hot, goals, AI copy generation
- Widening `message_type` beyond `product_outreach`
- Gmail draft integration
- Changing product card HTML

---

## Migration / deployment considerations

- Expand origin CHECK in a forward-only migration before deploying agent insert code
- Backfill not required (no historical agent rows)
- Deploy API that only inserts allowed origins after migration is applied
- RLS remains approved-staff; service role only for webhooks (unchanged)

---

## Risks / edge cases

| Risk | Mitigation |
|------|------------|
| Send after product unpublished | Re-run `loadPublishedOgrProductForEmail` at approve time |
| Staff edits product name → subject drift | Recompute default subject on send if staff left default marker, or freeze subject at draft create |
| Duplicate draft for same prospect+product | Soft uniqueness rule in Phase 1; Phase 0 may allow multiples with cancel |
| Persist-only in payload vs columns | Pick one; document for Phase 2 AI writers |
| `sent_by` semantics pre-send | Define: author vs sender; store both if needed in payload |

---

## Completion checklist

- [ ] Origin migration shipped
- [ ] Draft CRUD + send-draft APIs
- [ ] Shared send path verified with mocks
- [ ] Types updated in `src/types/database.ts`
- [ ] Unit/API tests green
- [ ] Manual send regression smoke
- [ ] Phase 1 unblocked
