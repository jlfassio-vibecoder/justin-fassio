/**
 * Idempotent JSON/CSV catalog import (no PDF).
 *
 * Usage:
 *   npx tsx scripts/catalog-import/from-json.ts --file path/to/products.json [--dry-run]
 *
 * JSON shape (array or { products: [...] }):
 * {
 *   "sku": "SST-001",
 *   "name": "...",
 *   "cat": "Short Sleeve Tees",
 *   "department": "Apparel",
 *   "wholesaleUsd": 13,
 *   "msrpCad": 39.99,
 *   "variants": [{ "sizeGroup": "M-XL", "size": "M-XL", "wholesaleUsd": 13 }],
 *   "attributes": [{ "attributeKey": "material", "label": "Material", "value": "100% cotton" }],
 *   "primaryImageUrl": "https://..."
 * }
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildImportReport, mergeCatalogEvidence } from '../../src/lib/catalogIngest';
import { normalizeSku } from '../../src/lib/skuNormalize';
import type { Database } from '../../src/types/database';

type ImportVariant = {
  size?: string | null;
  sizeGroup?: string | null;
  color?: string | null;
  style?: string | null;
  variantSku?: string | null;
  wholesaleUsd?: number;
  packQuantity?: number | null;
  packPriceUsd?: number | null;
  availability?: string;
};

type ImportAttribute = {
  attributeKey: string;
  label?: string;
  value?: string | null;
  valueType?: string;
  unit?: string | null;
  attributeGroup?: string;
  displayOrder?: number;
};

type ImportProduct = {
  sku: string;
  name?: string;
  cat?: string;
  page?: number;
  color?: string | null;
  tagline?: string | null;
  department?: string | null;
  wholesaleUsd?: number | null;
  msrpCad?: number | null;
  material?: string | null;
  salesDescription?: string | null;
  primaryImageUrl?: string | null;
  sourceImageUrl?: string | null;
  unitOfMeasure?: string | null;
  packQuantity?: number | null;
  variants?: ImportVariant[];
  attributes?: ImportAttribute[];
};

function parseArgs(argv: string[]) {
  const eq = argv.find((a) => a.startsWith('--file='));
  const idx = argv.indexOf('--file');
  const file =
    eq?.slice('--file='.length) ||
    (idx >= 0 && argv[idx + 1] && !argv[idx + 1]!.startsWith('-') ? argv[idx + 1] : undefined);
  return {
    file: file ? resolve(file) : null,
    dryRun: argv.includes('--dry-run'),
  };
}

function parseCsv(text: string): ImportProduct[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return {
      sku: row.sku ?? '',
      name: row.name || undefined,
      cat: row.cat || undefined,
      page: row.page ? Number(row.page) : undefined,
      color: row.color || null,
      department: row.department || null,
      wholesaleUsd: row.wholesaleUsd ? Number(row.wholesaleUsd) : null,
      msrpCad: row.msrpCad ? Number(row.msrpCad) : null,
      material: row.material || null,
      primaryImageUrl: row.primaryImageUrl || null,
    } satisfies ImportProduct;
  });
}

function loadProducts(filePath: string): ImportProduct[] {
  const raw = readFileSync(filePath, 'utf8');
  if (filePath.toLowerCase().endsWith('.csv')) {
    return parseCsv(raw).filter((p) => p.sku);
  }
  const parsed = JSON.parse(raw) as ImportProduct[] | { products: ImportProduct[] };
  const list = Array.isArray(parsed) ? parsed : parsed.products;
  return (list ?? []).filter((p) => p.sku);
}

function verifiedFromMeta(fieldMeta: unknown): Set<string> {
  if (!fieldMeta || typeof fieldMeta !== 'object' || Array.isArray(fieldMeta)) return new Set();
  const out = new Set<string>();
  for (const [key, val] of Object.entries(
    fieldMeta as Record<string, { source?: string; verified?: boolean }>,
  )) {
    if (val?.verified === true || val?.source === 'user' || val?.source === 'catalog') {
      out.add(key);
    }
  }
  return out;
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv);
  if (!file) {
    console.error('Usage: npx tsx scripts/catalog-import/from-json.ts --file <path> [--dry-run]');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const products = loadProducts(file);
  const supabase = createClient<Database>(url, key);

  const { data: line, error: lineError } = await supabase
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();
  if (lineError || !line) {
    console.error(lineError?.message ?? 'OGR line not found');
    process.exit(1);
  }

  const { data: existingRows } = await supabase
    .from('catalog_items')
    .select(
      'id, sku, name, cat, color, tagline, page, price_usd, msrp_cad, material, sales_description, primary_image_url, source_image_url, field_meta, department, unit_of_measure, pack_quantity',
    )
    .eq('line_id', line.id);

  const bySku = new Map((existingRows ?? []).map((r) => [normalizeSku(r.sku), r]));

  let blankFieldsFilled = 0;
  let conflictsDetected = 0;
  const conflictRows: Array<{
    catalog_item_id: string | null;
    field_path: string;
    current_value: unknown;
    proposed_value: unknown;
  }> = [];

  for (const product of products) {
    const keySku = normalizeSku(product.sku);
    const existing = bySku.get(keySku);
    const evidence: Record<string, unknown> = {
      name: product.name,
      cat: product.cat,
      color: product.color,
      tagline: product.tagline,
      price_usd: product.wholesaleUsd,
      msrp_cad: product.msrpCad,
      material: product.material,
      sales_description: product.salesDescription,
      primary_image_url: product.primaryImageUrl,
      source_image_url: product.sourceImageUrl,
      department: product.department,
      unit_of_measure: product.unitOfMeasure,
      pack_quantity: product.packQuantity,
      page: product.page,
    };

    if (!existing) {
      if (dryRun) continue;
      const insert = {
        line_id: line.id,
        sku: product.sku,
        normalized_sku: keySku,
        name: product.name ?? product.sku,
        cat: product.cat ?? 'Uncategorized',
        page: product.page ?? 0,
        color: product.color ?? null,
        tagline: product.tagline ?? null,
        price_usd: product.wholesaleUsd ?? 0,
        catalog_price_usd: product.wholesaleUsd ?? 0,
        msrp_cad: product.msrpCad ?? 0,
        catalog_msrp_cad: product.msrpCad ?? 0,
        material: product.material ?? null,
        sales_description: product.salesDescription ?? null,
        primary_image_url: product.primaryImageUrl ?? null,
        source_image_url: product.sourceImageUrl ?? null,
        department: product.department ?? null,
        unit_of_measure: product.unitOfMeasure ?? 'each',
        pack_quantity: product.packQuantity ?? null,
        catalog_year: 2026,
        brand: 'Old Guys Rule',
        field_meta: {},
      };
      const { data: created, error } = await supabase
        .from('catalog_items')
        .insert(insert)
        .select('id, sku')
        .single();
      if (error || !created) {
        console.error(`Insert failed for ${product.sku}:`, error?.message);
        continue;
      }
      bySku.set(keySku, { ...insert, id: created.id, field_meta: {} } as never);
      blankFieldsFilled += Object.values(evidence).filter((v) => v != null && v !== '').length;

      if (product.variants?.length) {
        await supabase.from('catalog_variants').insert(
          product.variants.map((v, i) => ({
            catalog_item_id: created.id,
            size: v.size ?? v.sizeGroup ?? 'BASE',
            size_group: v.sizeGroup ?? null,
            color: v.color ?? null,
            style: v.style ?? null,
            variant_sku: v.variantSku ?? null,
            wholesale_usd: v.wholesaleUsd ?? product.wholesaleUsd ?? 0,
            pack_quantity: v.packQuantity ?? null,
            pack_price_usd: v.packPriceUsd ?? null,
            availability: v.availability ?? 'available',
            sort_order: i,
          })),
        );
      }

      if (product.attributes?.length) {
        await supabase.from('catalog_product_attributes').insert(
          product.attributes.map((a, i) => ({
            catalog_item_id: created.id,
            attribute_key: a.attributeKey,
            label: a.label ?? a.attributeKey,
            value: a.value ?? null,
            value_type: a.valueType ?? 'text',
            unit: a.unit ?? null,
            attribute_group: a.attributeGroup ?? 'other',
            display_order: a.displayOrder ?? i,
          })),
        );
      }
      continue;
    }

    const current: Record<string, unknown> = {
      name: existing.name,
      cat: existing.cat,
      color: existing.color,
      tagline: existing.tagline,
      price_usd: existing.price_usd,
      msrp_cad: existing.msrp_cad,
      material: existing.material,
      sales_description: existing.sales_description,
      primary_image_url: existing.primary_image_url,
      source_image_url: existing.source_image_url,
      department: existing.department,
      unit_of_measure: existing.unit_of_measure,
      pack_quantity: existing.pack_quantity,
      page: existing.page,
    };
    const { fills, conflicts } = mergeCatalogEvidence({
      current,
      evidence,
      verifiedFields: verifiedFromMeta(existing.field_meta),
    });
    blankFieldsFilled += Object.keys(fills).length;
    conflictsDetected += conflicts.length;
    for (const c of conflicts) {
      conflictRows.push({
        catalog_item_id: existing.id,
        field_path: c.field,
        current_value: c.current,
        proposed_value: c.proposed,
      });
    }

    if (!dryRun && Object.keys(fills).length) {
      const update: Database['public']['Tables']['catalog_items']['Update'] = {
        ...(fills as Database['public']['Tables']['catalog_items']['Update']),
      };
      if (fills.price_usd != null) update.catalog_price_usd = Number(fills.price_usd);
      if (fills.msrp_cad != null) update.catalog_msrp_cad = Number(fills.msrp_cad);
      update.normalized_sku = keySku;
      const { error } = await supabase.from('catalog_items').update(update).eq('id', existing.id);
      if (error) console.error(`Update failed for ${product.sku}:`, error.message);
    }

    if (!dryRun && product.variants?.length) {
      const { data: existingVariants } = await supabase
        .from('catalog_variants')
        .select('id, size, size_group')
        .eq('catalog_item_id', existing.id);
      if (!(existingVariants ?? []).length) {
        await supabase.from('catalog_variants').insert(
          product.variants.map((v, i) => ({
            catalog_item_id: existing.id,
            size: v.size ?? v.sizeGroup ?? 'BASE',
            size_group: v.sizeGroup ?? null,
            color: v.color ?? null,
            style: v.style ?? null,
            variant_sku: v.variantSku ?? null,
            wholesale_usd: v.wholesaleUsd ?? product.wholesaleUsd ?? 0,
            pack_quantity: v.packQuantity ?? null,
            pack_price_usd: v.packPriceUsd ?? null,
            availability: v.availability ?? 'available',
            sort_order: i,
          })),
        );
      }
    }

    if (!dryRun && product.attributes?.length) {
      for (const a of product.attributes) {
        const { data: existingAttr } = await supabase
          .from('catalog_product_attributes')
          .select('id, value')
          .eq('catalog_item_id', existing.id)
          .eq('attribute_key', a.attributeKey)
          .maybeSingle();
        if (!existingAttr) {
          await supabase.from('catalog_product_attributes').insert({
            catalog_item_id: existing.id,
            attribute_key: a.attributeKey,
            label: a.label ?? a.attributeKey,
            value: a.value ?? null,
            value_type: a.valueType ?? 'text',
            unit: a.unit ?? null,
            attribute_group: a.attributeGroup ?? 'other',
            display_order: a.displayOrder ?? 0,
          });
          blankFieldsFilled += 1;
        } else if ((existingAttr.value == null || existingAttr.value === '') && a.value) {
          await supabase
            .from('catalog_product_attributes')
            .update({ value: a.value })
            .eq('id', existingAttr.id);
          blankFieldsFilled += 1;
        }
      }
    }
  }

  const report = buildImportReport({
    evidence: products.map((p) => ({
      sku: p.sku,
      name: p.name,
      cat: p.cat,
      wholesaleUsd: p.wholesaleUsd,
      msrpCad: p.msrpCad,
      imageHash: p.primaryImageUrl ?? null,
    })),
    crm: (existingRows ?? []).map((r) => ({ sku: r.sku, id: r.id })),
    blankFieldsFilled,
    conflictsDetected,
  });

  if (!dryRun) {
    const { data: run } = await supabase
      .from('catalog_import_runs')
      .insert({
        line_id: line.id,
        source_document: file,
        status: 'completed',
        report,
      })
      .select('id')
      .single();

    if (run && conflictRows.length) {
      await supabase.from('catalog_import_conflicts').insert(
        conflictRows.map((c) => ({
          import_run_id: run.id,
          catalog_item_id: c.catalog_item_id,
          field_path: c.field_path,
          current_value: c.current_value as never,
          proposed_value: c.proposed_value as never,
        })),
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        file,
        products: products.length,
        report,
      },
      null,
      2,
    ),
  );
}

void main();
