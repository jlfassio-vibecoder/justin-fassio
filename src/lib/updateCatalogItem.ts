import type { AgentSupabase } from '@/lib/agentAuth';
import type { CatalogAttribute } from '@/lib/catalogAttributes';
import { mapAttributeRow } from '@/lib/catalogAttributes';
import type { CatalogItem } from '@/lib/catalog';
import {
  CATALOG_ATTRIBUTE_SELECT,
  CATALOG_ITEM_SELECT,
  CATALOG_VARIANT_SELECT,
  mapCatalogRow,
} from '@/lib/catalog';
import { markUserEdit, resetFieldToCatalog, type FieldMetaMap } from '@/lib/catalogProvenance';
import { mapCatalogVariantRow, type CatalogVariant } from '@/lib/catalogVariants';
import type {
  CatalogItemRow,
  CatalogProductAttributeRow,
  CatalogVariantRow,
  Database,
} from '@/types/database';

type CatalogItemUpdate = Database['public']['Tables']['catalog_items']['Update'];

export type CatalogAttributePatch = {
  id?: string;
  attributeKey: string;
  label: string;
  value?: string | null;
  valueType?: string;
  unit?: string | null;
  attributeGroup?: string;
  displayOrder?: number;
  _delete?: boolean;
};

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
  department?: string | null;
  unitOfMeasure?: string | null;
  minimumQuantity?: number | null;
  orderMultiple?: number | null;
  packQuantity?: number | null;
  madeInUsaClaim?: boolean | null;
  countryOfBlankManufacture?: string | null;
  countryOfDecoration?: string | null;
  countryOfOrigin?: string | null;
  primaryImageUrl?: string | null;
  sourceImageUrl?: string | null;
  primaryImagePath?: string | null;
  catalogVerified?: boolean;
  verificationNotes?: string | null;
  lifestyleThemes?: string[];
  recommendedChannels?: string[];
  seasonality?: string | null;
  sampleStatus?: string | null;
  buyerFeedback?: string | null;
  /** Set to null to clear override (reset to catalog). */
  priceUsdOverride?: number | null;
  msrpCadOverride?: number | null;
  landedCadOverride?: number | null;
  /** When true, clear price override and sync price_usd to catalog_price_usd. */
  resetPriceToCatalog?: boolean;
  resetMsrpToCatalog?: boolean;
  resetLandedToCatalog?: boolean;
  isPubliclyPublished?: boolean;
  featured?: boolean;
  publicSortOrder?: number;
  publicSlug?: string | null;
  liveSku?: string | null;
  liveSkuNote?: string | null;
  alternateImageUrls?: string[];
  variants?: Array<{
    id?: string;
    size?: string | null;
    sizeGroup?: string | null;
    color?: string | null;
    style?: string | null;
    variantSku?: string | null;
    wholesaleUsd?: number;
    wholesaleUsdOverride?: number | null;
    packQuantity?: number | null;
    packPriceUsd?: number | null;
    sortOrder?: number;
    availability?: string;
    notes?: string | null;
    _delete?: boolean;
  }>;
  attributes?: CatalogAttributePatch[];
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
    .select(CATALOG_ITEM_SELECT)
    .eq('id', id)
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Catalog item not found' };
  }

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
  return { item: mapCatalogRow(row, variants, attributes), row };
}

