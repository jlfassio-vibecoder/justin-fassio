# AI agent roadmap

Phased plan for sales-rep AI after product Phases A–H.  
Companion to `[roadmap.md](roadmap.md)`. Derived from the dual-architecture plan (Vercel AI SDK + Supabase Edge tools).

**Branch context:** continue from `feature/ai-agent-integration` (or `main` after that work merges).

## How to use (Plan Mode)

Each phase below is sized for **one Plan Mode session → one implementation PR** (Phase III may be multiple PRs, one slice each).

1. Open Plan Mode and paste the phase’s **Plan prompt**.
2. Review the plan; adjust only if exit criteria or out-of-scope need changing.
3. Implement on a dedicated branch; gate with `npm run check` (+ manual smoke listed).
4. Check the phase boxes in this file when the PR merges.

Do **not** combine phases in one plan unless a later phase explicitly lists a dependency merge.

---

## Locked architecture

**Streaming chat UX → Vercel AI SDK + AI Gateway.**  
**CRM-bound reads/tools → Supabase Edge (or JWT + RLS from the Vercel route).**  
**Never** put provider keys in `PUBLIC_`* or React islands.


| Layer                                                     | Responsibility                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `[src/pages/api/agent.ts](src/pages/api/agent.ts)` + `ai` | Streaming assist + CRM read tools under JWT + RLS; Gateway (`openai/gpt-4o`); OIDC / `AI_GATEWAY_API_KEY` |
| Supabase Edge (`authorized-ping`, later non-LLM tools)    | Auth boundary / ops ping under user JWT + RLS                                                             |
| Client islands                                            | Bearer to `/api/*` or `functions.invoke`; no LLM secrets                                                  |


```text
React /app
  ├─ Bearer JWT ─► Astro /api/agent (streamText + CRM tools → AI Gateway)
  └─ JWT invoke ─► Supabase Edge (authorized-ping; no LLM Suggest)
```

**Astro hosting:** `output: 'static'` + `@astrojs/vercel`; only selected routes set `export const prerender = false` (e.g. `/api/agent`). Do not SSR the whole site unless a later phase explicitly requires it.

---

## Phase 0 — AI SDK baseline (shipping)

**Status:** Done on `feature/ai-agent-integration` (`a4d6ea2`)  
**Goal:** On-demand streaming agent endpoint + minimal UI without ripping out Edge CRM tools.

### Delivered

- [x] Dependencies: `ai`, `@astrojs/vercel`; adapter in `[astro.config.mjs](astro.config.mjs)`.
- [x] `[src/pages/api/agent.ts](src/pages/api/agent.ts)`: `prerender = false`; approved-staff JWT gate; `prompt` or `messages`; `streamText` + `toTextStreamResponse` (AI SDK 5; replaces older `toDataStreamResponse`).
- [x] `[AIAssistantModal](src/components/ui/AIAssistantModal.tsx)` + **AI assist** in `[AuthGate](src/components/auth/AuthGate.tsx)`.
- [x] Docs: `.env.example` (`AI_GATEWAY_API_KEY`), README dual-runtime note; `.env.*` gitignore covers `.env.local`.
- [x] ESLint/Prettier ignore `.vercel/**` (adapter build output).

### Exit criteria (met)

- [x] `npm run check` + `npm run build` green.
- [x] Unauthenticated `/api/agent` → 401; invalid JWT → 401.
- [x] Edge `authorized-ping` left intact (LLM Suggest later retired in Phase III slice 4).

### Local Gateway auth

- Prefer: `vercel link` then `vercel env pull` (OIDC for AI Gateway).
- Or: set `AI_GATEWAY_API_KEY` in `.env.local`.

---

## Phase I — Agent tools on the Vercel route

**Status:** Done  
**Goal:** Give `/api/agent` read tools over CRM data under the caller’s JWT + RLS (no browser secrets).  
**Depends on:** Phase 0  
**Estimate:** 1 PR

### In scope

- [x] AI SDK `tools` on `/api/agent` that create a user-scoped Supabase client from the request Bearer token and read under RLS — **or** thin HTTP wrappers that invoke existing Edge functions with the same JWT.
- [x] First tools (prospect/call select shapes matching the former Edge Suggest reads):
  - `getProspectSummary` — prospect `id,name,category,region,city,fit`
  - `listRecentCalls` — recent calls for a `prospect_id` (date, outcome, contact, PMF, notes truncated, tags, follow_up)
