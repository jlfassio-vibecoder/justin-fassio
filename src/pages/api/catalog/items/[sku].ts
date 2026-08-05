import type { APIRoute } from 'astro';
import type { AgentSupabase } from '@/lib/agentAuth';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import {
  CATALOG_ATTRIBUTE_SELECT,
  CATALOG_ITEM_SELECT,
  CATALOG_VARIANT_SELECT,
  mapCatalogRow,
} from '@/lib/catalog';
import { mapAttributeRow } from '@/lib/catalogAttributes';
import { mapCatalogVariantRow } from '@/lib/catalogVariants';
import { updateCatalogItem, type CatalogItemPatch } from '@/lib/updateCatalogItem';
import type {
  CatalogItemRow,
  CatalogProductAttributeRow,
  CatalogVariantRow,
} from '@/types/database';

export const prerender = false;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadFullItem(supabase: AgentSupabase, id: string) {
  const { data, error } = await supabase
    .from('catalog_items')
    .select(CATALOG_ITEM_SELECT)
    .eq('id', id)
    .single();
  if (error || !data) return { error: error?.message ?? 'Not found' };
  const row = data as CatalogItemRow;
  const { data: variantRows } = await supabase
    .from('catalog_variants')
    .select(CATALOG_VARIANT_SELECT)
    .eq('catalog_item_id', id)
    .order('sort_order', { ascending: true });
  const { data: attrRows } = await supabase
    .from('catalog_product_attributes')
    .select(CATALOG_ATTRIBUTE_SELECT)
    .eq('catalog_item_id', id)
    .order('display_order', { ascending: true });
  const variants = (variantRows ?? []).map((v) => mapCatalogVariantRow(v as CatalogVariantRow));
  const attributes = (attrRows ?? []).map((a) => mapAttributeRow(a as CatalogProductAttributeRow));
  return { item: mapCatalogRow(row, variants, attributes) };
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
    .select('id')
    .eq('line_id', line.id)
    .eq('sku', sku)
    .maybeSingle();

  if (error) return jsonError(error.message, 502);
  if (!data) return jsonError('Catalog item not found', 404);

  const loaded = await loadFullItem(gate.supabase, data.id);
  if ('error' in loaded) return jsonError(loaded.error ?? 'Not found', 502);

  return new Response(JSON.stringify({ ok: true, item: loaded.item }), {
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

  const { data: owned, error: ownedError } = await gate.supabase
    .from('catalog_items')
    .select('id, sku')
    .eq('id', id)
    .maybeSingle();
  if (ownedError) return jsonError(ownedError.message, 502);
  if (!owned) return jsonError('Catalog item not found', 404);
  if (owned.sku !== sku) {
    return jsonError('Catalog item id does not match SKU in URL', 400);
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
