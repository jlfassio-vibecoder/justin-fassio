import type { AgentSupabase } from '@/lib/agentAuth';
import type { CatalogItem } from '@/lib/catalog';
import { mapCatalogRow } from '@/lib/catalog';
import { markUserEdit, resetFieldToCatalog, type FieldMetaMap } from '@/lib/catalogProvenance';
import { mapCatalogVariantRow, type CatalogVariant } from '@/lib/catalogVariants';
import type { CatalogItemRow, CatalogVariantRow, Database } from '@/types/database';

type CatalogItemUpdate = Database['public']['Tables']['catalog_items']['Update'];

export type CatalogItemPatch = {
  page?: number | null;
  cat?: string;
  name?: string;
  color?: string | null;
  tagline?: string | null;
  status?: string;
  isNew?: boolean;
  isNameDrop?: boolean;
  isBestseller?: boolean;
  collection?: string | null;
  productType?: string | null;
  accentColor?: string | null;
  salesDescription?: string | null;
  material?: string | null;
  specialNotes?: string | null;
  salesPriority?: string | null;
  salesNotes?: string | null;
  /** Set to null to clear override (reset to catalog). */
  priceUsdOverride?: number | null;
  msrpCadOverride?: number | null;
  landedCadOverride?: number | null;
  /** When true, clear price override and sync price_usd to catalog_price_usd. */
  resetPriceToCatalog?: boolean;
  resetMsrpToCatalog?: boolean;
  resetLandedToCatalog?: boolean;
  variants?: Array<{
    id?: string;
    size?: string | null;
    color?: string | null;
    style?: string | null;
    wholesaleUsd?: number;
    wholesaleUsdOverride?: number | null;
    sortOrder?: number;
    availability?: string;
    notes?: string | null;
    _delete?: boolean;
  }>;
};

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function loadItemWithVariants(
  supabase: AgentSupabase,
  id: string,
): Promise<{ item: CatalogItem; row: CatalogItemRow } | { error: string }> {
  const { data, error } = await supabase
    .from('catalog_items')
    .select(
      'id, line_id, page, cat, sku, name, color, tagline, price_usd, msrp_cad, catalog_price_usd, price_usd_override, catalog_msrp_cad, msrp_cad_override, landed_cad_override, field_meta, status, is_new, is_name_drop, is_bestseller, pdf_page, catalog_year, brand, product_family, collection, product_type, accent_color, sales_description, material, special_notes, sales_priority, sales_notes, primary_image_path, created_at, updated_at',
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Catalog item not found' };
  }

  const row = data as CatalogItemRow;
  const { data: variantRows } = await supabase
    .from('catalog_variants')
    .select(
      'id, catalog_item_id, size, color, style, wholesale_usd, wholesale_usd_override, unit_of_measure, pack_quantity, pack_price_usd, availability, sort_order, notes, created_at, updated_at',
    )
    .eq('catalog_item_id', id)
    .order('sort_order', { ascending: true });

  const variants = (variantRows ?? []).map((v) => mapCatalogVariantRow(v as CatalogVariantRow));
  return { item: mapCatalogRow(row, variants), row };
}