- [x] Guardrails: `stopWhen` / max steps; token caps; approved-staff only (keep existing gate).
- [x] Prefer **not** duplicating OpenAI secrets on Vercel for CRM tools that already work on Edge until streaming-with-tools in one turn requires it.

### Out of scope

- Multi-turn chat UX overhaul (Phase II); product-specific objection/call-draft UIs (Phase III).

### Exit criteria

- [x] Approved staff can ask a question that triggers tools and gets a grounded reply from real prospect/call data.
- [x] Non-approved / anon cannot invoke tools usefully (401/403).
- [x] `npm run check` green; no `PUBLIC_*` LLM keys.

### Plan prompt

```text
Implement AI agent roadmap Phase I (Agent tools on the Vercel route) from ai-agent-roadmap.md.

Add AI SDK tools on /api/agent that read prospects and recent calls with the user JWT under RLS (or wrap existing Edge functions). First tools: getProspectSummary and listRecentCalls matching prior CRM select shapes. Keep max steps/token caps and approved-staff auth. Do not move OpenAI secrets to Vercel unless required for streaming-with-tools.

Do not rebuild the chat UI (Phase II) or ship objection/call-draft product slices. Exit when an approved session can get tool-grounded answers from real CRM data.
```

---

## Phase II — Chat UX upgrade

**Status:** Done  
**Goal:** Multi-turn streaming chat UX for sales assist.  
**Depends on:** Phase 0 (Phase I recommended so chats can use tools)  
**Estimate:** 1 PR

### In scope

- [x] Replace one-shot prompt modal with `@ai-sdk/react` `useChat` + server `toUIMessageStreamResponse` (keep `toTextStreamResponse` only if it remains sufficient after review).
- [x] Context chips / prefills from Prospects row and/or Log Call outcome (pass into initial message or system context).
- [x] Persist optional chat threads later — **not** required for this phase.

### Out of scope

- Full conversation history product; embeddings; buyer portal AI.

### Exit criteria

- [x] Approved staff can run a multi-turn assist session in `/app` with live streaming.
- [x] Prefill from at least one CRM surface (Prospects or Log Call) works.
- [x] `npm run check` green.

### Plan prompt

```text
Implement AI agent roadmap Phase II (Chat UX upgrade) from ai-agent-roadmap.md.

Upgrade AIAssistantModal (or successor) to @ai-sdk/react useChat with toUIMessageStreamResponse on /api/agent. Add context prefills from Prospects and/or Log Call. Do not persist chat threads yet. Keep approved-staff auth.

Do not ship new product agent slices (Phase III). Exit when multi-turn streaming assist works with CRM prefills.
```

---

## Phase III — Product agent slices

**Status:** Done  
**Goal:** Ship roadmap-aligned verticals one PR at a time.  
**Depends on:** Phases 0–I (II recommended for streaming UX)  
**Estimate:** 1 PR per slice

### Slices (separate PRs)

1. **Objection handling** — prompt + catalog / `objection_tags` context. **Done** (shared `[objectionCatalog](src/lib/objectionCatalog.ts)`; Insights tag click + Calls **Coach** → assist drafts).
2. **Call draft generation** — outcome → email/script draft. **Done** (shared `[callOutcomes](src/lib/callOutcomes.ts)` + `buildCallDraft`; Log Call **Draft as** + Calls **Draft**).
3. **Prospect summarization streaming** — replace final-text Edge Prospects **Suggest** UI. **Done** (Prospects **Suggest** → streaming assist via `buildSuggestDraft`; Edge no longer invoked from UI).
4. **Routing decision** — **Done: retire** Edge `suggest-follow-ups` (client wrapper + Edge function removed from repo). Streaming Suggest on `/api/agent` is the source of truth; wrapping as a tool would duplicate `getProspectSummary` + `listRecentCalls` + Gateway LLM.
5. **Account Product Fit (APF) v1** — AI tool + prompt evaluating prospect category, region, and catalog mapping to return an initial fit score and rationale.
    - *In Scope:* Heuristic/prompt-based scoring tool `getAccountProductFit`) using current prospect record and catalog context.
    - *Out of Scope:* Dynamic feedback loops using historical successful call data (deferred to future iteration). 
  1.  T**ool Name:** `getAccountProductFit`**Inputs:** `prospect_id` (fetches prospect category, region, city, and fit tags via JWT/RLS) + target `line_id` (e.g., *Old Guys Rule*).**Outputs:**
    1. **Fit Score & Rationale:** Score (1–10) based on category alignment and regional fit.
    2. **Background Summary:** A 2–3 sentence executive briefing on the retailer's vibe, customer base, and market position.
    3. **Initial Call / Walk-In Script:** A conversational, human pitch script formatted with:
      - **The Opener/Hook:** Friendly introduction tailored to their region/store style.
      - **Featured Product Anchor:** 1–2 specific catalog items that best fit their store.
      - **Call to Action / Next Step:** Requesting a 5-minute meeting, leave-behind sheet, or sample review.

