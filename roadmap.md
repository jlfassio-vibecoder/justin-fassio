# Dependency upgrade roadmap

Phased plan for the major upgrades Dependabot opened (and CI/Vercel rejected). Do **not** merge those Dependabot PRs as-is — each bumps one package without the rest of the stack.

## Current baseline (keep until a phase lands)

| Package | Current | Failed Dependabot target | Closed PR |
| --- | --- | --- | --- |
| `astro` | `^5.1.5` (lock ~5.18.x) | `7.1.6` | #17 |
| `react` / `@types/react` | `^19.2.x` (Phase 1) | React 19 | #16 |
| `react-dom` / `@types/react-dom` | `^19.2.x` (Phase 1) | React 19 | #8 |
| `typescript` | `^5.9.3` | `7.0.2` | #13 |
| `tailwindcss` | `^3.4.x` | `4.3.3` | #11 |

Related packages already on majors that matter for planning:

- `@astrojs/react` `^6.0.2` (supports React 17–19)
- `@astrojs/tailwind` `^6.0.2` (Tailwind **3** only; peer `tailwindcss@^3`)
- `@astrojs/check` `^0.9.10` (peer TypeScript `^5 \|\| ^6` — **not** 7 yet)
- Node `>=22` (`.nvmrc`); prefer **Node ≥ 22.12** before later Astro/integration majors

## Why the five PRs failed

They are **major** jumps with peer conflicts, not routine patches:

1. **Astro 5 → 7** skips the Astro 6 migration (Vite 7, integration majors, deprecated `@astrojs/tailwind`).
2. **React / react-dom** were split across two PRs; `@types/react-dom@19` requires `@types/react@^19`.
3. **TypeScript 7** is outside `@astrojs/check`’s peer range.
4. **Tailwind 4** conflicts with `@astrojs/tailwind@6`, which still requires Tailwind 3.

**Rule:** one coordinated PR per phase below. Gate every phase with `npm ci && npm run check && npm run build`, then a Vercel preview smoke of the main tabs (Catalog, Calls, Prospects, Dashboard, Insights) and landed-cost calculator.

---

## Phase 0 — Dependabot hygiene (do first)

**Status:** Implemented on `chore/dependabot-hygiene` (pending merge).

Stop the flood of unmergeable majors before more product work.

- [x] Close #8, #11, #13, #16, #17 (if still open).
- [x] Tighten [`.github/dependabot.yml`](.github/dependabot.yml):
  - Lower `open-pull-requests-limit` (e.g. npm `5`, actions `2`).
  - Prefer `groups` for patch/minor npm bumps.
  - Add `ignore` rules for major updates on `astro`, `react`, `react-dom`, `typescript`, `tailwindcss` (and optionally `@types/react*`) until the matching phase below is scheduled.
- [x] Keep merging green **patch/minor** Dependabot PRs as usual.

**Exit:** Weekly Dependabot noise is mostly safe minors; majors only appear when you remove an ignore intentionally.

**Note:** When starting a later roadmap phase (Astro 6, Tailwind 4, etc.), remove that package’s `ignore` entry (or open a one-off upgrade PR) so Dependabot does not fight the coordinated bump.

---

## Phase 1 — React 19 (closes the intent of #8 + #16)

**Status:** Merged via #18.

**Goal:** Move `react`, `react-dom`, `@types/react`, and `@types/react-dom` to 19 **in one PR**.

**Why this order:** `@astrojs/react@6` already allows React 19; this is the least coupled major and unblocks type alignment without touching Astro/Tailwind.

### Work

- [x] Branch from current `main` (e.g. `chore/upgrade-react-19`).
- [x] Bump together:
  - `react`, `react-dom` → 19
  - `@types/react`, `@types/react-dom` → matching 19
- [x] Reinstall (`npm install`) so the lockfile resolves peers together.
- [x] Fix any React 19 type / lint fallout in `src/components/**` (islands, modals, hooks).
- [x] Confirm Testing Library + Vitest still pass (`LogCallModal`, `TabNav`, helpers).

### Verify

- [x] `npm run check` and `npm run build`
- [ ] Manual smoke: tab switching, `LogCallModal`, landed-cost inputs (on Vercel preview / local after merge)

### Notes

- Do **not** reopen Dependabot #8 / #16; supersede them with this PR.
- Leave Astro on 5.x for this phase.
- React 19 types deprecate `FormEvent` for submit handlers — use `SubmitEvent<HTMLFormElement>` instead.

**Exit:** App on React 19 with green CI + preview; README stack line updated to React 19.

---

## Phase 2 — TypeScript (replaces #13; stay conservative)

**Goal:** Keep a supported TypeScript line; do **not** jump to 7 until the Astro tooling peers catch up.

### 2a — Stay on TypeScript 5.x (default / now)

- [ ] Keep `typescript` on the latest **5.x** that `@astrojs/check` and `typescript-eslint` accept.
- [ ] Dependabot: ignore `typescript` major updates (already in Phase 0).

### 2b — TypeScript 6 (optional, after peers allow)

