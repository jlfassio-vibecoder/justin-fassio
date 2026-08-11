# System Messages + Product Outreach History — Epic Roadmap

Branch: `feature/system-messages-product-history-outreach`  
Status: **Plan only — do not implement automation, scheduling, sequences, or AI in this epic.**

This document is the working reference for the epic. Update it when phases ship or scope shifts.

---

## 1. Goals

- Log every **app-sent** Product Email as a **System Message**.
- Show **product-level sent history**: who, when, status (and open/click counts after webhooks).
- Surface System Messages under **Messages → Wholesale**, distinct from inbound wholesale threads and **completely separate from Gmail**.
- Associate sends with CRM **account / contact** when available.
- Add **Resend webhook** tracking: sent / delivered / opened / clicked / bounced / failed (plus complained if Resend emits it).
- Support **open/click counts** and first-occurrence timestamps.
- Make webhook processing **idempotent**.
- Keep the ledger **reusable** for future agent / automation outreach without building those features now.

**Out of scope for this epic**

- Automation runners, AI send paths, sequences, scheduled dispatch jobs.
- Copy Email Card logging (Copy ≠ send — never CRM/System Message activity).
- Gmail send/list changes; live chat changes; inbound wholesale upsert/mapping changes.
- Mass send, Cc, drafts UI, templates.

---

## 2. Current state (audit summary)

| Area                  | Today                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product Email send    | `ProductDetailDrawer` → `OgrProductEmailComposerModal` → `POST /api/staff/ogr-product-email` → Resend; `{ ok: true }` only; **no DB write**; **no Resend id**. |
| Copy Email Card       | Clipboard only — must remain unlogged.                                                                                                                         |
| Resend                | Ad-hoc clients; no webhooks; no `RESEND_WEBHOOK_SECRET`.                                                                                                       |
| Messages → Wholesale  | `message_threads.channel = 'wholesale'` — inbound form threads only.                                                                                           |
| Gmail                 | Separate UI + `gmail_thread_links` — must stay isolated.                                                                                                       |
| Message Center schema | `channel` ∈ `{wholesale, live_chat}`; no product-outreach kind; buyers can read linked threads.                                                                |

Do **not** overload `message_threads` / `messages` for this ledger (buyer RLS risk, wrong shape, inbound pollution). Parallel staff-only tables, same pattern class as `gmail_thread_links`.

---

## 3. Final schema recommendation

### 3.1 Primary ledger: `system_messages`

One row per System Message. Product Email sends are rows with `message_type = 'product_outreach'`.

