# Handoff: Rep Command Center (B2B Line Sheet, PMF Tracker & Prospect CRM)

## Overview
A rep-tools web app for Justin Fassio, an independent multi-line sales rep in British Columbia. It covers a wholesale catalog/line sheet with a live landed-cost calculator, a call/pipeline CRM with product-market-fit (PMF) scoring, a BC retailer prospect directory, and buyer-objection reference material. Justin currently reps one line (Old Guys Rule apparel) and is adding a second (Busted Knuckles Garage) soon — the UI has a line switcher built in for that.

## About the Design Files
The files in `design-reference/` are a **design reference built in HTML** (a "Design Component" prototype) — they show intended look, layout, states and behavior. They are **not production code to copy directly**. The task is to **recreate this design in Astro + React + TypeScript + Tailwind**, using Tailwind utility classes and React components idiomatic to that stack, not by porting the DC's inline-style/template markup verbatim.

`design-reference/Rep Command Center.dc.html` is readable as plain HTML/JS if opened in a browser or editor — the `<template>`-like markup between `<x-dc>` tags is the view, and the `class Component` block is the state/logic (tabs, search/filter state, the FX/freight calculator, the modal). Use it to read exact copy, computed values, and interaction logic, not as a literal component to import.

`design-reference/organic-styles.css` is the source **Organic** design system stylesheet the mockup is built on — it's the ground truth for every color, font, spacing and radius token used. Port its `:root` custom properties into `tailwind.config.ts` `theme.extend` (colors, fontFamily, borderRadius, boxShadow) so Tailwind classes reproduce the same values, rather than re-guessing hex codes from screenshots.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and component patterns are final. Recreate pixel-close using Tailwind, matching the token mapping below.

## Design Tokens (from Organic, `organic-styles.css`)
- **Background**: `#f5ead8` (cream) — **Text**: `#201e1d`
- **Accent (terracotta)**: `#c67139`, ramp 100→900: `#fff2eb #ffe1d0 #ffc6a5 #f6a06b #d67f48 #b2622d #8c491a #643312 #402310`
- **Accent-2 (sage)**: `#7a8a5e`, ramp 100→900: `#f0fae1 #e1eecc #ccdbb2 #aebf92 #8fa073 #728157 #56633f #3d472b #272e1b`
- **Neutral ramp** 100→900: `#f9f4ed #eee7db #dcd3c4 #c0b6a5 #a19786 #82796a #645c50 #474238 #2e2b25`
- **Surface** (card fill): `#ebddc5`
- **Fonts**: headings `Caprasimo` (weight 400 only), body `Figtree` (400/600/700) — both on Google Fonts
- **Radius**: sm 8px, md 16px, lg 28px; buttons/inputs/tags go full pill (`999px`); cards/dialogs round further still (`~32px`)
- **Spacing scale** (1.10× density): 4.4 / 8.8 / 13.2 / 17.6 / 26.4 / 35.2 px
- **Shadows**: sm/md/lg are soft ink-tinted shadows — see CSS for exact values
- Icons: Lucide, stroke-width 2.75

## Screens / Views
All five live as tabs in one shell (`Rep Command Center.dc.html`), with a sticky header (brand mark + line switcher + Log Call / Export CSV actions) and a pill tab bar underneath.

### 1. Line Sheet (Catalog) — default tab
- 4 KPI cards: total SKUs (191, with NEW/Name-Drop counts), tee wholesale price, **live-computed** est. landed CAD cost, retailer keystone margin range.
- Calculator bar: FX rate + freight multiplier number inputs — editing either recomputes landed cost and margin for every row and the KPI cards live.
- Search + category filter (8 categories) + flag filter (NEW / Name-Drop) + visible-count readout.
- Scrollable data table (sticky header), columns: Page, SKU, Product name (+ New/Name-Drop tag chips), Category, Color, Tagline, Wholesale USD, Landed CAD, MSRP CAD, Margin %. Items with no retail MSRP (POP displays, signage) show "Not for resale" / "—" instead of a margin.
- Bottom terms card: 3-column MOQ / shipping / terms panel.
- **Data**: all 191 rows are real catalog data in `data/catalog.js` (fields: `page, cat, sku, name, color, tagline, priceUsd, msrpCad, isNew, isNameDrop`).