- [ ] When `@astrojs/check` (and ESLint TS stack) clearly support TS 6 in CI with `npm ci` (no `--legacy-peer-deps`), bump in one PR.
- [ ] Re-run `astro check` across `src/` and fix new strictness only if actionable.

### 2c — TypeScript 7 (deferred)

- [ ] Block until `@astrojs/check` peer range includes `^7` (or Astro documents a supported path).
- [ ] Treat Dependabot’s `5.9 → 7.0` PR as permanently superseded until then.

**Exit for “done enough”:** Documented policy (5.x now; 6 when peers allow; 7 deferred). No broken `npm ci` from a solo TS major.

---

## Phase 3 — Astro 5 → 6 (first half of #17)

**Goal:** Land on **Astro 6** with official upgrade tooling — not Astro 7 in one leap.

Astro 6 brings Vite 7, Node 22+, and integration majors. Official path: [`npx @astrojs/upgrade`](https://docs.astro.build/en/guides/upgrade-to/v6/).

**Coupling warning:** `@astrojs/tailwind` is deprecated and does **not** declare Astro 6 peers. Decide Tailwind strategy before or during this phase (see Phase 4). Prefer **not** to run Astro 6 long-term on an unsupported `@astrojs/tailwind` + Tailwind 3 combo.

### Recommended path for this repo

1. **Either** complete Phase 4 (Tailwind 4 + `@tailwindcss/vite`) in the **same** PR as Astro 6  
2. **Or** temporarily wire Tailwind 3 via Vite/PostCSS without `@astrojs/tailwind`, then do Phase 4 immediately after

### Work

- [ ] Branch `chore/upgrade-astro-6`.
- [ ] Run `npx @astrojs/upgrade` (or pin `astro@^6` + matching `@astrojs/*`).
- [ ] Resolve Tailwind path (bundle with Phase 4, or interim PostCSS).
- [ ] Update [`astro.config.mjs`](astro.config.mjs), [`vitest.config.ts`](vitest.config.ts) (`getViteConfig` / Vitest compatibility).
- [ ] Confirm static output still builds (`output: 'static'` if present; `dist/` unchanged intent).
- [ ] Re-verify React islands hydrate on Vercel preview.

### Verify

- [ ] `npm ci` (clean peers)
- [ ] `npm run check` / `npm run build` / `npm run preview`
- [ ] Visual smoke against Organic tokens (colors, type, radii)

**Exit:** Production builds on Astro 6; no reliance on unsupported peer overrides.

---

## Phase 4 — Tailwind CSS 3 → 4 (replaces #11)

**Goal:** Migrate design tokens and build wiring to Tailwind 4’s Vite plugin; remove `@astrojs/tailwind`.

This touches the Organic system in [`tailwind.config.ts`](tailwind.config.ts) and [`src/styles/global.css`](src/styles/global.css) (`@tailwind` → `@import "tailwindcss"`, theme → CSS `@theme`).

### Work

- [ ] Add `tailwindcss@4` + `@tailwindcss/vite`; remove `@astrojs/tailwind` (and likely `autoprefixer` / PostCSS Tailwind pipeline if unused).
- [ ] Register the Vite plugin in `astro.config.mjs` (no `tailwind()` integration).
- [ ] Migrate Organic tokens from `tailwind.config.ts` into CSS `@theme` (or supported v4 config shape).
- [ ] Update `global.css` directives; keep font import + base element styles.
- [ ] Align `prettier-plugin-tailwindcss` with v4 class sorting.
- [ ] Sweep components/tabs for renamed/removed utilities if any appear after build.

### Verify

- [ ] Side-by-side visual pass vs `design/` Organic reference
- [ ] Full `check` + `build` + preview on desktop and mobile widths

**Exit:** Tailwind 4 only; `@astrojs/tailwind` gone; design tokens preserved.

---

## Phase 5 — Astro 6 → 7 (second half of #17; optional)

**Goal:** Only after Astro 6 + Tailwind 4 are stable in production.

- [ ] Read the Astro 7 upgrade guide once published/stable for your pin.
- [ ] Upgrade with `@astrojs/upgrade` or coordinated pins; bump `@astrojs/react` / check as required.
- [ ] Re-run the full verify suite and Vercel production deploy after merge to `main`.

**Exit:** On Astro 7 with green CI, or explicitly defer and keep Astro 6 as the supported floor.

---

## Suggested sequence (summary)

```text
Phase 0  Dependabot ignores / close failed majors
    ↓
Phase 1  React 19 (react + react-dom + types together)
    ↓
Phase 2  TypeScript policy (stay on 5.x; 6 later; 7 blocked)
    ↓
Phase 3  Astro 5 → 6  ──┐
    ↓                   ├── often one PR if Tailwind is migrated together
Phase 4  Tailwind 3 → 4 ┘
    ↓
Phase 5  Astro 6 → 7 (optional, last)
```

## Out of scope for these phases

- Product features (new CRM persistence, auth, etc.)
- Replacing Vitest or ESLint majors unless a phase’s peer deps force it
- Merging Dependabot majors with `--force` / `--legacy-peer-deps` to “make CI green”

## Tracking

Use one PR per phase (or Phases 3+4 combined). After each merge, update this file’s checkboxes and the README stack versions.