### Out of scope

- Building all four slices in one PR; silent CRM writes unless a slice explicitly includes them.
- Undeploying the cloud Edge function (ops: `supabase functions delete suggest-follow-ups` if still deployed).

### Exit criteria (per slice PR)

- [x] Approved staff can run the slice end-to-end on real data.
- [x] Secrets stay server-side; `npm run check` green.
- [x] Edge Suggest routing decision documented and applied (**retire**).

### Plan prompt (template)

```text
Implement AI agent roadmap Phase III slice: <Objection handling | Call draft | Prospect summarization streaming | Edge Suggest retire> from ai-agent-roadmap.md.

Use the Phase 0/I/II dual runtime (Vercel /api/agent + Edge authorized-ping as needed). Approved-staff only. One vertical only.

Do not ship the other Phase III slices in this PR. Exit when the slice works on real CRM context with secrets server-side.
```

---

## Phase IV — Ops & hardening

**Status:** Not started  
**Goal:** Production guardrails and documented dual runtime.  
**Depends on:** Phase 0 (best after I–II have real traffic patterns)  
**Estimate:** 1 PR

### In scope

- [ ] Rate limits / spend caps on `/api/agent`.
- [ ] CSP review if AI Gateway (or other) origins expand beyond current `[vercel.json](vercel.json)`.
- [ ] Vitest for agent route auth rejection (mock `streamText`).
- [ ] Update `[docs/architecture-assessment.md](docs/architecture-assessment.md)` and cross-link from `[roadmap.md](roadmap.md)`: dual runtime (Edge + Vercel on-demand).

### Out of scope

- New agent product features.

### Exit criteria

- [ ] Unauthenticated agent calls fail in automated tests.
- [ ] Rate/spend control documented and enforced at the route (or platform) layer.
- [ ] Assessment reflects dual AI runtime; `npm run check` green.

### Plan prompt

```text
Implement AI agent roadmap Phase IV (Ops & hardening) from ai-agent-roadmap.md.

Add rate/spend caps for /api/agent, Vitest coverage for auth rejection (mock streamText), CSP review if needed, and update architecture assessment + roadmap cross-links for the dual Edge + Vercel AI runtime.

No new agent product features. Exit when CI covers auth failure and docs match the dual architecture.
```

---

## Phase order (summary)

```text
0 AI SDK baseline (/api/agent + AI assist)     ← done
    ↓
I  Tools on /api/agent (JWT + RLS CRM reads)   ← done
    ↓
II Chat UX (useChat + prefills)               ← done
    ↓
III Product slices (one PR each)              ← done (retire Edge Suggest)

    ↓
IV Ops & hardening
```


| Phase | Plan-sized goal                                             |
| ----- | ----------------------------------------------------------- |
| 0     | Streaming baseline + staff gate                             |
| I     | Tool-grounded CRM reads                                     |
| II    | Multi-turn chat UX                                          |
| III   | Objection / draft / streaming Suggest; Edge Suggest retired |
| IV    | Limits, tests, docs                                         |


---

## Explicit non-goals

- Provider keys in `PUBLIC_*` or React islands.
- Full multi-agent orchestration platform in one PR.
- Replacing all Edge Functions with Vercel in Phase 0 (or as a drive-by in I–III).
- Astro middleware / SSR for all pages — keep `output: 'static'` + selective `prerender = false`.

---

## References

- Product roadmap: `[roadmap.md](roadmap.md)` (Phases A–H)
- Assessment: `[docs/architecture-assessment.md](docs/architecture-assessment.md)`
- Edge ping: `[supabase/functions/authorized-ping/index.ts](supabase/functions/authorized-ping/index.ts)`
- Agent route: `[src/pages/api/agent.ts](src/pages/api/agent.ts)`
- Assist UI: `[src/components/ui/AIAssistantModal.tsx](src/components/ui/AIAssistantModal.tsx)`

