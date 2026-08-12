# Phase 5 — Nightly Preparation & Daily Agent Briefing

**Epic:** [Agentic Outreach & Lead Qualification](./README.md)  
**Depends on:** Phases [0](./phase-0-foundations.md)–[4](./phase-4-goals-attribution-learning.md)  
**Delivers:** Overnight draft prep + morning operating surface  
**Must not:** Send email overnight or call Resend from the cron path

---

## Objective

Securely orchestrate **nightly** preparation of the next selling day’s outreach drafts and a **Daily Agent Briefing** so staff start the morning with pace, drafts, channel allocation, and call priorities — then send only through the existing human-reviewed Product Email path.

---

## Why this phase exists

Live deploy has:

- No Vercel Cron (`vercel.json` is headers/CSP only)
- No outreach job runner (`scheduled_for` / `automation_run_id` unused)
- No Daily Agent Briefing surface
- Default app tab = Line Sheet (`RepCommandCenter` `defaultTab = 'catalog'`)
- Floating `AIAssistantModal` coach — not an outreach briefing

Phases 0–4 provide drafts, selection, lead states, and pace math; Phase 5 wires them into an operable daily loop.

---

## Current live-code foundation

| Artifact | Location |
|----------|----------|
| App shell | `src/components/RepCommandCenter.tsx`, `src/components/TabNav.tsx`, `src/types/index.ts` (`TabKey`) |
| Dashboard | `src/components/tabs/DashboardTab.tsx` |
| AI chrome | `src/components/ui/AIAssistantModal.tsx` |
| Auth | `src/components/auth/AuthGate.tsx` |
| Deploy | `vercel.json` — no `crons` |
| Placeholders | `system_messages.scheduled_for`, `automation_run_id` |
| Engagement UI | `CatalogTab` Opened/Clicked |
| Active due | `ActiveAccountsTab` reorder-due (separate from new-logo Call Today) |

---

## Required behavior

### Nightly orchestration (no send)

Secure scheduled job (Vercel Cron → protected API, or equivalent on current host):

1. Resolve next selling day / capacity from Phase 4 pace.
2. Allocate retail channels (Phase 1 + Phase 4 weights).
3. Select eligible ranked prospects (Phase 1).
4. Select products (Phase 1).
5. Generate + save reviewable drafts (Phase 2 → Phase 0) up to recommended count.
6. Persist a briefing snapshot for morning (or compute on read from drafts + metrics).
7. Record `automation_run_id` (and optionally stamp drafts) for idempotency.
8. **Never** call `sendOgrProductOutreachEmail` / Resend.

### Idempotency / rerun protection

- One successful prep run per local selling date (or per `automation_run_id` day key).
- Rerun should not duplicate pending drafts for the same prospect/product; cancel/replace policy documented.
- Partial failure: report which steps completed; do not mark run success if draft count is zero when targets &gt; 0 unless eligible pool empty (explicit empty-pool outcome).

### Failure reporting

- Structured log + staff-visible error on Briefing (“Nightly prep failed / partial”)
- Alert path optional (email to office) — not required for v1 if in-app banner exists

### Daily Agent Briefing contents

| Block | Source |
|-------|--------|
| Monthly account goal | Phase 4 |
| Accounts opened MTD | `converted_at` |
| Projected attainment | Phase 4 |
| Recommended outreach pace | Phase 4 |
| Drafts ready today | Agent-origin drafts in draft/queued for the day |
| Retail-channel allocation | Phase 1/5 plan |
| Hot / Call Today | Phase 3 |
| Warm leads | Phase 3 |
| Recent meaningful engagement | Aggregates / recent clicks |
| Recent account conversions | `converted_at` list |

**Navigation:** each row links to prospect/account, product drawer, and draft review/send.

Briefing answers:

- Who should I send to? → drafts ready (+ pace)
- Who should I call? → Hot / Call Today / Warm

### Autosend

Explicitly forbidden in this phase and Epic.

---

## Proposed data / schema changes

| Change | Purpose |
|--------|---------|
| `outreach_automation_runs` | id, run_date, status, targets, produced_drafts, error, timestamps |
| Link drafts | `system_messages.automation_run_id` → run |
| `outreach_briefing_snapshots` (optional) | JSON briefing for morning if on-read is expensive |
| Vercel cron | Add `crons` to `vercel.json` invoking secured route |

Cron auth: shared secret header / Vercel cron rules — never public anonymous generate.

