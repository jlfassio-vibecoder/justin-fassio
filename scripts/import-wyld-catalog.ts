/**
 * Stage, validate, and promote the private Wyld wholesale price list.
 *
 * The CSV is not committed. Pass a path or use the local default.
 *
 *   node --experimental-strip-types --env-file=.env scripts/import-wyld-catalog.ts
 *   node --experimental-strip-types --env-file=.env scripts/import-wyld-catalog.ts --commit
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  blockingConflicts,
  departmentForCategory,
  KNOWN_DUPLICATE_UPC_REASON,
  parseWyldPriceList,
  WYLD_PRICE_LIST_EFFECTIVE_DATE,
  WYLD_PRICE_LIST_SEASON,
} from '../src/lib/wyldCatalogImport.ts';

const commit = process.argv.includes('--commit');
const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath =
  fileArg?.slice('--file='.length) ||
  join(root, 'docs/wyld-gear/sales-essentials/wholesale-pricing/wholesale-pricing.csv');

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) {
  console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const csvText = readFileSync(csvPath, 'utf8');
const checksum = createHash('sha256').update(csvText).digest('hex');
const filename = basename(csvPath);
const parsed = parseWyldPriceList(csvText);
const blocking = blockingConflicts(parsed.conflicts);
const families = new Set(parsed.rows.map((row) => row.familyKey));

console.log(
  JSON.stringify(
    {
      filename,
      checksum,
      effectiveDate: WYLD_PRICE_LIST_EFFECTIVE_DATE,
      season: WYLD_PRICE_LIST_SEASON,
      families: families.size,
      skus: parsed.rows.length,
      blocking: blocking.length,
      acceptedExceptions: parsed.conflicts.filter(
        (conflict) => conflict.status === 'accepted_source_exception',
      ).length,
    },
    null,
    2,
  ),
);

if (blocking.length > 0) {
  console.error('Blocking conflicts:', blocking);
  process.exit(1);
}

if (!commit) {
  console.log('Dry run. Pass --commit to write staging rows and promote the catalog.');
  process.exit(0);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: line, error: lineError } = await supabase
  .from('lines')
  .select('id, status, catalog_status')
  .eq('code', 'wyld-gear')
  .single();
if (lineError || !line) {
  console.error(lineError?.message ?? 'wyld-gear line is missing');
  process.exit(1);
}

const { data: run, error: runError } = await supabase
  .from('catalog_import_runs')
  .insert({
    line_id: line.id,
    source_document: filename,
    source_filename: filename,
    source_checksum: checksum,
    price_list_effective_date: WYLD_PRICE_LIST_EFFECTIVE_DATE,
    status: 'running',
    report: {
      season: WYLD_PRICE_LIST_SEASON,
      familyCount: families.size,
      skuCount: parsed.rows.length,
    },
  })
  .select('id')
  .single();
if (runError || !run) {
  console.error(runError?.message ?? 'import run insert failed');
  process.exit(1);
}

const stagingPayload = parsed.rows.map((row) => ({
  import_run_id: run.id,
  source_row_number: row.sourceRowNumber,
  family_key: row.familyKey,
  family_name: row.familyName,
  category: row.category,
  capacity: row.capacity,
  color: row.color,
  sku: row.sku,
  upc: row.upc,
  wholesale_usd: row.wholesaleUsd,
  msrp_usd: row.msrpUsd,
  currency: row.currency,
  made_in_usa: row.madeInUsa,
  raw: row,
}));

const { error: stagingError } = await supabase
  .from('catalog_import_staging_rows')
  .insert(stagingPayload);
if (stagingError) {
  console.error(stagingError.message);
  process.exit(1);
}

await supabase.from('lines').update({ catalog_status: 'data_imported' }).eq('id', line.id);

if (parsed.conflicts.length > 0) {
  const { error: conflictError } = await supabase.from('catalog_import_conflicts').insert(
    parsed.conflicts.map((conflict) => ({
      import_run_id: run.id,
      sku: conflict.sku,
      field_path: conflict.fieldPath,
      proposed_value: conflict.proposedValue,
      proposed_source: filename,
      status: conflict.status,
      resolution_note: conflict.resolutionNote ?? KNOWN_DUPLICATE_UPC_REASON,
    })),
  );
  if (conflictError) {
    console.error(conflictError.message);
    process.exit(1);
  }
}

const familyRows = [...families].map((key) => {
  const sample = parsed.rows.find((row) => row.familyKey === key);
  if (!sample) throw new Error(`missing family ${key}`);
  return {
    line_id: line.id,
    family_key: key,
    name: sample.familyName,
    category: sample.category,
    capacity: sample.capacity,
    made_in_usa: sample.madeInUsa,
    status: 'active',
  };
});

const { error: familyError } = await supabase
  .from('catalog_products')
  .upsert(familyRows, { onConflict: 'line_id,family_key' });
if (familyError) {
  console.error(familyError.message);
  process.exit(1);
}

const { data: products, error: productReadError } = await supabase
  .from('catalog_products')
  .select('id, family_key')
  .eq('line_id', line.id);
if (productReadError || !products) {
  console.error(productReadError?.message ?? 'could not read catalog products');
  process.exit(1);
}
const productIdByKey = new Map(products.map((product) => [product.family_key, product.id]));

const itemRows = parsed.rows.map((row) => ({
  line_id: line.id,
  catalog_product_id: productIdByKey.get(row.familyKey),
  cat: row.category,
  department: departmentForCategory(row.category),
  sku: row.sku,
  name: row.familyName,
  color: row.color,
  upc: row.upc,
  product_family: row.familyName,
  brand: 'Wyld Gear',
  price_usd: row.wholesaleUsd,
  catalog_price_usd: row.wholesaleUsd,
  msrp_usd: row.msrpUsd,
  msrp_cad: 0,
  catalog_msrp_cad: 0,
  made_in_usa_claim: row.madeInUsa,
  status: 'active',
  is_publicly_published: false,
}));

const { error: itemError } = await supabase
  .from('catalog_items')
  .upsert(itemRows, { onConflict: 'line_id,sku' });
if (itemError) {
  console.error(itemError.message);
  process.exit(1);
}

const { error: validatedError } = await supabase
  .from('lines')
  .update({ catalog_status: 'validated', status: 'active' })
  .eq('id', line.id);
if (validatedError) {
  console.error(validatedError.message);
  process.exit(1);
}

const { error: activeCatalogError } = await supabase
  .from('lines')
  .update({ catalog_status: 'active' })
  .eq('id', line.id);
if (activeCatalogError) {
  console.error(activeCatalogError.message);
  process.exit(1);
}

const { data: territories, error: territoryReadError } = await supabase
  .from('territories')
  .select('id, code')
  .in('code', ['or', 'wa', 'norcal']);
if (territoryReadError || !territories) {
  console.error(territoryReadError?.message ?? 'territories missing');
  process.exit(1);
}

const { error: territoryError } = await supabase
  .from('sales_line_territories')
  .update({ status: 'active' })
  .eq('sales_line_id', line.id)
  .in(
    'territory_id',
    territories.map((territory) => territory.id),
  );
if (territoryError) {
  console.error(territoryError.message);
  process.exit(1);
}

await supabase
  .from('catalog_import_runs')
  .update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    report: {
      season: WYLD_PRICE_LIST_SEASON,
      familyCount: families.size,
      skuCount: parsed.rows.length,
      blockingConflicts: 0,
      knownUpcException: KNOWN_DUPLICATE_UPC_REASON,
    },
  })
  .eq('id', run.id);

console.log(
  `Promoted ${parsed.rows.length} SKUs in ${families.size} families and activated wyld-gear.`,
);
