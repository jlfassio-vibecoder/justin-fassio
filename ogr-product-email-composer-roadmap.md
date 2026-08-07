# OGR Product Email Composer + Copy Email Card — Roadmap

Companion to [`docs/old-guys-rule-wholesale-public.md`](docs/old-guys-rule-wholesale-public.md) and the merged OG card work (PR #50 / Phases 1–5).

**Branch recommendation:** cut `feature/ogr-product-email-composer` from `main` after PR #50.

## How to use (Plan Mode)

Each **implementation phase** below is sized for **one Plan Mode session → one PR**.

1. Paste the phase’s **Plan prompt**.
2. Implement; gate with `npm run check` (+ listed manual smoke).
3. Check the phase boxes when the PR merges.

Do **not** combine phases unless a later phase lists a hard dependency.

---

## 1. Executive Summary

**Today:** Phases 1–5 ship a pure, wholesale-free email product card renderer (`renderOgrProductEmailCard`) and a public product URL layer. Staff can **Copy public link** / **Preview public page** from [`ProductDetailDrawer`](src/components/ProductDetailDrawer.tsx). There is **no** staff workflow that embeds the card in an email or copies rich HTML.

**Why there is no “email OG card URL”:** the card is an HTML fragment (`<table>…</table>`), not a web resource. Confusing it with:

```text
https://justinfassio.com/old-guys-rule-wholesale/{slug}
```

led to the wrong product question. The URL is the **CTA destination inside** the card; the card itself is **content**.

**This update solves:** staff-facing **Email Product** (compose + Resend) and **Copy Email Card** (rich clipboard), both powered by the same Phase 5 renderer, without inventing `/email-card/{slug}`.

**Recommended primary workflow:** **product-first** from the Line Sheet product drawer — open product → Email Product / Copy Email Card / keep Copy public link.

---

## 2. Existing Architecture

| Layer                    | File / symbol                                                                                                                          | Role                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Presentation             | [`publicProductPresentation.ts`](src/lib/publicProductPresentation.ts) — `buildPublicProductPresentation`, `PublicProductPresentation` | Canonical public-safe product model                     |
| URLs                     | [`productUrls.ts`](src/lib/productUrls.ts) — `buildOgrProductUrl`, `tryBuildOgrProductUrl`, `resolvePublicSiteOrigin`                  | Absolute product href                                   |
| Social meta (separate)   | [`ogrPageMetadata.ts`](src/lib/ogrPageMetadata.ts), [`ogrShareImages.ts`](src/lib/ogrShareImages.ts)                                   | Web OG only — **not** email card                        |
| Email card               | [`ogrProductEmailCard.ts`](src/lib/ogrProductEmailCard.ts) — `renderOgrProductEmailCard`                                               | Pure HTML fragment                                      |
| Escaping                 | [`escapeHtml.ts`](src/lib/escapeHtml.ts)                                                                                               | Shared HTML escape                                      |
| Resend (existing)        | [`wholesaleOrderEmail.ts`](src/lib/wholesaleOrderEmail.ts), [`liveChat.ts`](src/lib/liveChat.ts) `sendLiveChatStaffAlert`              | Direct `new Resend(apiKey)`; no shared transport module |
| Staff auth               | [`agentAuth.ts`](src/lib/agentAuth.ts) — `requireApprovedStaffClient`                                                                  | Bearer JWT + `is_approved_staff`                        |
| Staff product UI         | [`ProductDetailDrawer.tsx`](src/components/ProductDetailDrawer.tsx), [`CatalogTab.tsx`](src/components/tabs/CatalogTab.tsx)            | Line Sheet → Details drawer                             |
| Public copy link (buyer) | [`WholesaleProductDetail.tsx`](src/components/wholesale/WholesaleProductDetail.tsx) — `copyLink`                                       | `navigator.clipboard.writeText`                         |
| CRM contacts             | [`accountContacts.ts`](src/lib/accountContacts.ts), [`AccountContactsSection.tsx`](src/components/AccountContactsSection.tsx)          | `account_contacts.email`, `is_primary`                  |
| Profiles                 | `profiles.display_name`, `profiles.email`                                                                                              | No signature column                                     |
| Preview                  | `npm run email:preview-ogr-card`                                                                                                       | `tmp/ogr-product-email-card-preview.html`               |

**Resend env:** `RESEND_API_KEY` (required for send); optional `WHOLESALE_ORDER_EMAIL_FROM`; default From `Justin Fassio <office@justinfassio.com>` via `CONTACT_EMAIL`.

**Clipboard today:** plain `writeText` only; no `ClipboardItem`, no shared helper, no toast library (button label flips to “Copied”).

---

## 3. Product Model

| Action            | Staff label                                                      | Output                               | Use                                 |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------ | ----------------------------------- |
| Copy Product Link | **Copy public link** (drawer) / **Copy Product Link** (showroom) | Absolute product URL                 | SMS, Slack, simple paste            |
| Copy Email Card   | **Copy Email Card** (new)                                        | `text/html` + `text/plain` clipboard | Paste into Gmail/Outlook/Apple Mail |
| Email Product     | **Email Product** (new)                                          | Full message via Resend              | Canonical app-sent outreach         |

Do **not** name anything “Copy OG Card URL.”

---

## 4. Staff Workflow

**Primary (MVP): product-first**

```text
Line Sheet → Product Details (ProductDetailDrawer)
        │
        ├─ Copy public link        → clipboard URL
        ├─ Preview public page     → new tab (existing)
        ├─ Copy Email Card         → ClipboardItem(html + plain)
        └─ Email Product
              → modal composer
              → To / Subject / Intro / Closing
              → live card preview (Phase 5 fragment)
              → POST /api/staff/ogr-product-email
              → server: auth → fetch product → presentation → compose → Resend
              → success feedback
```

**Account-first** (select product from CRM) is **deferred** — contacts live on accounts, but product context is strongest in the drawer.

```text
Future: Active Account / Prospect → Email Product → pick published OGR SKU
```

---

## 5. UX Surface Recommendation

| Action              | Placement                                                                | Component             |
| ------------------- | ------------------------------------------------------------------------ | --------------------- |
| Copy public link    | Keep in **Public wholesale**                                             | `ProductDetailDrawer` |
| Preview public page | Keep                                                                     | `ProductDetailDrawer` |
| Email Product       | New **Email** subsection under Public wholesale (or adjacent action row) | `ProductDetailDrawer` |
| Copy Email Card     | Same Email subsection                                                    | `ProductDetailDrawer` |

**Do not** add these to CatalogTab row menus in MVP (drawer is the detail context).  
**Do not** put them on the public buyer showroom.

Feedback: match existing **Copied** button-label pattern; optional inline `role="status"` banner like ProspectsTab for send success/errors. No new toast library.

---

## 6. Email Composer Specification

**Modal** (follow `LogCallModal` / drawer modal conventions — structured form, not WYSIWYG).

| Field        | Editable?                  | Default                                                                    |
| ------------ | -------------------------- | -------------------------------------------------------------------------- |
| To           | Yes                        | Empty text input (type=email); staff pastes buyer email                    |
| Subject      | Yes                        | `Old Guys Rule — {Product Name}`                                           |
| Intro        | Yes                        | `I thought this Old Guys Rule style could be a strong fit for your store.` |
| Product card | **No**                     | Live preview of `renderOgrProductEmailCard`                                |
| Closing      | Yes                        | `Let me know if you'd like pricing or availability.`                       |
| Signature    | Display / lightly editable | `profiles.display_name` or fallback `Justin Fassio`                        |
| Send         | Button                     | Submits to API                                                             |

**Non-goals in composer:** Cc, Bcc, wholesale price lines, multi-product cards, AI draft (can reuse `aiAssistPrefill` later).

**Preview:** form fields + embedded card HTML iframe/`dangerouslySetInnerHTML` of **server-or-client-rendered fragment only** (never staff-editable HTML).

**Send:** no second confirm modal — the composer **is** the confirmation step.

**Draft persistence:** none in MVP (close = discard).

---

## 7. Copy Email Card Specification

| MIME         | Content                                                              |
| ------------ | -------------------------------------------------------------------- |
| `text/html`  | Exact `renderOgrProductEmailCard(presentation, { href })` fragment   |
| `text/plain` | `Old Guys Rule — {name}\n\n{tagline}\n\nView Details:\n{productUrl}` |

**Client helper** (new): e.g. `copyOgrProductEmailCardToClipboard({ html, plainText })` wrapping `ClipboardItem` when available.

**Success:** button → **Email card copied**.  
**Failure / unsupported rich clipboard:** do **not** claim success with raw HTML source; fall back to copying the **plain-text** payload and show **Copied as plain text** (or error + point to Copy public link).

**Image risk:** remote `<img src="https://…">` — clients may rewrite on paste. Document; prefer app-sent Resend as canonical rendering.

---

## 8. System Architecture

```text
Staff UI (ProductDetailDrawer)
   ↓ product id/sku + prose + recipient
POST /api/staff/ogr-product-email
   ↓ requireApprovedStaffClient
   ↓ authoritative catalog fetch (published OGR item)
   ↓ buildPublicProductPresentation (+ optional rank from public_sort_order)
   ↓ resolvePublicSiteOrigin → buildOgrProductUrl
   ↓ renderOgrProductOutreachEmail → renderOgrProductEmailCard
   ↓ Resend send
   ↓ { ok: true } | { ok: false, error }
```

```text
Staff UI
   ↓ client: presentation or minimal fields + tryBuildOgrProductUrl
   ↓ renderOgrProductEmailCard
   ↓ ClipboardItem(text/html + text/plain)
```

**Server owns send. Client owns clipboard.** Card HTML never authored twice.

---

## 9. Resend Integration

| Concern         | Decision                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client creation | Same pattern as `sendWholesaleOrderConfirmation` — `new Resend(apiKey)` in a **new** focused module (e.g. `ogrProductOutreachEmail.ts`), not a mega-provider abstraction |
| From            | `WHOLESALE_ORDER_EMAIL_FROM` → `Justin Fassio <${CONTACT_EMAIL}>`                                                                                                        |
| Reply-To        | Same as From / office (match wholesale unless profile email later)                                                                                                       |
| Missing key     | Return structured `{ ok: false, error: 'Email is not configured' }` — **do not** silent-succeed                                                                          |
| Logging         | `console.error` with product id + provider message; avoid logging full HTML bodies                                                                                       |

Optional later: extract shared `getResendClient()` — **not** required for MVP.

---

## 10. Security Model

| Control           | Requirement                                                                            |
| ----------------- | -------------------------------------------------------------------------------------- |
| Auth              | `requireApprovedStaffClient` — buyers / anon get 401/403                               |
| Product authority | Server fetches by **catalog item id** (preferred) or sku; reject unpublished / non-OGR |
| Client trust      | Never trust client-supplied presentation or card HTML                                  |
| Inputs            | Bound subject/intro/closing length; escape all staff prose into HTML                   |
| Card              | Only `renderOgrProductEmailCard` output                                                |
| From              | Server-controlled only                                                                 |
| Open relay        | Staff + existing product + validated recipient email required                          |
| Secrets           | No `RESEND_API_KEY` in islands                                                         |
| Wholesale         | Card + presentation stay wholesale-free; no wholesale in MVP composer                  |

---

## 11. Tracking Decision

**MVP: no UTM.** Card href = Phase 2 absolute canonical product URL.

**Deferred:** `utm_source=email&utm_medium=sales_outreach&utm_campaign=ogr_product_email&utm_content={sku}` — no PII. Apply only to card CTA / text link, never to page `canonical` / `og:url`.

---

## 12. CRM Integration Decision

| Capability                            | MVP                  | Deferred                                                 |
| ------------------------------------- | -------------------- | -------------------------------------------------------- |
| Recipient from CRM autocomplete       | No — free-text email | Prefill from `account_contacts` when opened from account |
| Primary contact helper                | No                   | `fetchContactsForAccount` + `is_primary`                 |
| Log send as `prospect_updates`        | No                   | Optional note “OGR product email sent…”                  |
| Treat Copy Email Card as CRM activity | **Never**            | Copy ≠ send                                              |

---

## 13. MVP Scope

- Single published OGR product
- Single recipient
- Editable subject, intro, closing
- Signature from `display_name` / fallback
- Embedded Phase 5 card (non-editable)
- Plain-text multipart
- Resend via staff API
- Copy Email Card (rich + plain fallback)
- Existing Copy public link / Preview unchanged
- No DB migration
- No mass send / Cc / drafts / AI / wholesale in card

---

## 14. Deferred Scope

- Account-first “Email Product” from Active Accounts / Prospects
- CRM contact autocomplete / multi-recipient / Cc
- UTM tracking
- CRM activity logging
- AI-generated intro (`aiAssistPrefill`)
- Multi-product / compact cards / line-sheet emails
- Saved drafts / scheduled sends
- Templates, sequences, bulk campaigns
- Dedicated email-card web route
- Shared Resend SDK wrapper mega-module
- Toast library introduction

---

## 15. Implementation Phases

| Phase | Goal                     | Deliverable                                                                                | Depends on                                                                     |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **A** | Shared outreach composer | `renderOgrProductOutreachEmail` → `{ subject, html, text }` using Phase 5 card; unit tests | Phase 5 on `main`                                                              |
| **B** | Copy Email Card          | Clipboard helper + drawer button + feedback + tests                                        | A (card HTML) — can start parallel if only calling `renderOgrProductEmailCard` |
| **C** | Server send              | `POST /api/staff/ogr-product-email` + Resend module + auth + tests (mocked Resend)         | A                                                                              |
| **D** | Staff composer UI        | Email Product modal in `ProductDetailDrawer` wired to C                                    | A + C                                                                          |
| **E** | QA / hardening           | Inbox + paste matrix, docs note, release gate                                              | B + D                                                                          |

**Recommended PR order:** A → C → D → B (or B parallel after A) → E.

---

## 16. File-Level Roadmap

| File                                                                | New/Modify | Responsibility                                    | Phase |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------------- | ----- |
| `src/lib/ogrProductOutreachEmail.ts`                                | New        | Full message compose (html+text+subject defaults) | A     |
| `src/lib/ogrProductOutreachEmail.test.ts`                           | New        | Composer tests / leak checks                      | A     |
| `src/lib/copyOgrProductEmailCard.ts`                                | New        | Clipboard write + fallback                        | B     |
| `src/lib/copyOgrProductEmailCard.test.ts`                           | New        | Mock clipboard                                    | B     |
| `src/pages/api/staff/ogr-product-email.ts`                          | New        | `prerender = false`; auth; send                   | C     |
| `src/pages/api/staff/ogr-product-email.test.ts` or `src/test/api/…` | New        | Auth / validation / mock Resend                   | C     |
| `src/components/OgrProductEmailComposerModal.tsx`                   | New        | Composer UI                                       | D     |
| `src/components/ProductDetailDrawer.tsx`                            | Modify     | Email Product + Copy Email Card actions           | B + D |
| `docs/old-guys-rule-wholesale-public.md`                            | Modify     | Link Product Link vs OG vs Email Card             | E     |
| `scripts/send-test-ogr-product-email.mjs` or npm script             | New        | Optional staging send; explicit `--to`            | E     |
| `package.json`                                                      | Modify     | Script only if E adds test send                   | E     |

**Unchanged:** `ogrProductEmailCard.ts` internals (call only); social share resolvers; no migration.

---

## 17. Test Strategy

| Area       | Coverage                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Composer   | Defaults, custom subject/intro, card present, plain text, escaping, no image, no wholesale       |
| Card reuse | Same fragment function for send HTML and clipboard HTML                                          |
| Clipboard  | html+plain payloads; unsupported API → plain fallback; never “success” with raw markup dump      |
| URL        | `buildOgrProductUrl` / `resolvePublicSiteOrigin` only                                            |
| API        | Staff ok; buyer/anon denied; bad email; missing product; unpublished; Resend fail/success (mock) |
| Security   | Forbidden keys absent from html/text                                                             |
| Manual     | See §18                                                                                          |

---

## 18. QA Matrix

### App-sent (Resend) — canonical

| Client                  | Check                             |
| ----------------------- | --------------------------------- |
| Gmail web               | Image, CTA, links, layout         |
| Gmail mobile / iOS Mail | Readable; CTA works               |
| Outlook web or desktop  | Table CTA; acceptable degradation |
| Image blocked           | Name/tagline/CTA still useful     |

### Copy/paste — convenience

| Client            | Check                                            |
| ----------------- | ------------------------------------------------ |
| Gmail web paste   | Card appears; CTA works; document rewrite quirks |
| Outlook web paste | Same                                             |
| Apple Mail paste  | Same                                             |
| Failure path      | Plain-text fallback usable                       |

---

## 19. Risks

| Risk                                  | Rank      | Mitigation                                                         |
| ------------------------------------- | --------- | ------------------------------------------------------------------ |
| Clipboard API / Safari quirks         | High      | Feature-detect; plain fallback; document                           |
| Paste HTML rewritten by Gmail/Outlook | High      | Position paste as convenience; Resend = canonical                  |
| Outlook table/CSS quirks              | Medium    | Keep Phase 5 conservative markup                                   |
| Deliverability / From domain          | Medium    | Reuse existing verified From pattern; ops verifies DNS outside app |
| Staff auth bypass                     | Critical  | `requireApprovedStaffClient` + tests                               |
| Open relay                            | Critical  | Auth + product + validated To                                      |
| CRM contact ambiguity                 | Low (MVP) | Free-text To only                                                  |
| Scope creep → mass email              | High      | Explicit non-goals; one recipient                                  |
| Duplicate email HTML stacks           | Medium    | One card renderer; thin composer only                              |

---

## 20. Acceptance Criteria (MVP)

- [ ] Staff can open **Email Product** from `ProductDetailDrawer`
- [ ] Product loaded authoritatively on the server
- [ ] `PublicProductPresentation` + Phase 2 URL + Phase 5 card reused
- [ ] Staff edit subject/intro/closing only — not card HTML
- [ ] Resend sends server-side; endpoint staff-authorized
- [ ] Card remains wholesale-free
- [ ] **Copy Email Card** writes rich HTML when supported + useful plain text
- [ ] Clipboard failure degrades usefully (not fake success with raw tags)
- [ ] **Copy public link** / Preview remain intact
- [ ] App-sent email verified in Gmail + one Outlook (or second major) client
- [ ] Paste path verified in Gmail; limitations documented
- [ ] No DB migration
- [ ] `npm run check` (+ build) green

---

## 21. Recommended Implementation Order

1. **Phase A** — `ogrProductOutreachEmail` composer + tests
2. **Phase C** — API + Resend + auth tests
3. **Phase D** — Composer modal + drawer **Email Product**
4. **Phase B** — Clipboard helper + **Copy Email Card** (can overlap late A)
5. **Phase E** — Inbox/paste QA, doc distinction note, optional `email:test-ogr-product` script

---

## 22. Open Decisions

| Decision           | Options                                       | Recommended                                      | Why                                              |
| ------------------ | --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Product key on API | Catalog `id` vs `sku`                         | **`id` (uuid)** with sku fallback only if needed | Stable; drawer already has item id               |
| Signature source   | `display_name` only vs always “Justin Fassio” | **`display_name` \|\| `Justin Fassio`**          | Multi-staff ready without new schema             |
| Composer mount     | Inline drawer section vs modal                | **Modal**                                        | Matches Log Call; keeps drawer height manageable |

All other product choices in this roadmap are locked from repository inspection.

---

## Locked architecture (quick reference)

| Concern                        | Decision                                 |
| ------------------------------ | ---------------------------------------- |
| Primary UX                     | Product-first from `ProductDetailDrawer` |
| Card renderer                  | Only `renderOgrProductEmailCard`         |
| Image policy                   | Phase 5 (no social line-hero fallback)   |
| Tracking                       | Deferred                                 |
| CRM log / autocomplete         | Deferred                                 |
| Recipients                     | One email; free-text MVP                 |
| Artificial `/email-card` route | **No**                                   |
| Mass marketing                 | **Out of scope**                         |

---

## Plan prompts (copy into Plan Mode)

### Phase A — Shared outreach composer

```text
Implement Phase A of ogr-product-email-composer-roadmap.md: add src/lib/ogrProductOutreachEmail.ts that builds subject/html/text for a single-product staff outreach email by calling renderOgrProductEmailCard. Pure; no Resend; escape staff prose; no wholesale. Add Vitest coverage. Do not build UI or API yet.
```

### Phase B — Copy Email Card

```text
Implement Phase B of ogr-product-email-composer-roadmap.md: clipboard helper for text/html + text/plain from renderOgrProductEmailCard; wire Copy Email Card into ProductDetailDrawer Public wholesale/Email actions with Copied feedback and plain-text fallback. No Resend.
```

### Phase C — Server send

```text
Implement Phase C of ogr-product-email-composer-roadmap.md: POST /api/staff/ogr-product-email with requireApprovedStaffClient, authoritative product fetch, outreach composer, Resend (mock in tests). No composer UI yet.
```

### Phase D — Staff composer UI

```text
Implement Phase D of ogr-product-email-composer-roadmap.md: Email Product modal from ProductDetailDrawer; fields per roadmap; call Phase C API; reuse existing feedback patterns.
```

### Phase E — QA / hardening

```text
Execute Phase E of ogr-product-email-composer-roadmap.md: inbox + paste QA, update docs/old-guys-rule-wholesale-public.md with Product Link vs OG vs Email Card distinction, optional test-send script with explicit recipient, npm run check / build, release note.
```
