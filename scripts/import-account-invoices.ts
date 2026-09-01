/**
 * Import Vintage Goods invoice PDFs from docs/account-invoices/ogr into Supabase.
 *
 * Usage (from repo root):
 *   npm run import:account-invoices
 *   npm run import:account-invoices -- --dry-run
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';
import {
  parseVintageGoodsInvoiceText,
  topVintageGoodsSkus,
} from '../src/lib/accountInvoices/parseVintageGoodsInvoice.ts';
import { resolveAccountForInvoice } from '../src/lib/accountInvoices/matchAccount.ts';
import {
  buildCatalogSkuIndex,
  matchCatalogItemIdForInvoiceSku,
} from '../src/lib/accountInvoices/matchCatalogSku.ts';
import type { Database } from '../src/types/database.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const invoiceDir = join(root, 'docs/account-invoices/ogr');

const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Need PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const client = createClient<Database>(url, key, { auth: { persistSession: false } });

type ParsedFile = {
  filename: string;
  parsed: NonNullable<ReturnType<typeof parseVintageGoodsInvoiceText>>;
};

async function main() {
  const pdfFiles = readdirSync(invoiceDir)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .sort();

  if (pdfFiles.length === 0) {
    console.log(JSON.stringify({ ok: true, message: 'No PDF files found', dir: invoiceDir }));
    return;
  }

  const { data: activeAccounts, error: accountsError } = await client
    .from('prospects')
    .select('id, name')
    .eq('account_status', 'active_account')
    .order('id');

  if (accountsError) {
    console.error(accountsError.message);
    process.exit(1);
  }

  const candidates = (activeAccounts ?? []).map((row) => ({ id: row.id, name: row.name }));

  const { data: ogrLine, error: ogrLineError } = await client
    .from('lines')
    .select('id')
    .eq('code', 'ogr')
    .maybeSingle();

  if (ogrLineError || !ogrLine?.id) {
    console.error(ogrLineError?.message ?? 'OGR line not found');
    process.exit(1);
  }
  const ogrLineId = ogrLine.id;

  const { data: catalogRows, error: catalogError } = await client
    .from('catalog_items')
    .select('id, sku, normalized_sku, live_sku')
    .eq('line_id', ogrLineId);

  if (catalogError) {
    console.error(catalogError.message);
    process.exit(1);
  }

  const catalogIndex = buildCatalogSkuIndex(catalogRows ?? []);

  const parsedFiles: ParsedFile[] = [];
  const failures: Array<{ filename: string; reason: string }> = [];

  for (const filename of pdfFiles) {
    const buffer = readFileSync(join(invoiceDir, filename));
    const extracted = await pdf(buffer);
    const parsed = parseVintageGoodsInvoiceText(extracted.text);
    if (!parsed) {
      failures.push({ filename, reason: 'Could not parse Vintage Goods invoice text' });
      continue;
    }
    parsedFiles.push({ filename, parsed });
  }

  const byAccount = new Map<number, ParsedFile>();
  for (const file of parsedFiles) {
    const account = resolveAccountForInvoice({
      filename: file.filename,
      billToName: file.parsed.billToName,
      candidates,
    });
    if (!account) {
      failures.push({
        filename: file.filename,
        reason: `No active account match for bill-to "${file.parsed.billToName}"`,
      });
      continue;
    }

    const existing = byAccount.get(account.id);
    if (!existing || file.parsed.invoiceDate > existing.parsed.invoiceDate) {
      if (existing && existing.parsed.invoiceDate >= file.parsed.invoiceDate) {
        failures.push({
          filename: file.filename,
          reason: `Skipped older invoice than ${existing.filename} for account ${account.id}`,
        });
      }
      byAccount.set(account.id, { ...file, filename: file.filename });
    } else {
      failures.push({
        filename: file.filename,
        reason: `Skipped older invoice for account ${account.id}`,
      });
    }
  }

  const imported: Array<Record<string, unknown>> = [];
  const unmatchedSkus = new Set<string>();

  for (const [accountId, file] of byAccount.entries()) {
    const account = candidates.find((c) => c.id === accountId);
    const aggregated = topVintageGoodsSkus(file.parsed.lines, 20);
    const lineRows = aggregated.map((row) => {
      const catalogItemId = matchCatalogItemIdForInvoiceSku(row.skuBase, catalogIndex);
      if (!catalogItemId) unmatchedSkus.add(row.skuBase);
      return {
        sku_base: row.skuBase,
        style_name: row.styleName,
        quantity: row.totalQuantity,
        catalog_item_id: catalogItemId,
      };
    });

    const summary = {
      accountId,
      accountName: account?.name ?? null,
      filename: file.filename,
      invoiceNumber: file.parsed.invoiceNumber,
      invoiceDate: file.parsed.invoiceDate,
      billToName: file.parsed.billToName,
      topSku: aggregated[0]?.skuBase ?? null,
      topQuantity: aggregated[0]?.totalQuantity ?? 0,
      lineCount: lineRows.length,
    };

    if (dryRun) {
      imported.push({ ...summary, dryRun: true });
      continue;
    }

    const { data: existingInvoice, error: existingError } = await client
      .from('account_invoices')
      .select('id')
      .eq('account_id', accountId)
      .eq('line_id', ogrLineId)
      .eq('invoice_number', file.parsed.invoiceNumber)
      .maybeSingle();

    if (existingError) {
      failures.push({ filename: file.filename, reason: existingError.message });
      continue;
    }

    let invoiceId = existingInvoice?.id ?? null;
    if (!invoiceId) {
      const { data: inserted, error: insertError } = await client
        .from('account_invoices')
        .insert({
          account_id: accountId,
          line_id: ogrLineId,
          invoice_number: file.parsed.invoiceNumber,
          invoice_date: file.parsed.invoiceDate,
          source_filename: file.filename,
          bill_to_name: file.parsed.billToName || null,
        })
        .select('id')
        .single();
      if (insertError || !inserted) {
        failures.push({ filename: file.filename, reason: insertError?.message ?? 'Insert failed' });
        continue;
      }
      invoiceId = inserted.id;
    } else {
      const { error: updateError } = await client
        .from('account_invoices')
        .update({
          invoice_date: file.parsed.invoiceDate,
          source_filename: file.filename,
          bill_to_name: file.parsed.billToName || null,
          imported_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);
      if (updateError) {
        failures.push({ filename: file.filename, reason: updateError.message });
        continue;
      }
      const { error: deleteLinesError } = await client
        .from('account_invoice_lines')
        .delete()
        .eq('invoice_id', invoiceId);
      if (deleteLinesError) {
        failures.push({ filename: file.filename, reason: deleteLinesError.message });
        continue;
      }
    }

    const { error: linesError } = await client.from('account_invoice_lines').insert(
      lineRows.map((row) => ({
        invoice_id: invoiceId,
        sku_base: row.sku_base,
        style_name: row.style_name,
        quantity: row.quantity,
        catalog_item_id: row.catalog_item_id,
      })),
    );

    if (linesError) {
      failures.push({ filename: file.filename, reason: linesError.message });
      continue;
    }

    imported.push(summary);
  }

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        dryRun,
        pdfFiles: pdfFiles.length,
        parsed: parsedFiles.length,
        imported: imported.length,
        importedRows: imported,
        failures,
        unmatchedSkus: [...unmatchedSkus].sort(),
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