| Column               | Type                                   | Notes                                                                                                                                |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                 | uuid PK                                |                                                                                                                                      |
| `message_type`       | text not null                          | Check: `'product_outreach'` for now. Extend later (`order_confirmation`, etc.) without new tables.                                   |
| `origin`             | text not null                          | Check: `'manual_product_email'` for current composer path. Future: e.g. `'agent_outreach'`, `'automation'`.                          |
| `status`             | text not null                          | See §3.3. Default `'queued'` at insert-before-send, or `'sent'` if insert-after-success (Phase 1 chooses one path and documents it). |
| `catalog_item_id`    | uuid null FK → `catalog_items`         | Required for `product_outreach`; nullable for future non-product types.                                                              |
| `resend_email_id`    | text null                              | Unique when set. From Resend `data.id`.                                                                                              |
| `to_email`           | text not null                          | Normalized recipient.                                                                                                                |
| `to_name`            | text null                              |                                                                                                                                      |
| `subject`            | text not null default `''`             |                                                                                                                                      |
| `prospect_id`        | integer null FK → `prospects`          | CRM account/prospect when known.                                                                                                     |
| `account_contact_id` | uuid null FK → `account_contacts`      | CRM contact when known.                                                                                                              |
| `sent_by`            | uuid null FK → `auth.users` / profiles | Staff actor for manual sends; null allowed for future system actors if needed.                                                       |
| `queued_at`          | timestamptz null                       | When entered queue (manual send: same moment as create).                                                                             |
| `sent_at`            | timestamptz null                       | When Resend accepted the send.                                                                                                       |
| `delivered_at`       | timestamptz null                       | First delivery event.                                                                                                                |
| `opened_at`          | timestamptz null                       | First open.                                                                                                                          |
| `clicked_at`         | timestamptz null                       | First click.                                                                                                                         |
| `bounced_at`         | timestamptz null                       |                                                                                                                                      |
| `failed_at`          | timestamptz null                       |                                                                                                                                      |
| `complained_at`      | timestamptz null                       | Optional if Resend emits complaint events.                                                                                           |
| `open_count`         | integer not null default 0             |                                                                                                                                      |
| `click_count`        | integer not null default 0             |                                                                                                                                      |
| `last_event_at`      | timestamptz null                       |                                                                                                                                      |
| `failure_reason`     | text null                              | Bounce/fail detail.                                                                                                                  |
| `payload`            | jsonb not null default `{}`            | Lean snapshot: sku, product name, slug, from address, intro/closing truncated or hashed — avoid huge HTML.                           |
| `scheduled_for`      | timestamptz null                       | **Future-safe only** — unused in this epic.                                                                                          |
| `automation_run_id`  | uuid null                              | **Future-safe only** — no FK until automation exists.                                                                                |
| `sequence_id`        | uuid null                              | **Future-safe only** — no FK.                                                                                                        |
| `sequence_step`      | integer null                           | **Future-safe only**.                                                                                                                |
| `created_at`         | timestamptz not null default now()     |                                                                                                                                      |
| `updated_at`         | timestamptz not null default now()     |                                                                                                                                      |

**Indexes (recommended)**

- Unique partial: `resend_email_id` where not null.
- `(message_type, created_at desc)`
- `(catalog_item_id, sent_at desc nulls last)` where `catalog_item_id` not null.
- `(prospect_id, sent_at desc nulls last)` where `prospect_id` not null.
- `(status, created_at desc)`
- `(origin, created_at desc)`
- `(to_email)`

**RLS:** `approved staff full access` only. **No buyer / anon policies.**

**Lightweight future columns:** Keep `scheduled_for`, `automation_run_id`, `sequence_id`, `sequence_step` as nullable columns **without** FKs or check constraints that assume missing tables. Do not add sequence/automation tables in this epic.

### 3.2 Event ledger: `system_message_events`

| Column              | Type                                                   | Notes                                                                                                                                    |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | uuid PK                                                |                                                                                                                                          |
| `system_message_id` | uuid not null FK → `system_messages` on delete cascade |                                                                                                                                          |
| `resend_email_id`   | text null                                              | Denormalized for lookup.                                                                                                                 |
| `resend_event_id`   | text not null **unique**                               | Primary idempotency key (Svix / Resend event id).                                                                                        |
| `event_type`        | text not null                                          | `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.failed`, `email.complained` (align to Resend). |
| `occurred_at`       | timestamptz not null                                   |                                                                                                                                          |
| `payload`           | jsonb not null default `{}`                            | Trimmed raw event.                                                                                                                       |
| `created_at`        | timestamptz not null default now()                     |                                                                                                                                          |

**RLS:** staff-only, same as parent.

Duplicate webhook deliveries: insert conflicts on `resend_event_id` → no-op (do not double-increment open/click).

### 3.3 Status model (send lifecycle, future-compatible)

Allowlist for `system_messages.status`:

| Status      | Meaning                                    | Used in this epic?                                                                                                               |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `draft`     | Composed but not queued                    | Reserved — no draft UI now                                                                                                       |
| `queued`    | Accepted by app, awaiting provider send    | Optional on insert-before-send                                                                                                   |
| `scheduled` | Waiting until `scheduled_for`              | Reserved — no scheduler now                                                                                                      |
| `sending`   | In-flight to Resend                        | Optional thin state                                                                                                              |
| `sent`      | Resend accepted (`resend_email_id` set)    | Yes                                                                                                                              |
| `delivered` | Provider delivered                         | Yes (webhook)                                                                                                                    |
| `opened`    | At least one open (optional rollup status) | Prefer **counters + `opened_at`**; status may stay `delivered` or advance to `opened` — pick one rule in Phase 3 and stick to it |
| `clicked`   | At least one click (same note)             | Prefer counters; do not require exclusive status                                                                                 |
| `bounced`   | Hard/soft bounce terminal-ish              | Yes (webhook)                                                                                                                    |
| `failed`    | Send or provider failure                   | Yes                                                                                                                              |
| `cancelled` | Reserved for future cancel-before-send     | Reserved                                                                                                                         |

