# Dependency upgrade roadmap

Phased plan for the major upgrades Dependabot opened (and CI/Vercel rejected). Do **not** merge those Dependabot PRs as-is — each bumps one package without the rest of the stack.

**Status:** Phases **0–5 are complete** on `main` (through [#24](https://github.com/jlfassio-vibecoder/justin-fassio/pull/24)). Remaining open boxes below are **optional / deferred** (TypeScript 6), not blockers for this roadmap.

## Current baseline (keep until a phase lands)

| Package | Current | Failed Dependabot target | Closed PR |
| --- | --- | --- | --- |
| `astro` | `^7.1.x` (Phase 5) | `7.1.6` | #17 |
| `react` / `@types/react` | `^19.2.x` (Phase 1) | React 19 | #16 |
| `react-dom` / `@types/react-dom` | `^19.2.x` (Phase 1) | React 19 | #8 |
| `typescript` | `^5.9.3` (Phase 2: stay on 5.x) | `7.0.2` | #13 |
| `tailwindcss` | `^4.3.x` (Phase 4; `@tailwindcss/vite`) | `4.3.3` | #11 |

Related packages already on majors that matter for planning:

- `@astrojs/react` `^6.0.2` (Astro 7 / Vite 8; React 17–19)
- `@astrojs/tailwind` **removed** (Phase 4) — Tailwind via `@tailwindcss/vite`
- `@astrojs/check` `^0.9.10` (peer TypeScript `^5 \|\| ^6` — **not** 7 yet)
- Node `>=22.22.3` (`.nvmrc` `22.22.3`)

## Why the five PRs failed

They are **major** jumps with peer conflicts, not routine patches:

1. **Astro 5 → 7** skips the Astro 6 migration (Vite 7, integration majors, deprecated `@astrojs/tailwind`).
2. **React / react-dom** were split across two PRs; `@types/react-dom@19` requires `@types/react@^19`.
3. **TypeScript 7** is outside `@astrojs/check`’s peer range.
4. **Tailwind 4** conflicts with `@astrojs/tailwind@6`, which still requires Tailwind 3.

**Rule:** one coordinated PR per phase below. Gate every phase with `npm ci && npm run check && npm run build`, then a Vercel preview smoke of the main tabs (Catalog, Calls, Prospects, Dashboard, Insights) and landed-cost calculator.

---

## Phase 0 — Dependabot hygiene (do first)

**Status:** Merged via #19.

Stop the flood of unmergeable majors before more product work.

- [x] Close #8, #11, #13, #16, #17 (if still open).
- [x] Tighten [`.github/dependabot.yml`](.github/dependabot.yml):
  - Lower `open-pull-requests-limit` (e.g. npm `5`, actions `2`).
  - Prefer `groups` for patch/minor npm bumps.
  - Add `ignore` rules for major updates on `astro`, `react`, `react-dom`, `typescript`, `tailwindcss` (and optionally `@types/react*`) until the matching phase below is scheduled.
- [x] Keep merging green **patch/minor** Dependabot PRs as usual.

**Exit:** Weekly Dependabot noise is mostly safe minors; majors only appear when you remove an ignore intentionally.

**Note:** Coordinated majors for Phases 1–5 are done. Keep Dependabot major `ignore`s in place unless you intentionally schedule the next major (e.g. optional TypeScript 6).

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
- [x] Manual smoke: tab switching, `LogCallModal`, landed-cost inputs (on Vercel preview / local after merge)

### Notes

- Do **not** reopen Dependabot #8 / #16; supersede them with this PR.
- Leave Astro on 5.x for this phase.
- React 19 types deprecate `FormEvent` for submit handlers — use `SubmitEvent<HTMLFormElement>` instead.

**Exit:** App on React 19 with green CI + preview; README stack line updated to React 19.

---

## Phase 2 — TypeScript (replaces #13; stay conservative)

**Status:** Merged via #22. Policy exit met; 2b remains an optional future; 2c stays deferred.

**Goal:** Keep a supported TypeScript line; do **not** jump to 7 until the Astro tooling peers catch up.

### 2a — Stay on TypeScript 5.x (default / now) — done

- [x] Keep `typescript` on the latest **5.x** that `@astrojs/check` and `typescript-eslint` accept (`5.9.3` is current latest 5.x; `npm ci` + `npm run check` green).
- [x] Dependabot: ignore `typescript` major updates (already in Phase 0).
- [x] Document the policy in [`README.md`](README.md) (TypeScript policy).

### 2b — TypeScript 6 (optional, not required for this roadmap)

- [ ] When `@astrojs/check` (and ESLint TS stack) clearly support TS 6 in CI with `npm ci` (no `--legacy-peer-deps`), bump in one PR.
- [ ] Re-run `astro check` across `src/` and fix new strictness only if actionable.

Note (verified 2026-08-01): `@astrojs/check@0.9.10` allows `typescript@^5 \|\| ^6`, and `typescript-eslint@8` allows `<6.1.0`. A TS 6 bump is technically peer-plausible but **not** part of this roadmap’s completion criteria — schedule a dedicated PR if/when desired.

### 2c — TypeScript 7 (deferred)

- [x] Block until `@astrojs/check` peer range includes `^7` (or Astro documents a supported path). (`@astrojs/check` still `^5 \|\| ^6` only.)
- [x] Treat Dependabot’s `5.9 → 7.0` PR as permanently superseded until then.

**Exit for “done enough”:** Documented policy (5.x now; 6 when peers allow; 7 deferred). No broken `npm ci` from a solo TS major.

---

## Phase 3 — Astro 5 → 6 (first half of #17)

**Status:** Merged via #23 (combined with Phase 4).

**Goal:** Land on **Astro 6** with official upgrade tooling — not Astro 7 in one leap.

Astro 6 brings Vite 7, Node 22.22.3+, and integration majors. (`@astrojs/upgrade` currently offers Astro 7; this phase pinned `astro@^6.4.8` manually.)

**Coupling:** Bundled Phase 4 in the same PR (Tailwind 4 + `@tailwindcss/vite`) so we never ship unsupported `@astrojs/tailwind` on Astro 6.

### Work

- [x] Branch `chore/upgrade-astro-6`.
- [x] Pin `astro@^6` (+ keep `@astrojs/react` / `@astrojs/check`).
- [x] Resolve Tailwind path (bundled with Phase 4).
- [x] Update [`astro.config.mjs`](astro.config.mjs); Vitest `getViteConfig` unchanged and green on Vitest 4.1.
- [x] Confirm static output still builds (`output: 'static'`; `dist/index.html`).
- [x] Re-verify React islands hydrate on Vercel preview (after PR open).

### Verify

- [x] `npm ci` (clean peers)
- [x] `npm run check` / `npm run build`
- [x] `npm run preview` + visual smoke against Organic tokens (colors, type, radii)

**Exit:** Production builds on Astro 6; no reliance on unsupported peer overrides.

---

## Phase 4 — Tailwind CSS 3 → 4 (replaces #11)

**Status:** Merged via #23 (combined with Phase 3).

**Goal:** Migrate design tokens and build wiring to Tailwind 4’s Vite plugin; remove `@astrojs/tailwind`.

Organic tokens live in [`src/styles/global.css`](src/styles/global.css) (`@import "tailwindcss"` + CSS `@theme`). Former [`tailwind.config.ts`](tailwind.config.ts) / PostCSS Tailwind pipeline removed.

### Work

- [x] Add `tailwindcss@4` + `@tailwindcss/vite`; remove `@astrojs/tailwind` (and `autoprefixer` / PostCSS).
- [x] Register the Vite plugin in `astro.config.mjs` (no `tailwind()` integration).
- [x] Migrate Organic tokens into CSS `@theme`.
- [x] Update `global.css` directives; keep font import + base element styles.
- [x] Keep `prettier-plugin-tailwindcss` `^0.8.1` (v4-compatible class sorting).
- [x] Sweep: `check` / `build` green; built CSS includes Organic `--color-bg` / Caprasimo.

### Verify

- [x] Side-by-side visual pass vs `design/` Organic reference (local preview; Vercel after PR)
- [x] Full `check` + `build`

**Exit:** Tailwind 4 only; `@astrojs/tailwind` gone; design tokens preserved.

---

## Phase 5 — Astro 6 → 7 (second half of #17)

**Status:** Merged via #24.

**Goal:** Move from Astro 6 + Vite 7 override to Astro 7’s native Vite 8 / Rolldown stack.

- [x] Read the Astro 7 upgrade guide; pin manually (`astro@^7.1.6`) rather than relying on bare `@astrojs/upgrade`.
- [x] Bump `@astrojs/react` `^5` → `^6.0.2`; remove `overrides.vite` (Phase 3+4 Vite 7 workaround).
- [x] Keep Tailwind 4 + `@tailwindcss/vite`, Node `>=22.22.3`, `ajv` / `@emnapi/*` install fixes.
- [x] Re-run the full verify suite (`npm ci` / `check` / `build` / preview); Vercel production deploy after merge to `main`.

**Exit:** On Astro 7 with green CI; `@astrojs/react` back on `^6` for Vite 8.

---

## Suggested sequence (summary)

```text
Phase 0  Dependabot ignores / close failed majors     ✓
    ↓
Phase 1  React 19 (react + react-dom + types together) ✓
    ↓
Phase 2  TypeScript policy (5.x now; 6 optional; 7 blocked) ✓
    ↓
Phase 3  Astro 5 → 6  ──┐
    ↓                   ├── #23                         ✓
Phase 4  Tailwind 3 → 4 ┘
    ↓
Phase 5  Astro 6 → 7 (#24)                             ✓
```

## Out of scope for these phases

- Product features (new CRM persistence, auth, etc.)
- Replacing Vitest or ESLint majors unless a phase’s peer deps force it
- Merging Dependabot majors with `--force` / `--legacy-peer-deps` to “make CI green”

## Tracking

Use one PR per phase (or Phases 3+4 combined). After each merge, update this file’s checkboxes and the README stack versions.

**Dependency roadmap complete.** Optional follow-up outside this plan: TypeScript 6 (Phase 2b) when you want it. Product work (persistence, auth, multi-line data, etc.) was never in scope here — see README Notes.
