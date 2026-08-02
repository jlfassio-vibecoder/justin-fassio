# Handoff: Justin Fassio — Public Landing Page

## Overview
Public brand page for justinfassio.com, the entry point that sits in front of Justin's rep tools (Rep Command Center is the first; more will follow). It introduces Justin as an independent outdoor lifestyle rep in Santa Cruz, CA, lists the brands he represents, and links out to his gated app(s). No app data lives here — this is a marketing/bio page.

## About the Design Files
`design-reference/Justin Fassio Landing.dc.html` is a **design reference** (a "Design Component" prototype), not production code to port verbatim. Recreate it in Astro + React + TypeScript + Tailwind, using Tailwind utilities and idiomatic React/Astro components — read the DC for exact copy, structure, and token usage, not as a literal file to import.

`design-reference/organic-styles.css` is the source **Organic** design-system stylesheet. Port its `:root` custom properties into `tailwind.config.ts` `theme.extend` (colors, fontFamily, borderRadius, boxShadow) so Tailwind reproduces the same values.

## Fidelity
**High-fidelity.** Layout, copy, spacing, and the token mapping below are final. Colors lean the shared Organic ramp toward the logo's forest-green/mustard vintage-badge palette (see below) — this variant, not raw Organic, is what to match.

## Design Tokens
- **Background**: `#f5ead8` (cream) — **Text**: `#201e1d`
- **Accent (mustard/terracotta)**: base `#c67139`, ramp 100→900: `#fff2eb #ffe1d0 #ffc6a5 #f6a06b #d67f48 #b2622d #8c491a #643312 #402310`. Buttons/CTAs use `700` (`#8c491a`); hover `600`.
- **Accent-2 (forest green)**: base `#7a8a5e`, ramp 100→900: `#f0fae1 #e1eecc #ccdbb2 #aebf92 #8fa073 #728157 #56633f #3d472b #272e1b`. Used as the dominant "badge" ink — `900` (`#272e1b`) is the dark section background (Brands, Contact) and headline color on cream; `100` tints small chips.
- **Fonts**: headings `Caprasimo` (weight 400 only), body `Figtree` (400/600/700), both Google Fonts.
- **Radius**: sm 8px, md 16px, lg 28px; buttons/tags/pills go `999px`; cards round further (`~32px`, `--radius-lg * 1.15`).
- **Spacing scale** (1.10× density): 4.4 / 8.8 / 13.2 / 17.6 / 26.4 / 35.2 px.
- **Shadows**: sm/md/lg soft ink-tinted shadows, see CSS.
- Icons: hand-drawn inline SVGs in the Lucide style, stroke-width 2.75 — recreate with `lucide-react` for parity (icons used: layout/grid, lock, instagram, linkedin).

## Sections (single scrolling page)
1. **Nav** — wordmark "JUSTIN FASSIO" (Caprasimo), anchor links to Brands/Apps/Contact, a "Sign In" pill button (forest-green fill) linking to the Rep Command Center app.
2. **Hero** — dashed-ring framed logo mark (the attached badge artwork) beside an H1 "Outdoor Lifestyle Rep", one-line bio, two CTAs ("View Brands", "Get In Touch"), and four outline pill tags (Surf / Bike / Fish / Snow). Cream background.
3. **Brands I Represent** (`#brands`) — dark forest-green (`accent-2-900`) full-bleed band. Two cards on cream surfaces: **Old Guys Rule** (image slot, "Now Repping" tag, links out to the live marketplace listing) and **Busted Knuckles Garage** (image slot, "Soon" tag, disabled CTA). Add new brand cards here as the line card grows.
4. **Command Centers** (`#apps`) — cream background. One app card today: **Rep Command Center**, icon + description + "Open App" button (link to the app) + "Sign-in required" lock note. Built as a grid so additional app cards drop in later without restructuring.
5. **Contact** (`#contact`) — same dark forest-green band. Email (mailto) in mustard, circular social icon buttons (Instagram, LinkedIn placeholders — point at real handles when known), and a footer rule with copyright + tagline.

## Assets
- `assets/Outdoor_Lifestyle_Rep_Logo.png` — the exact badge/wordmark logo used in the hero, at native resolution (2092×2048, transparent-capable PNG, opaque cream backdrop matching the page background). Use as-is; do not re-crop or recolor.
- Two brand-card images (Old Guys Rule, Busted Knuckles Garage) are **unfilled placeholders** in the reference (`<image-slot>` elements) — source real brand photography/logos before launch.
- No other photography. Fonts via Google Fonts (Caprasimo, Figtree).

## Interactions & Behavior
- All nav/CTA anchors are same-page scroll links (`#brands`, `#apps`, `#contact`) except "Sign In" / "Open App", which link to the Rep Command Center app (its own login is out of scope here — this page just deep-links to it).
- "Old Guys Rule" CTA opens `https://www.sellbyownerlocal.com/marketplace/clothing/old-guys-rule` in a new tab (`target="_blank"`) — **note**: this URL is expected to move to a justinfassio.com path later; keep it as a single configurable constant so it's a one-line change.
- "Busted Knuckles Garage" CTA is visually a button but non-interactive (`Coming Soon`, no href) until that line goes live.
- No client-side state — this is a static marketing page. Build as a static Astro page (no React needed) unless a future variant adds interactivity (e.g. a mobile nav toggle).
- Responsive: hero grid and brand grid collapse to one column under ~860px; nav should collapse to a simple stacked/hamburger pattern on mobile (not shown in the reference — design fresh, following the same forest-green/cream/mustard palette).

## Files
- `design-reference/Justin Fassio Landing.dc.html` — full page markup/styles reference
- `design-reference/organic-styles.css` — source design-system tokens to port into Tailwind config
- `assets/Outdoor_Lifestyle_Rep_Logo.png` — exact logo asset, use unmodified
