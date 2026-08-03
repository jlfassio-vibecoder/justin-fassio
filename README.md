# Rep Command Center

A rep-tools web app for Justin Fassio, an independent multi-line sales rep in British Columbia: a wholesale line sheet with a live landed-cost calculator, a PMF-scoring call/pipeline CRM, a BC retailer prospect directory, and buyer-objection reference material.

Built with **Astro + React + TypeScript + Tailwind CSS**, recreating the `design/` handoff package's **Organic** design system (colors, type, spacing, radii) via Tailwind `@theme` tokens in `src/styles/global.css`.

## Stack

- [Astro 7](https://astro.build/) — static site framework, React island for the interactive app shell
- [React 19](https://react.dev/) + TypeScript — the `RepCommandCenter` app and its tabs
- [Tailwind CSS 4](https://tailwindcss.com/) — utility classes mapped to Organic design tokens via `@tailwindcss/vite` + CSS `@theme`
- [lucide-react](https://lucide.dev/) — icons, stroke-width 2.75 to match the design reference

### TypeScript policy

Stay on **TypeScript 5.x** (currently `^5.9.3`, the latest 5.x). The dependency upgrade [`roadmap.md`](roadmap.md) (Phases 0–5) is complete on `main`; do not take Dependabot majors to TypeScript 6 or 7 without a dedicated PR:

- **5.x** — current supported line (`@astrojs/check` + `typescript-eslint` green with `npm ci`)
- **6.x** — optional later (roadmap Phase 2b), only when peers allow a clean `npm ci` (no `--legacy-peer-deps`)
- **7.x** — blocked until `@astrojs/check` declares support

Dependabot already ignores `typescript` major updates (Phase 0).

## Routes

- `/` — public Justin Fassio landing
- `/login` — Buyer Portal (coming soon) with a link to the rep portal
- `/rep-login` — Rep / Owner Auth (magic link, password, or register)
- `/app` — Rep Command Center (approved `owner` / `rep` only)

### Auth & approval

**Signup policy:** Open self-registration at `/rep-login`. New accounts get `role = 'rep'` and `status = 'pending'` (no self-approval). Access stays blocked until an **approved owner** approves them. Public Auth signups are not disabled; the pending gate is the control.

Domain tables (`calls`, `catalog_items`, `prospects`, etc.) are RLS-restricted to approved staff via `is_approved_staff()`.

**In-product approval (Phase G):** An approved owner signed into `/app` can use **Pending reps** to list pending profiles and Approve / Reject via owner-only RPCs (`list_pending_profiles`, `set_profile_status`). Non-owners cannot invoke those RPCs. Approving does not change `role` (stays `rep`). Promoting someone to `owner` remains a SQL bootstrap step.

Apply migrations in order (SQL Editor or `supabase db push`), including the approval workflow and
[`supabase/migrations/20260802260000_owner_approval_rpcs.sql`](supabase/migrations/20260802260000_owner_approval_rpcs.sql).

Bootstrap the first owner (run once if needed):

```sql
update public.profiles
set role = 'owner', status = 'approved', updated_at = now()
where email = 'office@justinfassio.com';
```

Fallback SQL approve (prefer **Pending reps** in `/app`):

```sql
update public.profiles
set status = 'approved', role = 'rep', updated_at = now()
where email = 'new.rep@example.com';
```

### Auth redirect allow-list (Supabase)

In **Supabase → Authentication → URL configuration**:

- **Site URL:** production origin (e.g. `https://justinfassio.com` or `https://justin-fassio.vercel.app`).
- **Redirect URLs** must include every host that completes magic-link / email confirm into `/app` or `/rep-login`:
  - Production: `https://justinfassio.com/app`, `https://justinfassio.com/rep-login` (and the `justin-fassio.vercel.app` equivalents if used).
  - Local: `http://localhost:4321/app`, `http://localhost:4321/rep-login`.
  - **Vercel previews:** each preview deployment has a unique host (`https://<project>-<hash>-<team>.vercel.app`). Add specific preview URLs when testing auth on a PR, or maintain a documented wildcard if your Supabase plan supports redirect wildcards. Missing preview hosts cause magic-link failures on Preview only.

### Security headers

[`vercel.json`](vercel.json) sets `Strict-Transport-Security` (HSTS) and a baseline `Content-Security-Policy` (allows self, Google Fonts, and `*.supabase.co` / realtime websockets). Existing nosniff / Referrer-Policy / frame / Permissions-Policy headers remain.

<!-- // Copilot suggestion ignored: Phase H locked script-src unsafe-inline for Astro static hydration; nonce pipeline out of scope. -->

**Note:** Catalog and prospect directories load at runtime from Supabase (`catalog_items`, `prospects`) under `is_approved_staff()` RLS. They are not embedded in the public `/app` JS bundle. Seed sources for regenerating migrations live under `scripts/seed-source/` (not imported by the client).

## Getting started

Requires **Node ≥ 22.22.3** (see `.nvmrc`). Prefer **`npm ci`** for a lockfile-reproducible install (CI uses the same). Root `optionalDependencies` pin Linux `*-linux-x64-gnu` native packages (Astro compiler, Rolldown, Lightning CSS, Tailwind oxide, satteri) so ESLint/`astro check` work on Ubuntu CI despite npm’s optional-dep bugs.

```sh
npm ci
npm run dev           # astro dev --force (avoids stale Vite jsxDEV / optimize-deps cache)
npm run check         # lint + typecheck + format:check + unit/component tests
npm run test          # Vitest single run
npm run test:watch    # Vitest watch mode
npm run format        # write formatting
npm run build         # type-check + production build
npm run preview       # preview the production build
```

Day-to-day: `npm run check` before you push; `npm run format` when you want Prettier to rewrite.

## Deployment & Environments

Hosted on **Vercel** as a static Astro site (`output: 'static'`). Production: [justin-fassio.vercel.app](https://justin-fassio.vercel.app).

### Local production preview

```sh
npm run build
npm run preview
```

### Environment variables

1. Copy [`.env.example`](.env.example) to `.env` for local overrides (optional today — nothing is required to build).
2. Astro conventions:
   - `PUBLIC_*` — available in the browser; never put secrets here.
   - Other keys — server/build-time only; do not import them in client React islands.
3. Set real values in **Vercel → Project → Settings → Environment Variables** for Production, Preview, and Development as needed.

`.env` / `.env.*` are gitignored; `.env.example` is tracked.

Resend (server-only): set `RESEND_API_KEY` in `.env` to your real key (replace `re_xxxxxxxxx`), then run `npm run email:test`. Do not use a `PUBLIC_` prefix — the key must never ship to the browser.

### Connect GitHub → Vercel (previews + production)

If the project is not already linked:

1. Open the [Vercel Dashboard](https://vercel.com/dashboard) → **Add New… → Project** (or confirm the existing project for `jlfassio-vibecoder/justin-fassio`).
2. Framework Preset: **Astro**; Root Directory: `/`; Production Branch: **`main`**.
3. Leave Preview Deployments enabled for pull requests (default).
4. Add any env vars from `.env.example` under Project Settings → Environment Variables.

### Deployment lifecycle

1. Open a pull request → Vercel posts an isolated **Preview** URL for visual testing.
2. Keep [GitHub Actions CI](.github/workflows/ci.yml) / local `npm run check` green before merge.
3. Merge to **`main`** → Vercel runs an automated **Production** deploy.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) is the quality gate (`npm ci`, check, build); Vercel runs its own build for each deploy.

## Project structure

```
src/
  components/
    auth/          AuthGate, LoginForm, AuthProvider, approval / wrong-portal screens
    ui/            shared primitives (Button, Card, Tag, Input, Dialog)
    tabs/          Catalog, Dashboard, Calls, Prospects, Insights
    Header.tsx     brand mark, line switcher, Log Call / Export CSV actions
    TabNav.tsx     pill tab bar
    LogCallModal.tsx
    RepCommandCenter.tsx
  data/            landing.ts (directories load from Supabase; seed sources in scripts/seed-source/)
  hooks/           useAuth.ts, useLandedCostCalculator.ts
  lib/             supabase.ts, auth.ts, catalog.ts, prospects.ts, calls.ts, callAggregates.ts, …
  layouts/Layout.astro
  pages/           index.astro, login.astro, rep-login.astro, app/index.astro
  styles/global.css
supabase/
  migrations/      schema history (profiles + approved-staff RLS)
  schema.sql       end-state snapshot
docs/
  architecture-assessment.md
```

## Roadmap

- **Dependency Phases 0–5** (React 19, TypeScript 5.x, Astro 7, Tailwind 4) are done — see the archive section in [`roadmap.md`](roadmap.md).
- **Product Phases A–H** (foundation trust → CRM persistence → confidentiality → server boundary → AI agent) are the active plan in [`roadmap.md`](roadmap.md). Assessment: [`docs/architecture-assessment.md`](docs/architecture-assessment.md).

Optional deferred: TypeScript 6 when `@astrojs/check` peers allow a clean `npm ci`.

## Notes

- Auth and approval are shipped (`/rep-login`, `/app` AuthGate, profiles + `is_approved_staff()` RLS).
- Log Call Save persists to Supabase `calls` for approved staff (RLS). Dashboard, Calls (search/filters), and Insights read from those rows — empty UI only when the DB has no calls.
- The line switcher only has data for "Old Guys Rule" today; "Busted Knuckles Garage" shows a dismissible "coming soon" notice per the design spec.
- Catalog + prospect directories are fetched after approved-staff session from Supabase (not in the static `/app` bundle). Residual: a stolen approved JWT or post-login network capture can still read the full corpora; there is no per-rep call row ownership yet (`calls.created_by` deferred).
- **Owner ops (Phase G):** Open signup + pending gate; approved owners approve/reject from `/app` → **Pending reps**. Shared domain CRUD for all approved staff remains.
- **Server tools (Phase E):** Edge Function `authorized-ping` verifies JWT + `is_approved_staff`. From an approved `/app` session, use **Ping server** in the AuthGate chrome. Deploy with `supabase functions deploy authorized-ping`; local: `supabase functions serve authorized-ping`. Document `SUPABASE_SERVICE_ROLE_KEY` in `.env.example` for future privileged ops — never put it under `PUBLIC_*` or in client islands.
- **AI follow-ups (Phase F):** Edge Function `suggest-follow-ups` reads one prospect’s recent calls under RLS, calls OpenAI server-side, and returns a summary + follow-up list (display-only). From Prospects, use **Suggest** on a store with logged calls. Deploy with `supabase functions deploy suggest-follow-ups` (also redeploy `authorized-ping` after shared auth changes). Set `supabase secrets set OPENAI_API_KEY=...`. Never put the OpenAI key under `PUBLIC_*` or in client islands.