export async function updateCatalogItem(
  supabase: AgentSupabase,
  input: {
    id: string;
    patch: CatalogItemPatch;
    actorId: string;
  },
): Promise<{ ok: true; item: CatalogItem } | { ok: false; error: string }> {
  const loaded = await loadItemWithVariants(supabase, input.id);
  if ('error' in loaded) {
    return { ok: false, error: loaded.error };
  }

  const { item: current, row } = loaded;
  let fieldMeta: FieldMetaMap = { ...(current.fieldMeta ?? {}) };
  const dbPatch: CatalogItemUpdate = {};
  const changes: Array<{ field_path: string; old_value: unknown; new_value: unknown }> = [];

  function touch(field: string, oldVal: unknown, newVal: unknown, reset = false) {
    if (jsonEqual(oldVal, newVal)) return;
    changes.push({ field_path: field, old_value: oldVal, new_value: newVal });
    fieldMeta = reset ? resetFieldToCatalog(fieldMeta, field) : markUserEdit(fieldMeta, field);
  }

  const p = input.patch;

  if (p.page !== undefined) {
    touch('page', current.page, p.page);
    dbPatch.page = p.page;
  }
  if (p.cat !== undefined) {
    touch('cat', current.cat, p.cat);
    dbPatch.cat = p.cat;
  }
  if (p.name !== undefined) {
    touch('name', current.name, p.name);
    dbPatch.name = p.name;
  }
  if (p.color !== undefined) {
    touch('color', current.color, p.color ?? '');
    dbPatch.color = p.color;
  }
  if (p.tagline !== undefined) {
    touch('tagline', current.tagline, p.tagline ?? '');
    dbPatch.tagline = p.tagline;
  }
  if (p.status !== undefined) {
    touch('status', current.status, p.status);
    dbPatch.status = p.status;
  }
  if (p.isNew !== undefined) {
    touch('isNew', current.isNew, p.isNew);
    dbPatch.is_new = p.isNew;
  }
  if (p.isNameDrop !== undefined) {
    touch('isNameDrop', current.isNameDrop, p.isNameDrop);
    dbPatch.is_name_drop = p.isNameDrop;
  }
  if (p.isBestseller !== undefined) {
    touch('isBestseller', current.isBestseller, p.isBestseller);
    dbPatch.is_bestseller = p.isBestseller;
  }
  if (p.collection !== undefined) {
    touch('collection', current.collection, p.collection ?? '');
    dbPatch.collection = p.collection;
  }
  if (p.productType !== undefined) {
    touch('productType', current.productType, p.productType ?? '');
    dbPatch.product_type = p.productType;
  }
  if (p.accentColor !== undefined) {
    touch('accentColor', current.accentColor, p.accentColor ?? '');
    dbPatch.accent_color = p.accentColor;
  }
  if (p.salesDescription !== undefined) {
    touch('salesDescription', current.salesDescription, p.salesDescription ?? '');
    dbPatch.sales_description = p.salesDescription;
  }
  if (p.material !== undefined) {
    touch('material', current.material, p.material ?? '');
    dbPatch.material = p.material;
  }
  if (p.specialNotes !== undefined) {
    touch('specialNotes', current.specialNotes, p.specialNotes ?? '');
    dbPatch.special_notes = p.specialNotes;
  }
  if (p.salesPriority !== undefined) {
    touch('salesPriority', current.salesPriority, p.salesPriority ?? '');
    dbPatch.sales_priority = p.salesPriority;
  }
  if (p.salesNotes !== undefined) {
    touch('salesNotes', current.salesNotes, p.salesNotes ?? '');
    dbPatch.sales_notes = p.salesNotes;
  }

  if (p.resetPriceToCatalog) {
    touch('priceUsd', current.priceUsdOverride, null, true);
    dbPatch.price_usd_override = null;
    dbPatch.price_usd = row.catalog_price_usd;
  } else if (p.priceUsdOverride !== undefined) {
    touch('priceUsd', current.priceUsdOverride, p.priceUsdOverride);
    dbPatch.price_usd_override = p.priceUsdOverride;
    if (p.priceUsdOverride != null) {
      dbPatch.price_usd = p.priceUsdOverride;
    } else {
      dbPatch.price_usd = row.catalog_price_usd;
    }
  }

  if (p.resetMsrpToCatalog) {
    touch('msrpCad', current.msrpCadOverride, null, true);
    dbPatch.msrp_cad_override = null;
    dbPatch.msrp_cad = row.catalog_msrp_cad;
  } else if (p.msrpCadOverride !== undefined) {
    touch('msrpCad', current.msrpCadOverride, p.msrpCadOverride);
    dbPatch.msrp_cad_override = p.msrpCadOverride;
    if (p.msrpCadOverride != null) {
      dbPatch.msrp_cad = p.msrpCadOverride;
    } else {
      dbPatch.msrp_cad = row.catalog_msrp_cad;
    }
  }

  if (p.resetLandedToCatalog) {
    touch('landedCad', current.landedCadOverride, null, true);
    dbPatch.landed_cad_override = null;
  } else if (p.landedCadOverride !== undefined) {
    touch('landedCad', current.landedCadOverride, p.landedCadOverride);
    dbPatch.landed_cad_override = p.landedCadOverride;
  }

  if (changes.length) {
    dbPatch.field_meta = fieldMeta;
  }

  if (Object.keys(dbPatch).length) {
    const { error } = await supabase.from('catalog_items').update(dbPatch).eq('id', input.id);
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  if (p.variants) {
    for (const v of p.variants) {
      if (v._delete && v.id) {
        const { error } = await supabase.from('catalog_variants').delete().eq('id', v.id);
        if (error) return { ok: false, error: error.message };
        changes.push({
          field_path: `variants.${v.id}`,
          old_value: v.id,
          new_value: null,
        });
        continue;
      }

      if (v.id) {
        const existing = current.variants.find((x) => x.id === v.id);
        const variantPatch: Database['public']['Tables']['catalog_variants']['Update'] = {};
        if (v.size !== undefined) variantPatch.size = v.size;
        if (v.color !== undefined) variantPatch.color = v.color;
        if (v.style !== undefined) variantPatch.style = v.style;
        // Existing rows: never overwrite catalog wholesale_usd from a bare wholesaleUsd edit.
        // Prefer explicit override; if only wholesaleUsd is sent, map it to override.
        if (v.wholesaleUsdOverride !== undefined) {
          variantPatch.wholesale_usd_override = v.wholesaleUsdOverride;
        } else if (v.wholesaleUsd !== undefined && existing) {
          const catalog = existing.catalogWholesaleUsd;
          variantPatch.wholesale_usd_override = v.wholesaleUsd === catalog ? null : v.wholesaleUsd;
        }
        if (v.sortOrder !== undefined) variantPatch.sort_order = v.sortOrder;
        if (v.availability !== undefined) variantPatch.availability = v.availability;
        if (v.notes !== undefined) variantPatch.notes = v.notes;
        if (Object.keys(variantPatch).length) {
          const { error } = await supabase
            .from('catalog_variants')
            .update(variantPatch)
            .eq('id', v.id);
          if (error) return { ok: false, error: error.message };
          changes.push({
            field_path: `variants.${v.id}`,
            old_value: existing ?? null,
            new_value: { ...existing, ...v },
          });
        }
      } else {
        const { error } = await supabase.from('catalog_variants').insert({
          catalog_item_id: input.id,
          size: v.size ?? 'BASE',
          color: v.color ?? null,
          style: v.style ?? null,
          wholesale_usd: v.wholesaleUsd ?? current.catalogPriceUsd,
          wholesale_usd_override: v.wholesaleUsdOverride ?? null,
          sort_order: v.sortOrder ?? current.variants.length,
          availability: v.availability ?? 'available',
          notes: v.notes ?? null,
        });
        if (error) return { ok: false, error: error.message };
        changes.push({
          field_path: 'variants.new',
          old_value: null,
          new_value: v,
        });
      }
    }
  }

  if (changes.length) {
    const { error: auditError } = await supabase.from('catalog_field_changes').insert(
      changes.map((c) => ({
        catalog_item_id: input.id,
        field_path: c.field_path,
        old_value: c.old_value as never,
        new_value: c.new_value as never,
        source: 'user',
        actor_id: input.actorId,
      })),
    );
    if (auditError) {
      return { ok: false, error: auditError.message };
    }
  }

  const refreshed = await loadItemWithVariants(supabase, input.id);
  if ('error' in refreshed) {
    return { ok: false, error: refreshed.error };
  }
  return { ok: true, item: refreshed.item };
}

export type { CatalogVariant };