**Recommended rule for this epic**

- Persist **delivery outcome** in `status`: `queued` → `sent` → `delivered`, or terminal `bounced` / `failed`.
- Treat **open/click as additive counters + timestamps**, not exclusive status replacements (so “delivered + opened” remains queryable without losing delivered).
- Never regress terminal `bounced` / `failed` back to `delivered` on out-of-order webhooks.
- Do not write `draft` / `scheduled` / `cancelled` until those features exist; columns and check constraint must **allow** them so migrations are not blocking.

### 3.4 What we are not putting in Message Center tables

No new `message_threads.channel`, no new `messages.kind` for product outreach in v1. System Messages are a **parallel ledger**. UI under Wholesale is a **mode switch** (Inbound vs System), not a shared thread query.

### 3.5 Optional secondary: `prospect_updates`

Thin activity note when `prospect_id` is set — **not** required for Phase 1; defer to a later polish phase if Product Drawer + Wholesale System + account section already cover history.

---

## 4. Origin & message_type conventions

| Field          | Current Product Email  | Future (not built now)                          |
| -------------- | ---------------------- | ----------------------------------------------- |
| `message_type` | `product_outreach`     | Other system types as needed                    |
| `origin`       | `manual_product_email` | e.g. `agent_outreach`, `automation`, `sequence` |

All app Product Email sends in this epic set:

```text
message_type = 'product_outreach'
origin       = 'manual_product_email'
```

---

## 5. Future Automation Compatibility

Future AI / automation **must not** call Resend directly from agent tools or scripts.

**Required contract (document now; implement later):**

1. Create or update a `system_messages` row (`status` in `draft` | `queued` | `scheduled`, with `origin` reflecting the actor).
2. A single shared **staff/system send pipeline** (same path Product Email uses after this epic) performs the Resend call, stores `resend_email_id`, and advances status.
3. Webhooks continue to update the same row / `system_message_events`.
4. Agent outreach reuses this ledger so Product history, Wholesale → System, and CRM association stay consistent.

This epic only builds the **manual** path into that ledger. Do not implement agent tools, queues, or schedulers here.

---

## 6. Send path & CRM association (Phase 1)

```
Composer → POST /api/staff/ogr-product-email
  → auth + load product + render
  → optional prospectId / accountContactId (validate contact belongs to prospect)
  → else best-effort match to_email → account_contacts (case-insensitive);
       unique match → set prospect_id + account_contact_id; ambiguous/none → null
  → Resend send; capture data.id
  → insert system_messages (product_outreach / manual_product_email)
  → return { ok: true, systemMessageId, resendEmailId? }
```

**Phase 1 CRM bar (clean, required)**

- Nullable FKs on every insert.
- Optional request body ids with validation.
- Server-side email match helper (no composer autocomplete required yet).
- Soft UI hint in composer is optional; association must work without UI changes beyond success handling.

Copy Email Card remains unlogged.

---

## 7. Webhook architecture (later phase)

```
Resend → POST /api/webhooks/resend
  → verify signature (RESEND_WEBHOOK_SECRET / Svix)
  → resolve system_messages by resend_email_id
  → insert system_message_events (unique resend_event_id)
  → if new: update status / timestamps / open_count / click_count
  → 2xx (including duplicates after verify)
```

- `prerender = false`; signature auth only (no staff JWT).
- Privileged server Supabase client for writes — documented exception; never in islands.
- Env: `RESEND_WEBHOOK_SECRET` in `.env.example`.

---

## 8. UX summary