export async function updateCatalogItem(
  supabase: AgentSupabase,
  input: {
    id: string;
    patch: CatalogItemPatch;
    actorId: string;
  },
): Promise<{ ok: true; item: CatalogItem } | { ok: false; error: string }> {
  // Copilot suggestion ignored: Supabase JS has no multi-table transaction here; we keep sequential writes with early return on failure (existing catalog patch pattern).
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
  if (p.department !== undefined) {
    touch('department', current.department, p.department ?? '');
    dbPatch.department = p.department;
  }
  if (p.unitOfMeasure !== undefined) {
    touch('unitOfMeasure', current.unitOfMeasure, p.unitOfMeasure ?? 'each');
    dbPatch.unit_of_measure = p.unitOfMeasure ?? 'each';
  }
  if (p.minimumQuantity !== undefined) {
    touch('minimumQuantity', current.minimumQuantity, p.minimumQuantity);
    dbPatch.minimum_quantity = p.minimumQuantity;
  }
  if (p.orderMultiple !== undefined) {
    touch('orderMultiple', current.orderMultiple, p.orderMultiple);
    dbPatch.order_multiple = p.orderMultiple;
  }
  if (p.packQuantity !== undefined) {
    touch('packQuantity', current.packQuantity, p.packQuantity);
    dbPatch.pack_quantity = p.packQuantity;
  }
  if (p.madeInUsaClaim !== undefined) {
    touch('madeInUsaClaim', current.madeInUsaClaim, p.madeInUsaClaim);
    dbPatch.made_in_usa_claim = p.madeInUsaClaim;
  }
  if (p.countryOfBlankManufacture !== undefined) {
    touch(
      'countryOfBlankManufacture',
      current.countryOfBlankManufacture,
      p.countryOfBlankManufacture ?? '',
    );
    dbPatch.country_of_blank_manufacture = p.countryOfBlankManufacture;
  }
  if (p.countryOfDecoration !== undefined) {
    touch('countryOfDecoration', current.countryOfDecoration, p.countryOfDecoration ?? '');
    dbPatch.country_of_decoration = p.countryOfDecoration;
  }
  if (p.countryOfOrigin !== undefined) {
    touch('countryOfOrigin', current.countryOfOrigin, p.countryOfOrigin ?? '');
    dbPatch.country_of_origin = p.countryOfOrigin;
  }
  if (p.primaryImageUrl !== undefined) {
    touch('primaryImageUrl', current.primaryImageUrl, p.primaryImageUrl);
    dbPatch.primary_image_url = p.primaryImageUrl;
  }
  if (p.sourceImageUrl !== undefined) {
    touch('sourceImageUrl', current.sourceImageUrl, p.sourceImageUrl);
    dbPatch.source_image_url = p.sourceImageUrl;
  }
  if (p.primaryImagePath !== undefined) {
    touch('primaryImagePath', current.primaryImagePath, p.primaryImagePath);
    dbPatch.primary_image_path = p.primaryImagePath;
  }
  if (p.catalogVerified !== undefined) {
    touch('catalogVerified', current.catalogVerified, p.catalogVerified);
    dbPatch.catalog_verified = p.catalogVerified;
  }
  if (p.verificationNotes !== undefined) {
    touch('verificationNotes', current.verificationNotes, p.verificationNotes ?? '');
    dbPatch.verification_notes = p.verificationNotes;
  }
  if (p.lifestyleThemes !== undefined) {
    touch('lifestyleThemes', current.lifestyleThemes, p.lifestyleThemes);
    dbPatch.lifestyle_themes = p.lifestyleThemes;
  }
  if (p.recommendedChannels !== undefined) {
    touch('recommendedChannels', current.recommendedChannels, p.recommendedChannels);
    dbPatch.recommended_channels = p.recommendedChannels;
  }
  if (p.seasonality !== undefined) {
    touch('seasonality', current.seasonality, p.seasonality ?? '');
    dbPatch.seasonality = p.seasonality;
  }
  if (p.sampleStatus !== undefined) {
    touch('sampleStatus', current.sampleStatus, p.sampleStatus ?? '');
    dbPatch.sample_status = p.sampleStatus;
  }
  if (p.buyerFeedback !== undefined) {
    touch('buyerFeedback', current.buyerFeedback, p.buyerFeedback ?? '');
    dbPatch.buyer_feedback = p.buyerFeedback;
  }
  if (p.isPubliclyPublished !== undefined) {
    touch('isPubliclyPublished', current.isPubliclyPublished, p.isPubliclyPublished);
    dbPatch.is_publicly_published = p.isPubliclyPublished;
  }
  if (p.featured !== undefined) {
    touch('featured', current.featured, p.featured);
    dbPatch.featured = p.featured;
  }
  if (p.publicSortOrder !== undefined) {
    touch('publicSortOrder', current.publicSortOrder, p.publicSortOrder);
    dbPatch.public_sort_order = p.publicSortOrder;
  }
  if (p.publicSlug !== undefined) {
    // Normalize to match public RPC lookup: lower(trim(p_slug))
    const normalizedSlug = p.publicSlug == null ? null : p.publicSlug.trim().toLowerCase() || null;
    touch('publicSlug', current.publicSlug, normalizedSlug);
    dbPatch.public_slug = normalizedSlug;
  }
  if (p.liveSku !== undefined) {
    touch('liveSku', current.liveSku, p.liveSku);
    dbPatch.live_sku = p.liveSku;
  }
  if (p.liveSkuNote !== undefined) {
    touch('liveSkuNote', current.liveSkuNote, p.liveSkuNote);
    dbPatch.live_sku_note = p.liveSkuNote;
  }
  if (p.alternateImageUrls !== undefined) {
    touch('alternateImageUrls', current.alternateImageUrls, p.alternateImageUrls);
    dbPatch.alternate_image_urls = p.alternateImageUrls;
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
        if (v.sizeGroup !== undefined) variantPatch.size_group = v.sizeGroup;
        if (v.color !== undefined) variantPatch.color = v.color;
        if (v.style !== undefined) variantPatch.style = v.style;
        if (v.variantSku !== undefined) variantPatch.variant_sku = v.variantSku;
        if (v.packQuantity !== undefined) variantPatch.pack_quantity = v.packQuantity;
        if (v.packPriceUsd !== undefined) variantPatch.pack_price_usd = v.packPriceUsd;
        // Existing rows: never overwrite catalog wholesale_usd from a bare wholesaleUsd edit.
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
          size_group: v.sizeGroup ?? null,
          color: v.color ?? null,
          style: v.style ?? null,
          variant_sku: v.variantSku ?? null,
          wholesale_usd: v.wholesaleUsd ?? current.catalogPriceUsd,
          wholesale_usd_override: v.wholesaleUsdOverride ?? null,
          pack_quantity: v.packQuantity ?? null,
          pack_price_usd: v.packPriceUsd ?? null,
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

  if (p.attributes) {
    for (const a of p.attributes) {
      if (a._delete && a.id) {
        const { error } = await supabase.from('catalog_product_attributes').delete().eq('id', a.id);
        if (error) return { ok: false, error: error.message };
        changes.push({
          field_path: `attributes.${a.attributeKey}`,
          old_value: a.id,
          new_value: null,
        });
        continue;
      }

      if (a.id) {
        const existing = current.attributes.find((x) => x.id === a.id);
        const { error } = await supabase
          .from('catalog_product_attributes')
          .update({
            label: a.label,
            value: a.value ?? null,
            value_type: a.valueType ?? 'text',
            unit: a.unit ?? null,
            attribute_group: a.attributeGroup ?? 'other',
            display_order: a.displayOrder ?? 0,
          })
          .eq('id', a.id);
        if (error) return { ok: false, error: error.message };
        changes.push({
          field_path: `attributes.${a.attributeKey}`,
          old_value: existing ?? null,
          new_value: a,
        });
      } else {
        const { error } = await supabase.from('catalog_product_attributes').insert({
          catalog_item_id: input.id,
          attribute_key: a.attributeKey,
          label: a.label,
          value: a.value ?? null,
          value_type: a.valueType ?? 'text',
          unit: a.unit ?? null,
          attribute_group: a.attributeGroup ?? 'other',
          display_order: a.displayOrder ?? current.attributes.length,
        });
        if (error) return { ok: false, error: error.message };
        changes.push({
          field_path: `attributes.${a.attributeKey}`,
          old_value: null,
          new_value: a,
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

export type { CatalogVariant, CatalogAttribute };
