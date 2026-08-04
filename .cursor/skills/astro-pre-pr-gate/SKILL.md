---
name: astro-pre-pr-gate
description: Enforces Rep Command Center (Astro 7 + React islands + Supabase) pre-PR quality/security rules and triages Copilot/Cursor Bot PR comments. Use when writing code, reviewing diffs, preparing a pull request, or when the user pastes a PR URL / asks to address bot review comments.
---

# Rep Command Center Pre-PR & Bot Review Gate

Project: **rep-command-center** (`justin-fassio`) — Astro 7 + React 19 islands + TypeScript 5.x + Tailwind 4 + Supabase RLS, deployed on Vercel.

When writing code, editing files, reviewing git diffs, or addressing PR bot comments before shipping, strictly enforce the sections below.

## Project map (use these paths)

| Area | Location |
|------|----------|
| API routes | `src/pages/api/**` (`agent`, `contacts/enrich`, `prospects/*`, `pricing/landed-rates`) |
| Staff auth gate | `src/lib/agentAuth.ts` → `requireApprovedStaffClient` (Bearer JWT → `is_approved_staff`) |
| Browser Supabase client | `src/lib/supabase.ts` (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` only) |
| Design tokens | `src/styles/global.css` (`@theme` Organic tokens) |
| Generated DB types | `src/types/database.ts` |
| RLS / migrations | `supabase/schema.sql`, `supabase/migrations/` |
| App shell / tabs | `src/components/` (React islands under `/app`) |

Domain tables under RLS: `calls`, `catalog_items`, `prospects`, `contacts`, `orders`, and related staff-only data.

---

## 1. Astro & Server Boundary Guardrails

- **Secret Leakage:** Never import server-only secrets (`AI_GATEWAY_API_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SUPABASE_FUNCTIONS_URL`) into client React islands or inline `<script>` tags. Only `PUBLIC_`-prefixed env vars may reach the browser (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, optional `PUBLIC_SITE_URL`).
- **Serverless Endpoints:** Every dynamic API route in `src/pages/api/*` MUST explicitly export `export const prerender = false;`. Same for SSR pages that need auth/session (`src/pages/rep-login.astro`, etc.).
- **Islands Isolation:** React components loaded with `client:load`, `client:visible`, or `client:idle` must never import Node-native modules (`fs`, `path`, `process`) or server-only libs (`resend`, service-role clients, AI gateway server keys).
- **API auth pattern:** Privileged `/api/*` handlers should use `requireApprovedStaffClient(request)` so the Supabase client runs under the caller JWT + `is_approved_staff()` RPC — do not invent a parallel auth path or service-role bypass for domain CRUD.

## 2. Diff Review & Code Quality (Flag Issues Only)

- **Security & RLS:** Ensure all domain reads/writes (calls, prospects, contacts, orders, catalog) enforce `is_approved_staff()` or execute under the user's caller JWT. Never bypass Supabase RLS with the service role from app code unless an existing privileged server path already documents that exception.
- **Cruft Cleanliness:** Remove unintended `console.log` statements, commented-out code blocks, and unhandled `TODO`/`FIXME` items.
- **Design Tokens:** Always map styling through Tailwind CSS 4 `@theme` tokens in `src/styles/global.css` (Organic system — sage, etc.). Avoid one-off hex/rgb that duplicate tokens.
- **Icon Standards:** Use `lucide-react` with `strokeWidth={2.75}`.
- **TypeScript Policy:** Maintain TypeScript `5.x` (`^5.9.3`). Do not introduce `any` or non-null assertions (`!`). Prefer types from `src/types/database.ts` and existing `src/lib/*` helpers.

## 3. Pre-Push Verification Commands

Before marking a task as complete, verify these pass with zero errors:

- `npm run check` — ESLint, `astro check` (via `typecheck`), Prettier format check, and Vitest
- If only Astro diagnostics are needed in isolation: `npx astro check`

---

## 4. PR Bot Comment Triage & Response

When the user provides a PR URL (or asks to address Copilot / Cursor Bot review comments), follow this workflow exactly.

You are a Senior Lead Engineer performing a disciplined code review response.

### STEP 1 — LOAD & TRIAGE

Fetch the PR at the URL below. Extract every Copilot and Cursor Bot comment and produce a numbered triage list before touching any code:

  #  | File | Line | Category | Action
  ---|------|------|----------|-------

Assign one of these categories:

- CRITICAL — security vulnerability, race condition, or logic error → Fix immediately
- PERFORMANCE — measurably improves Big O or reduces DB load without hurting readability → Apply
- STYLE — purely cosmetic or naming-related → Apply only if it matches the dominant pattern in that file; otherwise SKIP
- ARCHITECTURE — conflicts with existing patterns, references nonexistent symbols, or introduces unnecessary abstraction → SKIP
- FALSE POSITIVE — hallucinated variable, wrong file context, or inapplicable suggestion → SKIP

Do not begin Step 2 until the triage table is complete.

### STEP 2 — IMPLEMENTATION RULES

Apply fixes in triage order, one at a time. Follow these constraints:

- Search the codebase for existing utilities or types before writing new ones (prefer `src/lib/*`, `src/types/database.ts`, `requireApprovedStaffClient`)
- Make the smallest targeted change that resolves the comment — do not refactor surrounding code
- Do not introduce new abstractions unless the comment explicitly requires it
- After all changes, verify no TypeScript errors and no broken imports (`npm run check`)
- Do not convert Astro React islands (`client:load` / `client:visible` / `client:idle`) to server-only components or vice-versa unless explicitly addressing an island/server boundary error
- Still enforce sections 1–3 above while applying fixes

### STEP 3 — DEVIATION LOG

For every SKIP decision, add a single inline comment immediately above or at the relevant line:

  // Copilot suggestion ignored: [one-sentence reason]

Then produce a final summary in this format:

  APPLIED (#1, #3, #5): [one-line description of each change]
  SKIPPED (#2, #4): [one-line reason for each skip]
  BUILD STATUS: [clean / issues found]

---
PR URL:
