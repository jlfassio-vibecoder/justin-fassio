import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { mapCatalogRow } from '@/lib/catalog';
import { mapCatalogVariantRow } from '@/lib/catalogVariants';
import { updateCatalogItem, type CatalogItemPatch } from '@/lib/updateCatalogItem';
import type { CatalogItemRow, CatalogVariantRow } from '@/types/database';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const sku = params.sku?.trim();
  if (!sku) return jsonError('SKU is required', 400);

  const { data: line, error: lineError } = await gate.supabase
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (lineError || !line) {
    return jsonError(lineError?.message ?? 'Line not found', 404);
  }

  const { data, error } = await gate.supabase
    .from('catalog_items')
    .select(
      'id, line_id, page, cat, sku, name, color, tagline, price_usd, msrp_cad, catalog_price_usd, price_usd_override, catalog_msrp_cad, msrp_cad_override, landed_cad_override, field_meta, status, is_new, is_name_drop, is_bestseller, pdf_page, catalog_year, brand, product_family, collection, product_type, accent_color, sales_description, material, special_notes, sales_priority, sales_notes, primary_image_path, created_at, updated_at',
    )
    .eq('line_id', line.id)
    .eq('sku', sku)
    .maybeSingle();

  if (error) return jsonError(error.message, 502);
  if (!data) return jsonError('Catalog item not found', 404);

  const row = data as CatalogItemRow;
  const { data: variantRows } = await gate.supabase
    .from('catalog_variants')
    .select(
      'id, catalog_item_id, size, color, style, wholesale_usd, wholesale_usd_override, unit_of_measure, pack_quantity, pack_price_usd, availability, sort_order, notes, created_at, updated_at',
    )
    .eq('catalog_item_id', row.id)
    .order('sort_order', { ascending: true });

  const variants = (variantRows ?? []).map((v) => mapCatalogVariantRow(v as CatalogVariantRow));

  return new Response(JSON.stringify({ ok: true, item: mapCatalogRow(row, variants) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const sku = params.sku?.trim();
  if (!sku) return jsonError('SKU is required', 400);

  let body: { id?: unknown; patch?: CatalogItemPatch };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return jsonError('Catalog item id is required', 400);
  if (!body.patch || typeof body.patch !== 'object') {
    return jsonError('patch is required', 400);
  }

  const result = await updateCatalogItem(gate.supabase, {
    id,
    patch: body.patch,
    actorId: gate.userId,
  });

  if (!result.ok) {
    return jsonError(result.error, 502);
  }

  return new Response(JSON.stringify({ ok: true, item: result.item }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
