# Product & architecture roadmap

Phased plan derived from [`docs/architecture-assessment.md`](docs/architecture-assessment.md).  
**Branch context:** start work from `main` (or `feature/ai-agent-integration` after foundation phases land).

## How to use (Plan Mode)

Each phase below is sized for **one Plan Mode session → one implementation PR**.

1. Open Plan Mode and paste the phase’s **Plan prompt**.
2. Review the plan; adjust only if exit criteria or out-of-scope need changing.
3. Implement on a dedicated branch; gate with `npm run check` (+ manual smoke listed).
4. Check the phase boxes in this file when the PR merges.

Do **not** combine phases in one plan unless a later phase explicitly lists a dependency merge.

**Rule:** No AI agent / secret-bearing tools until **Phases A–D** are done (persistence + confidentiality decision). Prefer **Phase E** before agents that need server secrets.

---

## Completed — Dependency upgrades (Phases 0–5)

Stack foundation is done on `main` (through [#24](https://github.com/jlfassio-vibecoder/justin-fassio/pull/24) and related PRs):

| Phase | Outcome |
| --- | --- |
| 0 Dependabot hygiene | Major ignores + grouped minors |
| 1 React 19 | `react` / `react-dom` 19.x |
| 2 TypeScript 5.x | Stay on 5.x; TS 6 optional later |
| 3 Astro 5→6 | Vite 7 path, `@astrojs/react` alignment |
| 4 Tailwind 4 | `@tailwindcss/vite`; `@astrojs/tailwind` removed |
| 5 Astro 6→7 | Astro 7 + `@astrojs/react` 6 + Node `>=22.22.3` |

Optional deferred: TypeScript 6 when `@astrojs/check` peers allow a clean `npm ci`.

Also landed (product, not in the old dependency table): public landing, `/rep-login` + buyer `/login`, profiles approval workflow, approved-staff RLS, AuthGate states.

---

## Current baseline (do not regress)

| Layer | State |
| --- | --- |
| Astro | `^7.1.x`, `output: 'static'` |
| React islands | `LoginForm` (`/rep-login`), `AuthGate` (`/app`) |
| Auth | PKCE; profiles `rep`+`pending` on signup; `is_approved_staff()` RLS |
| Data in UI | Static `catalog.ts` / `prospects.ts`; `calls` table unused |
| Hosting | Vercel static + `vercel.json` headers |
| Verify command | `npm ci && npm run check && npm run build` (after Phase A fixes CI) |

---

## Phase A — Foundation trust (P0)

**Status:** Done on `feature/ai-agent-integration` (PR #30)  
**Goal:** Local/CI/docs match the assessment so later phases start from a clean base.  
**Depends on:** nothing  
**Estimate:** small (½–1 day)

### In scope

- [x] Land Vite/`jsxDEV` mitigations if missing on the working branch: `astro dev --force`, `posttypecheck` cache wipe, `optimizeDeps` includes `react/jsx-dev-runtime` ([`astro.config.mjs`](astro.config.mjs), [`package.json`](package.json)).
- [x] Fix [`.github/workflows/ci.yml`](.github/workflows/ci.yml) to use **`npm ci`** (stop deleting `package-lock.json`); keep `@astrojs/compiler` rebuild only if still required on Ubuntu.
- [x] Update [`README.md`](README.md): auth/approval done; persistence outstanding; project structure lists auth + `supabase/`.
- [x] Verify migrations + owner bootstrap on Supabase project `mqsyqxnzpncwdrnugytf` (document result in PR).

### Out of scope

- CRM persistence, agent code, CI format/E2E, CSP.

### Exit criteria

- [x] `npm ci && npm run check && npm run build` green in CI without lockfile deletion.
- [x] Local `/rep-login` works after `npm run check` (no `_jsxDEV` crash).
- [x] README no longer claims auth is “outstanding.”

### Plan prompt

```text
Implement roadmap Phase A (Foundation trust) from roadmap.md.

Read docs/architecture-assessment.md §8 P0 and the Phase A section in roadmap.md.
Make the smallest changes to: land Vite/jsxDEV mitigations (dev --force, posttypecheck, jsx-dev-runtime optimizeDeps), fix CI to npm ci without deleting package-lock.json, update README for auth-done / persistence-outstanding, and note how to verify Supabase migrations on project mqsyqxnzpncwdrnugytf.

Do not implement CRM persistence or AI agents. Exit when npm run check and build pass and Phase A checkboxes can be marked.
```

---

## Phase B — Persist Log Call

**Status:** Done on `feature/ai-agent-integration`  
**Goal:** First domain write path — `LogCallModal` inserts into `calls` under the user JWT + existing RLS.  
**Depends on:** Phase A  
**Estimate:** 1 PR

### In scope

- [x] Map modal fields → `calls` / `CallInsert` ([`src/types/database.ts`](src/types/database.ts)).
- [x] Insert via `supabase.from('calls')` from an approved-staff session; surface errors in the modal.
- [x] On success: close modal + refresh whatever list the Calls tab will use (even if temporary local invalidate).
- [x] Vitest: mock Supabase insert success/failure for the submit path.

### Out of scope

- Dashboard aggregates, catalog DB migration, Export CSV, agent tools.

### Exit criteria

- [x] Approved rep can save a call and see a row in Supabase `calls`.
- [x] Pending/rejected users cannot insert (RLS).
- [x] `npm run check` green.

### Plan prompt

```text
Implement roadmap Phase B (Persist Log Call) from roadmap.md.

Wire src/components/LogCallModal.tsx to insert into Supabase public.calls using the existing browser client and CallInsert types. Respect approved-staff RLS; show errors; refresh Calls UI after success. Add Vitest coverage with mocked supabase.from('calls').

Do not build Dashboard analytics, catalog fetching, or AI agents. Follow existing auth/supabase patterns. Exit when an approved session can persist a call and tests pass.
```

---

## Phase C — Read CRM surfaces

**Status:** Done on `feature/ai-agent-integration`  
**Goal:** Calls, Dashboard, and Insights read from Supabase instead of empty stubs.  
**Depends on:** Phase B  
**Estimate:** 1 PR

### In scope

- [x] Fetch `calls` for approved staff in Calls tab (list + basic filters if already in UI).
- [x] Dashboard: aggregates from `calls` (counts, simple totals — match existing UI slots).
- [x] Insights: drive from real call/objection data where the UI already expects it; keep copy honest if sparse.
- [x] Loading / empty / error states consistent with Organic UI kit.
- [x] Tests for any new pure aggregation helpers.

### Out of scope

- Moving catalog/prospects off static files; Export CSV; server/Edge Functions.

### Exit criteria

- [x] Empty states only when DB is empty, not because UI is hardcoded zeros.
- [x] `npm run check` green; manual smoke of Dashboard + Calls after logging 1–2 calls.

### Plan prompt

```text
Implement roadmap Phase C (Read CRM surfaces) from roadmap.md.

Replace stub zeros/empty shells in DashboardTab, CallsTab, and InsightsTab with reads from Supabase calls (and derived aggregates). Reuse src/lib/supabase.ts and approved-staff session assumptions from AuthGate. Add loading/error/empty states and unit tests for new pure helpers only.

Do not migrate catalog/prospects off static TS or add agent APIs. Exit when CRM tabs reflect persisted calls.
```

---

## Phase D — Directory & catalog confidentiality

**Status:** Done on `feature/ai-agent-integration`  
**Goal:** Stop treating client-bundled `prospects.ts` / `catalog.ts` as acceptable access control.  
**Depends on:** Phase A (B–C recommended first so RLS paths are exercised)  
**Estimate:** 1–2 PRs (plan as one phase; split PR if needed)

### In scope

- [x] Choose and document approach in the PR (prefer authenticated Supabase reads for `catalog_items` + keep prospect ids stable):
  - Seed/migrate catalog into `catalog_items` if not already populated.
  - Load catalog/prospects in the `/app` island **only after** approved-staff session (fetch at runtime).
  - Ensure full corpora are not importable into a public prerender path.
- [x] Prospects: either DB-backed table/storage or runtime fetch of a non-public asset strategy — **must not** remain a static import that ships to anonymous downloaders of `/app` chunks without auth. (Note: true protection may require removing data from the static build graph; plan must state the threat model clearly.)
- [x] Update assessment residual-risk language in README once mitigated or explicitly accepted with owner sign-off.

### Out of scope

- AI agents, buyer portal, per-rep row ownership (Phase G).

### Exit criteria

- [x] Anonymous curl/download of built assets cannot obtain the full prospect phone list + wholesale sheet **or** README records a signed residual-risk acceptance.
- [x] Approved staff still see Catalog + Prospects in-app.
- [x] `npm run check && npm run build` green.

### Plan prompt

```text
Implement roadmap Phase D (Directory & catalog confidentiality) from roadmap.md.

Read docs/architecture-assessment.md gaps G1 and §6. Remove or neutralize public-bundle exposure of src/data/catalog.ts and src/data/prospects.ts for anonymous clients while keeping approved-staff UX in /app. Prefer Supabase-backed catalog_items reads under existing RLS; propose the smallest safe prospects strategy.

Do not add AI agents. Document threat-model outcome in the PR. Exit when build/check pass and exposure is mitigated or formally accepted.
```

---

## Phase E — Server tool boundary

**Status:** Done on `feature/ai-agent-integration`  
**Goal:** A server-side surface that can hold secrets (for agents and privileged ops) without putting service role in `PUBLIC_*`.  
**Depends on:** Phases B–C; D strongly recommended  
**Estimate:** 1 PR

### In scope

- [x] Pick one approach and implement a minimal “health + authorized ping”:
  - **Preferred:** Supabase Edge Function verifying JWT + `is_approved_staff`, or
  - Astro hybrid / `@astrojs/vercel` server route (only if Edge is insufficient).
- [x] Env: document server secrets in `.env.example` (no `PUBLIC_` prefix).
- [x] One authenticated client call from `/app` proving the boundary works.
- [x] Do **not** expose service role to the browser.

### Out of scope

- Full agent orchestration, embeddings, Resend productization.

### Exit criteria

- [x] Unauthenticated callers get 401/403.
- [x] Approved staff can invoke the ping successfully.
- [x] README documents how to run/deploy the function or server route.

### Plan prompt

```text
Implement roadmap Phase E (Server tool boundary) from roadmap.md.

Add the smallest server endpoint (prefer Supabase Edge Function) that validates a Supabase JWT and approved-staff status, with a trivial authenticated ping callable from the /app island. Keep service-role keys server-only. Update .env.example and README.

Do not implement LLM agents yet. Exit when unauthenticated access fails and approved staff can call the ping.
```

---

## Phase F — AI agent integration

**Status:** Done on `feature/ai-agent-integration`  
**Goal:** First useful agent capability on top of persisted CRM + server boundary.  
**Depends on:** Phases B, C, E (D before any agent that can read directories)  
**Estimate:** 1–2 PRs

### In scope

- [x] Define one vertical slice (pick in plan; default: “summarize recent calls / suggest next follow-ups for a prospect”).
- [x] Server-side tool handlers: read `calls` (and only data allowed by policy); never return service role to client.
- [x] Minimal `/app` UI entry (button or panel) to run the slice; show streaming or final text.
- [x] Guardrails: approved-staff only; rate limit or max tokens; no silent writes unless explicitly in scope.
- [x] Tests for tool input validation / auth rejection.

### Out of scope

- Full autonomous multi-agent system, buyer portal AI, embeddings platform (unless required for the single slice).

### Exit criteria

- [x] Approved staff can run the slice against real persisted calls.
- [x] Pending users and anon cannot.
- [x] Secrets stay server-side; `npm run check` green.

### Plan prompt

```text
Implement roadmap Phase F (AI agent integration) from roadmap.md.

Design and implement one vertical agent slice (default: summarize recent calls / suggest follow-ups) using the Phase E server boundary and persisted calls from Phases B–C. Approved-staff only. Add a minimal /app UI trigger and tests for auth rejection.

Do not expand into a full agent platform. Exit when the slice works end-to-end on real data with secrets server-side.
```

---

## Phase G — Multi-rep & owner ops (optional)

**Status:** Not started  
**Goal:** Least-privilege and in-product approval when more than Justin uses the app.  
**Depends on:** Phases B–C  
**Estimate:** 1 PR

### In scope

- [ ] Owner-only RPC or policy to set `profiles.status` / promote roles (users still cannot self-approve).
- [ ] Optional simple owner UI list of pending profiles.
- [ ] Decide invite-only signup vs open register (disable public signups or allowlist).
- [ ] Optional: `calls.created_by` filtering if multi-rep privacy is required.

### Out of scope

- Buyer portal build-out; AI features.

### Exit criteria

- [ ] Owner can approve a pending rep without SQL Editor.
- [ ] Non-owners cannot approve.
- [ ] Signup policy documented in README.

### Plan prompt

```text
Implement roadmap Phase G (Multi-rep & owner ops) from roadmap.md.

Add owner-only approval path for pending profiles (RPC/RLS + minimal UI), keep self-escalation impossible, and document signup policy (invite-only vs open pending). Optional per-rep call filtering only if required for multi-user privacy.

Do not build buyer portal or agents. Exit when an owner can approve a rep in-product.
```

---

## Phase H — Quality bar

**Status:** Not started  
**Goal:** Raise automated confidence around auth and CRM.  
**Depends on:** Phases B–C (run anytime after; best after F for agent tests)  
**Estimate:** 1 PR

### In scope

- [ ] Tests: `LoginForm` flows (mocked), `isApprovedStaff`, AuthProvider loading behavior, call insert mocks if not in B.
- [ ] Extract Prospects filter helper (mirror `catalogFilters`) + unit tests.
- [ ] Add `format:check` to CI.
- [ ] Optional Playwright smoke: unauthenticated `/app` → `/rep-login`; approved session reaches RCC.
- [ ] Harden `vercel.json`: CSP baseline + HSTS; document Supabase Auth redirect allow-list for previews.

### Out of scope

- New product features.

### Exit criteria

- [ ] CI runs lint, typecheck, test, format:check, build.
- [ ] Critical auth/CRM paths have automated coverage beyond AuthGate alone.

### Plan prompt

```text
Implement roadmap Phase H (Quality bar) from roadmap.md.

Expand Vitest coverage for LoginForm, isApprovedStaff, and CRM helpers; extract prospects filters for testability; add format:check to CI; optionally add a minimal Playwright smoke for /app auth redirect. Tighten Vercel security headers (CSP/HSTS) without breaking the app.

No new product features. Exit when CI is stricter and auth/CRM coverage is materially improved.
```

---

## Phase order (summary)

```text
A Foundation trust
    ↓
B Persist Log Call
    ↓
C Read CRM surfaces
    ↓
D Confidentiality (catalog/prospects)     G Owner ops (optional, can parallel after C)
    ↓
E Server tool boundary
    ↓
F AI agent integration
    ↓
H Quality bar (or earlier after C)
```

| Phase | Plan-sized goal |
| --- | --- |
| A | CI/docs/dev trust |
| B | Write `calls` |
| C | Read CRM tabs |
| D | Stop public bundle leak |
| E | Server secrets boundary |
| F | One agent vertical slice |
| G | In-app approval / signup policy |
| H | Tests + CI + headers |

---

## References

- Assessment: [`docs/architecture-assessment.md`](docs/architecture-assessment.md)
- Auth/RLS: `supabase/migrations/20260802220000_profiles_approval_workflow.sql`, `src/lib/auth.ts`, `src/components/auth/*`
- App shell: `src/components/RepCommandCenter.tsx`, `src/components/LogCallModal.tsx`, `src/components/tabs/*`