---

## Server / API changes

| Endpoint | Behavior |
|----------|----------|
| `POST /api/cron/outreach-nightly-prep` (name flexible) | Orchestrate steps 1–7; `prerender = false`; secret-gated |
| `GET` briefing | Staff JWT; assemble or load snapshot |
| Manual “Run prep now” | Staff-only ops escape hatch with same idempotency |

Orchestrator imports Phase 1–4 libs only; send module must not be reachable from cron handler.

---

## UI changes

| Surface | Change |
|---------|--------|
| Daily Agent Briefing | New tab and/or Dashboard top strip in `RepCommandCenter` |
| Deep links | Prospect detail, product drawer, draft composer/send |
| Prep status banner | Success / empty pool / failure |
| Optional | `AIAssistantModal` cold-open deep-link to Briefing — secondary |

Prefer first-class Briefing over burying solely in the AI chat modal.

---

## Business rules

- Nightly job creates drafts only.
- Staff send remains Phase 0 approve-and-send.
- If eligible pool &lt; recommended pace, draft all eligible and surface shortfall on Briefing.
- If over existing pending drafts, do not inflate beyond pace without cancel policy.
- Timezone: define business TZ for “selling day” (document; likely America/Vancouver given BC territory focus).
- Engagement badges and draft badges remain distinct on Line Sheet.

---

## Reusable existing files / functions

- Phase 0 draft insert
- Phase 1 eligibility/selection/allocation
- Phase 2 generate draft
- Phase 3 lead lists
- Phase 4 pace/progress
- `requireApprovedStaffClient` for staff briefing GET
- Shell: `RepCommandCenter`, `TabNav`, `DashboardTab`

---

## New files / components likely required

- Cron API route + auth helper
- `src/lib/outreachNightlyPrep.ts` orchestrator
- `src/components/tabs/AgentBriefingTab.tsx` (or Dashboard modules)
- `outreach_automation_runs` migration
- `vercel.json` cron entry
- Tests for idempotency and “no Resend” invariant

---

## Tests

- Cron without secret → 401/403
- Successful run inserts N drafts, no Resend mock calls
- Second run same day → no duplicate pending drafts
- Empty eligibility → success with zero drafts + reason
- Briefing payload includes all required blocks
- Deep-link ids present for draft/prospect/product
- Orchestrator unit test asserts send helper not imported/called

---

## Acceptance criteria

- [ ] Secure nightly job prepares next-day drafts without sending
- [ ] Idempotent per selling day
- [ ] Failure/partial states visible to staff
- [ ] Daily Agent Briefing shows goal, pace, drafts, channels, Hot/Call Today, Warm, engagement, conversions
- [ ] Navigation from briefing to prospect/product/draft works
- [ ] Staff still sends via existing Product Email path only
- [ ] No autosend, queues-for-dispatch, or business-hour send engine

---

## Dependencies

- Phase 0–4 complete enough to produce real drafts and metrics
- Hosting support for cron (Vercel) or interim external scheduler hitting the same secured endpoint

---

## Non-goals

- Autonomous Outreach Dispatch (autosend, sequences, reply-aware stop, dispatch recovery)
- Overnight sending of any kind
- Replacing Line Sheet as catalog workstation
- Merging Gmail into Briefing as primary send path

---

## Migration / deployment considerations

- Ship cron route + secret before enabling schedule
- Start with manual “Run prep” in staging
- Monitor duration/timeouts (batch AI generation may need chunking / step functions later — out of scope unless required)
- `automation_run_id` on drafts enables support debugging

---

## Risks / edge cases

| Risk | Mitigation |
|------|------------|
| Serverless timeout on large batches | Cap nightly N; chunk; or queue **draft generation only** (still no send) |
| TZ boundary duplicates | Pin run_date in business TZ |
| Cron triggers send by mistake | Code review invariant + test forbid Resend import in cron module |
| Staff ignores Briefing | Optional morning default tab later — product choice |
| Partial AI failures | Save successful drafts; report failures per target |

---

## Completion checklist

- [ ] `outreach_automation_runs` (or equivalent) live
- [ ] Secured nightly prep endpoint
- [ ] Cron configured in deploy
- [ ] Briefing UI with required blocks + navigation
- [ ] Idempotency + failure tests
- [ ] Explicit verification: no overnight Resend
- [ ] Epic loop demoable: prep → review → send → engage → convert → pace update
