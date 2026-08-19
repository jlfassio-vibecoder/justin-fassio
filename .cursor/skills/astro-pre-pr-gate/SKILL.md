---
name: astro-pre-pr-gate
description: Enforces Rep Command Center (Astro 7 + React islands + Supabase) quality and security before code is pushed or a pull request is created. Use when writing or editing code, reviewing git diffs, committing, pushing, creating a PR, preparing a pull request, or running npm run check. Do not use after GitHub review comments exist — that is the pr-triage rule.
---

# Rep Command Center Pre-PR Gate

Project: **rep-command-center** (`justin-fassio`) — Astro 7 + React 19 islands + TypeScript 5.x + Tailwind 4 + Supabase RLS, deployed on Vercel.

Run this skill **before** `git push` and **before** creating a pull request. Do not wait until Copilot or Cursor Bot have commented.

When writing code, editing files, or reviewing git diffs before shipping, strictly enforce the sections below.

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

Before marking a task as complete, and **before** `git push` or opening a PR, verify these pass with zero errors:

- `npm run check` — ESLint, `astro check` (via `typecheck`), Prettier format check, and Vitest
- If only Astro diagnostics are needed in isolation: `npx astro check`

---

## Out of scope

After a PR exists and GitHub review comments land, follow `.cursor/rules/pr-triage.mdc`. Do not run that bot-comment workflow before push or PR creation.