### 2. PMF Dashboard
- 4 KPI cards (calls logged, avg PMF score, closed POs, pipeline value) — **intentionally an empty/zero state**: no seed data. This is a real dashboard whose numbers populate once the rep starts logging calls in the app; do not hardcode sample figures.
- PMF fit-breakdown bars (High/Moderate/Low) at 0%, a channel-breakdown + outcomes-summary panel with "no data yet" copy, and an empty-state recent-activity panel with a "Log Your First Call" CTA.

### 3. Call Pipeline (Call Logs)
- Search + channel filter + outcome filter bar, "Log New Call" button.
- Empty-state panel (icon + heading + body copy + CTA) — same reasoning as Dashboard: no seed/mock call data is included by design. Build the real table (columns: store, channel, contact, outcome, PMF score, feedback/notes, order value, actions) to appear once records exist.

### 4. BC Prospect Directory
- Search + region filter (6 corridors) + channel filter (4 channels) + visible-count readout.
- Scrollable table, columns: #, Store, Channel (tag chip, colored by channel), City (Region), Address, Phone, Fit reason, and a "Log Call" row action that opens the Log Call modal pre-filled with that store.
- **Data**: all 250 rows are real BC retailer research in `data/prospects.js` (fields: `id, name, category, region, city, address, phone, fit`).

### 5. Buyer Insights
- Empty-state buyer-reaction-cloud card (tags populate as calls are logged — no seed data).
- 3 static objection/counter-pitch cards (evergreen sales-enablement copy, not tied to any logged data).

### Log Call Modal
Dialog over a dim backdrop: store picker (autofills read-only channel + city from the selected prospect), contact name, outcome select, PMF score select, order value, feedback checkboxes, notes textarea, Cancel/Save.

## Interactions & Behavior
- Tab switching is client-side state, no navigation/reload.
- Catalog and Prospect Directory searches are case-insensitive substring matches across the fields listed above; category/region/channel/flag filters are simple equality; all combine (AND).
- The FX/freight calculator recomputes on every keystroke — implement as derived/computed values, not stored per-row.
- "Log Call" buttons (header, pipeline empty state, dashboard empty state, each prospect row) all open the same modal; from a prospect row it pre-fills that store.
- Modal Save currently just closes the modal (the design intentionally has no persistence/mock data layer — wire real submission logic in the app).
- Line switcher: "Old Guys Rule" is the active/selected line; clicking "Busted Knuckles Garage" shows a dismissible inline notice that the line is coming soon (it doesn't switch any data — there's no data for it yet). Build this so adding the second line later is a matter of adding its catalog data and enabling the switch.

## State Management (suggested)
- `activeTab`, `activeLine`
- Catalog: `search`, `categoryFilter`, `flagFilter`, `fxRate`, `freightMultiplier` → derived `filteredCatalog` (with computed `landedCad`, `marginPct` per row) and derived KPI aggregates
- Prospects: `search`, `regionFilter`, `channelFilter` → derived `filteredProspects`
- Modal: `isOpen`, `selectedStoreId` → derived read-only channel/city fields
- Real call-log and PMF data model to be designed fresh in the app (none is seeded here)

## Assets
No photography in this design (data-dense internal tool, no imagery slots). Fonts load from Google Fonts (Caprasimo, Figtree). Icons are inline Lucide SVGs, stroke-width 2.75 — recreate with `lucide-react` in the Astro/React build for parity.

## Files
- `design-reference/Rep Command Center.dc.html` — full design reference (markup + logic) for all 5 screens + modal
- `design-reference/organic-styles.css` — source design-system tokens and component CSS to port into Tailwind config
- `data/catalog.js` — real 191-item wholesale catalog (ES module, `export const CATALOG_DATA = [...]`)
- `data/prospects.js` — real 250-record BC retailer directory (ES module, `export const PROSPECTS_DATA = [...]`)
