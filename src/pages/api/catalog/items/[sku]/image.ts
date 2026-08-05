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
import type {
  CatalogItemRow,
  CatalogProductAttributeRow,
  CatalogVariantRow,
} from '@/types/database';

export const prerender = false;

const BUCKET = 'catalog-assets';
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

export const POST: APIRoute = async ({ params, request }) => {
  const gate = await requireApprovedStaffClient(request);
  if (!gate.ok) return gate.response;

  const sku = params.sku?.trim();
  if (!sku) return jsonError('SKU is required', 400);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Expected multipart form data', 400);
  }

  const id = String(form.get('id') ?? '').trim();
  const file = form.get('file');
  if (!id) return jsonError('Catalog item id is required', 400);
  if (!(file instanceof File)) return jsonError('file is required', 400);
  if (!ALLOWED.has(file.type)) {
    return jsonError('Unsupported image type (use jpeg, png, webp, or gif)', 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError('Image must be 8MB or smaller', 400);
  }

  const { data: owned, error: ownedError } = await gate.supabase
    .from('catalog_items')
    .select('id, sku, line_id')
    .eq('id', id)
    .maybeSingle();
  if (ownedError) return jsonError(ownedError.message, 502);
  if (!owned) return jsonError('Catalog item not found', 404);
  if (owned.sku !== sku) {
    return jsonError('Catalog item id does not match SKU in URL', 400);
  }

  const ext = extForMime(file.type);
  const path = `${owned.line_id}/${owned.sku}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await gate.supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return jsonError(uploadError.message, 502);

  const { data: publicData } = gate.supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  const { error: updateError } = await gate.supabase
    .from('catalog_items')
    .update({
      primary_image_path: path,
      primary_image_url: publicUrl,
    })
    .eq('id', id);
  if (updateError) return jsonError(updateError.message, 502);

  const { error: assetError } = await gate.supabase.from('catalog_assets').insert({
    catalog_item_id: id,
    line_id: owned.line_id,
    storage_path: path,
    asset_kind: 'primary',
    extraction_method: 'staff_upload',
  });
  if (assetError) return jsonError(assetError.message, 502);

  const { error: changeError } = await gate.supabase.from('catalog_field_changes').insert({
    catalog_item_id: id,
    field_path: 'primaryImagePath',
    old_value: null,
    new_value: path,
    source: 'user',
    actor_id: gate.userId,
  });
  if (changeError) return jsonError(changeError.message, 502);

  const loaded = await loadFullItem(gate.supabase, id);
  if ('error' in loaded) return jsonError(loaded.error ?? 'Not found', 502);

  return new Response(JSON.stringify({ ok: true, item: loaded.item }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