| Surface                        | Behavior                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Product Drawer**             | Sent history for `catalog_item_id` + `message_type = product_outreach`: recipient, account/contact if linked, when, status, open/click after webhooks. |
| **Messages → Wholesale**       | Keep Wholesale channel. Secondary mode: **Inbound** (existing threads) \| **System** (`system_messages`). System has no reply/mapping UI.              |
| **Account / Prospect drawers** | Product outreach section for `prospect_id`. Separate from Gmail and inbound Message Center.                                                            |
| **Gmail / Realtime**           | Unchanged; System never listed under Email.                                                                                                            |
| **All channels**               | Prefer excluding System rows in v1 (avoid mixing conversation threads with ledger).                                                                    |

---

## 9. Phases (each = one implementable plan)

Each phase should fit a **single focused implementation plan** (schema + code + tests for that slice). Do not combine webhook + full Wholesale UX + drawer history into one plan.

### Phase 1 — Persist System Messages + basic CRM association

**Goal:** Every successful manual Product Email creates a `system_messages` row with Resend id and best-effort CRM links.

**Includes**

- Migration: `system_messages` (+ future-safe nullable columns; status check includes reserved values).
- Capture Resend `data.id` in `sendOgrProductOutreachEmail`.
- Staff API insert after successful send; `message_type` / `origin` as above.
- Optional `prospectId` / `accountContactId` + email match helper.
- Types + unit/API tests; `.env.example` unchanged except if needed later for webhooks.

**Does not include:** webhook route, events table (unless you prefer creating empty events table early — prefer Phase 3), Product Drawer history UI, Wholesale System mode, account drawer section.

**Done when:** DB has a row per successful send with product, recipient, sender, status `sent`, optional CRM FKs; failed Resend creates no success row (or only failed row if you choose insert-before-send — document choice in PR).

---

### Phase 2 — Product Drawer outreach history

**Goal:** Product-level history: who, when, status.

**Includes**

- Staff fetch helper for `system_messages` by `catalog_item_id`.
- History UI in `ProductDetailDrawer` (or small child component).
- Empty state; exclude Copy Card.

**Does not include:** open/click counts (show `—` or hide until Phase 3), Wholesale System mode, webhooks.

**Done when:** Staff can open a product and see prior manual outreach rows for that product.

---

### Phase 3 — Resend webhooks + event idempotency

**Goal:** Delivery lifecycle + open/click counts; idempotent processing.

**Includes**

- Migration: `system_message_events`.
- `POST /api/webhooks/resend` + verify + apply helpers.
- Status/timestamp/counter updates; out-of-order guards.
- Tests: bad signature, duplicate event id, open/click increments, bounce vs delivered.
- `RESEND_WEBHOOK_SECRET` in `.env.example`.
- Product history (and any existing list) shows updated status/counts.

**Does not include:** Wholesale System UX, account drawer section, automation.

**Done when:** Repeated identical webhook deliveries do not double-count; UI reflects delivered/opened/clicked/bounced/failed.

---

### Phase 4 — Messages → Wholesale → System

**Goal:** Surface System Messages under Wholesale, distinct from inbound.

**Includes**

- Wholesale secondary mode: Inbound \| System.
- `SystemMessagesList` + `SystemMessagePanel` (detail + event timeline if Phase 3 shipped).
- No mapping/reply controls on System.
- Gmail / Realtime / inbound wholesale paths untouched.

**Does not include:** account drawer section (Phase 5), agent origins.

**Done when:** Staff can browse System Messages from Messages → Wholesale without affecting inbound threads.

---

### Phase 5 — Account / Prospect outreach surface + composer polish

**Goal:** CRM-visible history where association exists; light composer UX.

**Includes**

- `AccountProductOutreachSection` (or equivalent) on account/prospect drawers.
- Optional composer soft-match hint when `to` resolves to a contact.
- Optional thin `prospect_updates` note (only if cheap and consistent with existing note patterns).

**Does not include:** full contact picker / account-first Email Product, sequences, AI.

**Done when:** Linked sends appear on the account; unlinked sends still appear on product + Wholesale System.

---

### Phase 6 — Docs & architecture sync (optional thin plan)

