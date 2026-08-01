# Rep Command Center

A rep-tools web app for Justin Fassio, an independent multi-line sales rep in British Columbia: a wholesale line sheet with a live landed-cost calculator, a PMF-scoring call/pipeline CRM, a BC retailer prospect directory, and buyer-objection reference material.

Built with **Astro + React + TypeScript + Tailwind CSS**, recreating the `design/` handoff package's **Organic** design system (colors, type, spacing, radii) via Tailwind config tokens.

## Stack

- [Astro](https://astro.build/) — static site framework, React island for the interactive app shell
- [React 18](https://react.dev/) + TypeScript — the `RepCommandCenter` app and its tabs
- [Tailwind CSS](https://tailwindcss.com/) — utility classes mapped to Organic design tokens in `tailwind.config.ts`
- [lucide-react](https://lucide.dev/) — icons, stroke-width 2.75 to match the design reference

## Getting started

Requires **Node 22+** (see `.nvmrc`).

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
  styles/global.css   Google Fonts import + Tailwind layers
```

## Notes

- The PMF Dashboard, Call Pipeline, and Buyer Insights reaction cloud are intentionally zero/empty states — no seed data. They populate once real call-logging and persistence are wired up.
- The Log Call modal's Save action currently just closes the modal; there is no persistence layer yet.
- The line switcher only has data for "Old Guys Rule" today; "Busted Knuckles Garage" shows a dismissible "coming soon" notice per the design spec.
