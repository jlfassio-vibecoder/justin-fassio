# Phase 2 — Draft Generation

**Epic:** [Agentic Outreach & Lead Qualification](./README.md)  
**Depends on:** [Phase 0](./phase-0-foundations.md), [Phase 1](./phase-1-eligibility-selection.md)  
**Blocks:** Phase 5 nightly draft volume; feeds Phase 3/4 with CRM-linked sends after staff approve

---

## Objective

Generate short, personalized Product Outreach **drafts** server-side — custom intro + existing product card + custom closing + authenticated rep signature metadata — save them for morning human review/edit/send. No autosend.

---

## Why this phase exists

Composition slots already exist (`introText`, `closingText`, subject default in `ogrProductOutreachEmail.ts`), and staff compose via `OgrProductEmailComposerModal`. What is missing:

- server AI that writes intro/closing for a selected prospect+product
- persistence of those drafts (Phase 0)
- review workflow at morning volume
- Line Sheet affordance that agent drafts are ready (without colliding with Opened/Clicked)

---

## Current live-code foundation

| Artifact    | Location                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Renderer    | `renderOgrProductOutreachEmail` — greeting, intro, card, closing, signature, footer                     |
| Defaults    | `OGR_PRODUCT_EMAIL_DEFAULT_INTRO`, `OGR_PRODUCT_EMAIL_DEFAULT_CLOSING`, `defaultOgrProductEmailSubject` |
| Card        | `renderOgrProductEmailCard` (View Details + View Catalog)                                               |
| Limits      | `src/lib/ogrProductEmailLimits.ts` (`OGR_PRODUCT_EMAIL_MAX_PROSE`, etc.)                                |
| Composer UI | `src/components/OgrProductEmailComposerModal.tsx`                                                       |
| Drawer      | `src/components/ProductDetailDrawer.tsx`                                                                |
| AI Gateway  | `/api/agent`, `/api/prospects/enrich`, `generateObject` patterns                                        |
| Prefills    | `src/lib/aiAssistPrefill.ts` (coach drafts — **not** Product Outreach card emails)                      |
| Sender      | `resolveStaffOutreachSenderNames`                                                                       |

Subject format already matches Epic contract: `Old Guys Rule — [Line Item Name]`.

---

## Required behavior

1. **Input:** Phase 1 selection DTO (prospect, contact, product, channel context, optional reasons).
2. **Server AI:** produce `introText` and `closingText` only (not HTML, not subject gimmicks, not From header).
3. **Subject:** deterministic via `defaultOgrProductEmailSubject(productName)` — AI must not invent subjects.
4. **Intro:** prefer under **50 words**; pique interest; do not attempt to close the sale or quote wholesale pricing.
5. **Closing:** short, appropriate, invite reply/call — not hard CTA spam.
6. **Context for model:** prospect name/city/channel/themes/fit blurb; product name/tagline/category; rep first name available at send time (draft may store intended staff or fill signature only at send).
7. **Save draft** via Phase 0 insert (`origin` agent, `status` draft/queued) with explicit CRM IDs.
8. **Morning review:** staff opens draft, edits prose if needed, sends via approve-and-send (Phase 0).
9. **Identity:** signature/From resolved from **authenticated staff at send** (never trust model for From).
10. **Line Sheet draft badge:** separate visual from Opened/Clicked (e.g. “Draft” / “Ready”) keyed off agent-origin draft rows for that `catalog_item_id` — optional count; clearing rules must not touch engagement counters.

Preview HTML may call `renderOgrProductOutreachEmail` with a placeholder signature for review UI.

---

## Proposed data / schema changes

- Relies on Phase 0 draft persistence (intro/closing/subject).
- Optional `payload.generation` metadata: model id, prompt version, selection reasons (audit) — no PII beyond CRM ids already on row.
- No Resend id until send.

---

## Server / API changes

| Endpoint / job step            | Behavior                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `generateProductOutreachDraft` | Staff or nightly runner; eligibility already applied; `generateObject` → validate length → Phase 0 insert |
| Preview                        | Optional render-only without save                                                                         |
| Batch generate                 | Used by Phase 5; Phase 2 should expose single + batch                                                     |