**Goal:** Keep long-lived docs accurate.

**Includes**

- Update `docs/product-architecture.md` messaging table (System Messages ledger vs Message Center vs Gmail).
- Point `ogr-product-email-composer-roadmap.md` deferred items at this epic.
- Mark phases complete in this file.

**Done when:** Docs match shipped behavior; Future Automation Compatibility still explicit.

---

## 10. Exact files (working checklist)

### Create

| Path                                                             | Phase |
| ---------------------------------------------------------------- | ----- |
| `supabase/migrations/*_system_messages.sql`                      | 1     |
| `supabase/migrations/*_system_message_events.sql`                | 3     |
| `src/lib/systemMessages.ts`                                      | 1–2   |
| `src/lib/systemMessages.test.ts`                                 | 1–2   |
| `src/lib/matchContactByEmail.ts` (or under `systemMessages`)     | 1     |
| `src/lib/resendWebhook.ts`                                       | 3     |
| `src/lib/resendWebhook.test.ts`                                  | 3     |
| `src/pages/api/webhooks/resend.ts`                               | 3     |
| `src/test/api/resend-webhook.test.ts`                            | 3     |
| `src/components/product/ProductEmailHistory.tsx` (name flexible) | 2     |
| `src/components/messages/SystemMessagesList.tsx`                 | 4     |
| `src/components/messages/SystemMessagePanel.tsx`                 | 4     |
| `src/components/messages/AccountProductOutreachSection.tsx`      | 5     |

### Modify

| Path                                                                  | Phase                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/lib/sendOgrProductOutreachEmail.ts`                              | 1                                                    |
| `src/pages/api/staff/ogr-product-email.ts`                            | 1                                                    |
| `src/lib/sendOgrProductEmailClient.ts`                                | 1                                                    |
| `src/test/api/ogr-product-email.test.ts`                              | 1                                                    |
| `src/components/ProductDetailDrawer.tsx`                              | 2                                                    |
| `src/components/OgrProductEmailComposerModal.tsx`                     | 5 (optional hint); 1 only if request shape needs ids |
| `src/components/tabs/MessagesTab.tsx`                                 | 4                                                    |
| `src/components/AccountDetailDrawer.tsx` / `ProspectDetailDrawer.tsx` | 5                                                    |
| `src/types/database.ts`                                               | 1, 3                                                 |
| `supabase/schema.sql`                                                 | 1, 3                                                 |
| `.env.example`                                                        | 3                                                    |
| `docs/product-architecture.md`                                        | 6                                                    |
| `ogr-product-email-composer-roadmap.md`                               | 6                                                    |

### Preserve

- `messageCenterInbound.ts`, wholesale order APIs, live chat, all `Gmail*`, `copyOgrProductEmailCard.ts`, buyer message RLS.

---

## 11. Acceptance criteria (epic-level)

1. Every successful Email Product send creates one `system_messages` row (`product_outreach` / `manual_product_email`) with Resend id, product, recipient, sender, timestamp.
2. Basic CRM association runs in Phase 1 (optional ids + unique email match).
3. Product Drawer shows history (who / when / status; open/click after Phase 3).
4. Messages → Wholesale → System lists ledger rows; inbound wholesale unchanged.
5. Gmail and live chat unchanged.
6. Webhooks update status/counts idempotently under duplicate delivery.
7. Copy Email Card never creates a System Message.
8. Schema allows `draft` / `queued` / `scheduled` and future `origin` values without forcing those features to ship.
9. Docs state that future AI must create/queue System Messages rather than send directly to Resend.

---

## 12. Phase tracker

| Phase | Name                                | Status      |
| ----- | ----------------------------------- | ----------- |
| 1     | Persist System Messages + basic CRM | Done        |
| 2     | Product Drawer history              | Done        |
| 3     | Resend webhooks + events            | Done        |
| 3.5   | Unseen Line Sheet engagement alerts | Done        |
| 4     | Wholesale → System UX               | Not started |
| 5     | Account surface + composer polish   | Not started |
| 6     | Docs sync                           | Not started |
