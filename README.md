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

## CI & branch protection

GitHub Actions runs **CI** on every pull request and on pushes to `main` (`npm ci` → `npm run check` → `npm run build`). Dependabot opens weekly PRs for npm and GitHub Actions updates.

To keep `main` merge-safe, configure branch protection in the GitHub UI:

1. Open the repo → **Settings** → **Branches**.
2. Under **Branch protection rules**, click **Add rule** (or edit the existing rule for `main`).
3. Set **Branch name pattern** to `main`.
4. Enable **Require a pull request before merging**.
5. Enable **Require status checks to pass before merging**, then select the **`CI`** check.
6. Enable **Require branches to be up to date before merging** (available after `CI` has run at least once on a PR).
7. Enable **Do not allow bypassing the above settings** if your plan supports it (recommended).
8. Under rules that control force push / deletion, ensure **force pushes** and **branch deletions** are not allowed on `main`.
9. Save the rule.

Note: the **`CI`** status check only appears in the required-checks picker after the workflow has completed at least once on a pull request.

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
