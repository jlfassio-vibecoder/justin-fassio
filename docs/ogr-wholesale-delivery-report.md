# Old Guys Rule Wholesale — Delivery Report

Phase 4 quality gate for the public wholesale showroom (Phases 1–3 implementation on `feature/editable-line-sheet-items`).

## 1. Buyer experience summary

Canadian retailers open **View Line** on the homepage and land on `/old-guys-rule-wholesale` without signing in. They browse an Organic-styled collection (search, category, theme, sort), open product detail or a quick-view dialog, add size quantities to a local draft (`ogr-wholesale-order-v1`), and submit an order **request** (not a purchase) with buyer contact fields. Success returns a request number. Staff curate Published / Featured / Sort / Slug (and related public fields) from the line-sheet product drawer.

## 2. Files and routes created or modified

**Public routes**

- [`src/pages/old-guys-rule-wholesale/index.astro`](../src/pages/old-guys-rule-wholesale/index.astro) — SSR collection
- [`src/pages/old-guys-rule-wholesale/[slug].astro`](../src/pages/old-guys-rule-wholesale/[slug].astro) — SSR detail; 404 via [`missingPublicOgrProductResponse`](../src/lib/wholesaleRoutes.ts)
- [`src/pages/api/wholesale/order-requests.ts`](../src/pages/api/wholesale/order-requests.ts) — public POST submit
- Homepage CTA: [`src/pages/index.astro`](../src/pages/index.astro) + [`src/data/landing.ts`](../src/data/landing.ts) (`OGR_WHOLESALE_PATH`)

**UI / lib (representative)**

- `src/components/wholesale/*` — showroom, filters, cards, detail, order builder, buyer form
- `src/lib/publicCatalog.ts`, `wholesaleFilters.ts`, `wholesaleOrderDraft.ts`, `wholesalePricing.ts`
- `src/lib/wholesaleProspectMatch.ts`, `wholesaleOrderEmail.ts`, `supabaseAdmin.ts`
- Staff: `ProductDetailDrawer` Public wholesale section; `catalog.ts` / `updateCatalogItem.ts` publishing fields

## 3. Database migrations

- [`supabase/migrations/20260805050000_public_ogr_wholesale_access.sql`](../supabase/migrations/20260805050000_public_ogr_wholesale_access.sql) — publishing columns, public RPCs (`get_public_ogr_products`, `get_public_ogr_product_by_slug`, `get_public_ogr_supplier_terms`), `wholesale_order_requests` + items, staff RLS
- Related image backfill (catalog CDN URLs): `20260805040000_*`, `20260805040001_*`

## 4. Security and RLS changes

- Anon does **not** get `SELECT` on `catalog_items` (staff RLS unchanged).
- Public catalog is exposed only through **SECURITY DEFINER** RPCs returning approved columns (no sales notes, overrides, `field_meta`, etc.).
- Order submit uses **service role** (`SUPABASE_SERVICE_ROLE_KEY`); base tables remain staff-write under RLS. Validation, honeypot, rate limit, and idempotency key apply on the API.

## 5. CRM workflow created

On successful insert (skipped on idempotent replay / honeypot):

1. Match unique contact email → else unique prospect name → else create inbound prospect (`source_note` inbound wholesale; **never** set `account_status` to `active_account`).
2. Set `wholesale_order_requests.prospect_id`.
3. Insert `prospect_updates` activity with request number, units, USD subtotal, SKUs.
4. Optional Resend buyer confirmation (+ office CC) when `RESEND_API_KEY` is set; otherwise CRM activity is the system of record.

## 6. Tests added and results

Coverage includes public field stripping, filter URL round-trip, currency labels, MOQ (including per-style failure), slug 404 helper, prospect match (never activate), email no-op, catalog publishing map, homepage CTA file assertion, and `POST /api/wholesale/order-requests` (honeypot / idempotent skip / CRM happy path).

**Result (Phase 4 gate):** `npm run check` passed — lint, `astro check`, Prettier, and Vitest (**55** files / **285** tests).

## 7. Screenshots (desktop and mobile)

- Desktop (~1280×900): [docs/screenshots/ogr-wholesale/collection-desktop.png](screenshots/ogr-wholesale/collection-desktop.png)
- Mobile (~390×844): [docs/screenshots/ogr-wholesale/collection-mobile.png](screenshots/ogr-wholesale/collection-mobile.png)

Visual pass also confirmed: homepage **View Line** → `/old-guys-rule-wholesale`, collection grid/filters/order form, unknown slug → **404**.

## 8. Catalog records withheld

Phase 1 auto-published active OGR rows that already had an `http(s)` `primary_image_url`. Rows without a usable primary image remain unpublished (`is_publicly_published = false`) and do not appear in public RPCs until staff publish them from the drawer (or DB).

## 9. Remaining assumptions / decisions

- Deploy must set `SUPABASE_SERVICE_ROLE_KEY` for order submit (returns 503 without it).
- Buyer confirmation email requires `RESEND_API_KEY` (and a verified from-address / `WHOLESALE_ORDER_EMAIL_FROM` if overriding).
- Inbound prospects use CRM category mapped from retail channel and `region` = province code; staff may refine later.
- No staff order-request inbox UI in this MVP (query Supabase / future Phase).
- Estimated landed CAD omitted on the public site until an approved public calc exists.

## 10. Verification steps

**Local**

1. `npm run dev` with `PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
2. Open `/` → **View Line** → showroom loads products.
3. Filter/search; open a product; add sizes; submit buyer form → request number; confirm `wholesale_order_requests` + `prospect_updates` in Supabase.
4. Hit `/old-guys-rule-wholesale/not-a-real-slug` → 404.
5. In `/app` catalog drawer → Public wholesale: unpublish a SKU → confirm it disappears from the public showroom after refresh.
6. `npm run check`.

**Production**

1. Confirm Vercel env: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `RESEND_API_KEY`.
2. Smoke the same paths on the live host.
3. Submit a test request and verify CRM rows (then decline/cancel in staff workflow as needed).

---

## Architecture completion criteria

| Criterion | Status |
|-----------|--------|
| Homepage link works | Met (CTA → `/old-guys-rule-wholesale`) |
| Public catalog usable without auth | Met (SSR + anon RPCs) |
| Private CRM data protected | Met (no anon table SELECT; RPCs strip staff fields) |
| Buyer can build and submit a valid order request | Met |
| Submission appears in authenticated CRM tables | Met (`wholesale_order_requests`, `prospect_id`, `prospect_updates`) |
| Desktop and mobile layouts visually tested | Met (screenshots above) |
