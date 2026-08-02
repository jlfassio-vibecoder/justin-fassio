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

New signups create a `profiles` row with `role = 'rep'` and `status = 'pending'`. The `/app` gate shows a pending screen until an owner approves the account. Domain tables (`calls`, `catalog_items`, etc.) are RLS-restricted to approved staff via `is_approved_staff()`.

Apply migrations in order (SQL Editor or `supabase db push`), including
[`supabase/migrations/20260802220000_profiles_approval_workflow.sql`](supabase/migrations/20260802220000_profiles_approval_workflow.sql).

Bootstrap Justin as owner (run once):

```sql
update public.profiles
set role = 'owner', status = 'approved', updated_at = now()
where email = 'office@justinfassio.com';
```

Approve a pending rep:

```sql
update public.profiles
set status = 'approved', role = 'rep', updated_at = now()
where email = 'new.rep@example.com';
```

In Supabase Auth → URL configuration, set the Site URL and add redirect allow-list entries for `/app` and `/rep-login` on production (`https://justinfassio.com`, `https://justin-fassio.vercel.app`) and local (`http://localhost:4321`).

**Note:** Catalog/prospect UI data still ships in the static client bundle. RLS protects Supabase rows once persistence is wired; moving sensitive directories behind authenticated fetches is a later phase.

## Getting started

Requires **Node ≥ 22.22.3** (see `.nvmrc`).

```sh
npm install
npm run dev           # start local dev server
npm run check         # lint + typecheck + unit/component tests
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
2. Keep GitHub Actions / local `npm run check` green before merge.
3. Merge to **`main`** → Vercel runs an automated **Production** deploy.

GitHub Actions (when configured) remains the quality gate; Vercel runs its own build for each deploy.

## Project structure

```
src/
  components/
    ui/            shared primitives (Button, Card, Tag, Input, Dialog)
    tabs/           the 5 screens (Catalog, Dashboard, Calls, Prospects, Insights)
    Header.tsx      brand mark, line switcher, Log Call / Export CSV actions
    TabNav.tsx      pill tab bar
    LogCallModal.tsx
    RepCommandCenter.tsx   top-level state + layout
  data/
    catalog.ts      190-item wholesale catalog (typed)
    prospects.ts     249-record BC retailer directory (typed)
  hooks/
    useLandedCostCalculator.ts   shared FX/freight derived state
  layouts/Layout.astro
  pages/index.astro
  styles/global.css   Google Fonts import + Tailwind 4 `@theme` Organic tokens
```

## Dependency upgrades

Stack majors from Dependabot (#8, #11, #13, #16, #17) were handled via coordinated phases in [`roadmap.md`](roadmap.md). **Phases 0–5 are done** (React 19, TypeScript 5.x policy, Astro 7, Tailwind 4). Optional follow-up: TypeScript 6 when desired.

## Notes

- The PMF Dashboard, Call Pipeline, and Buyer Insights reaction cloud are intentionally zero/empty states — no seed data. They populate once real call-logging and persistence are wired up.
- The Log Call modal's Save action currently just closes the modal; there is no persistence layer yet.
- The line switcher only has data for "Old Guys Rule" today; "Busted Knuckles Garage" shows a dismissible "coming soon" notice per the design spec.
- Foundational shipping path is in place (CI, Dependabot hygiene, Vercel static deploys on `main`). Product depth — persistence, auth, multi-line catalog data, and anything beyond client-side React state — is still outstanding and was out of scope for the dependency roadmap.