Use Vercel AI Gateway + structured output (Zod), same secret boundary as enrich APIs (`AI_GATEWAY_API_KEY` server-only).

Rate-limit batch generation; never import `resend` in generation module.

---

## UI changes

| Surface         | Change                                                               |
| --------------- | -------------------------------------------------------------------- |
| Draft review    | Composer-like modal prefilled from draft; Send = approve-and-send    |
| Line Sheet      | Agent draft badge distinct from engagement badges (`CatalogTab.tsx`) |
| Product history | Show drafts + origin                                                 |
| Optional        | “Regenerate intro” staff action                                      |

Do not place draft state into `product_outreach_engagement_seen`.

---

## Business rules

- Word preference: intro &lt; 50 words (soft truncate or regenerate if over hard max prose limit).
- No wholesale USD / internal cost / buyer-only fields in copy (same public presentation constraints as card).
- No HTML from the model — plain text only; renderer escapes.
- Staff may edit freely before send within existing length limits.
- Regenerating creates new prose on same draft or new draft version — pick one and test.
- Autosend forbidden.

---

## Reusable existing files / functions

- `src/lib/ogrProductOutreachEmail.ts`
- `src/lib/ogrProductEmailCard.ts`
- `src/lib/publicProductPresentation.ts`
- `src/lib/ogrProductEmailLimits.ts`
- `src/lib/ogrProductEmailSender.ts` (at send)
- Phase 0 draft APIs
- Phase 1 selection modules
- AI `generateObject` patterns from `src/lib/createEnrichedProspect.ts` / landed-rates research
- `src/components/OgrProductEmailComposerModal.tsx` (adapt)

---

## New files / components likely required

- `src/lib/generateOgrProductOutreachDraft.ts` (prompt + schema + validation)
- `src/pages/api/staff/ogr-product-email/generate-draft.ts` (name flexible)
- Prompt/version constants
- Line Sheet badge wiring in `CatalogTab.tsx`
- Draft review entry points from Briefing (Phase 5) and product drawer

---

## Tests

- Structured output schema validation
- Subject always default format
- Intro word-count preference enforced or flagged
- Escaping: model cannot inject HTML/script into stored fields
- Draft saved without Resend mock calls
- Badge query does not alter engagement seen table
- Public presentation forbidden keys never appear in prompt outputs (spot-check)

---

## Acceptance criteria

- [ ] Server generates intro/closing for a Phase 1 target and saves agent draft
- [ ] Subject remains `Old Guys Rule — [Line Item Name]`
- [ ] Staff can review, edit, and send via Phase 0 path
- [ ] Agent generation path never calls Resend
- [ ] Line Sheet draft affordance does not collide with Opened/Clicked
- [ ] Copy style is concise and non-closing

---

## Dependencies

- Phase 0 draft storage + send-draft
- Phase 1 selection DTO
- AI Gateway credentials in deploy env

---

## Non-goals

- Autosend
- Subject line A/B or gimmicky subjects
- Product card redesign
- Gmail-side draft creation as the system of record
- Final Warm/Hot logic

---

## Migration / deployment considerations

- Feature-flag generation if needed for gradual rollout
- Prompt version in payload for later learning attribution
- Monitor token cost on batch (Phase 5)

---

## Risks / edge cases

| Risk                                              | Mitigation                                             |
| ------------------------------------------------- | ------------------------------------------------------ |
| Model invents pricing                             | System prompt + post-filter for currency patterns      |
| Empty tagline / thin prospect context             | Fall back to defaults; still save draft for staff edit |
| Signature name at draft time vs send time         | Resolve at send from authenticated staff               |
| Over-long intro                                   | Enforce max prose; prefer regenerate once              |
| Staff sends as different user than nightly author | Expected; From = sender                                |

---

## Completion checklist

- [ ] Generate + save draft API
- [ ] Review/edit/send UX path
- [ ] Line Sheet draft badge (or documented deferral with API complete)
- [ ] Tests for subject + no Resend on generate
- [ ] Phase 5 can call batch generate safely
