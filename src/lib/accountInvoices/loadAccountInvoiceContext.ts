/**
 * Load latest imported invoice context for active-account prep and Add copy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export type AccountInvoiceLineContext = {
  skuBase: string;
  styleName: string;
  quantity: number;
  catalogItemId: string | null;
};

export type AccountInvoiceContext = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  billToName: string | null;
  topCatalogItemId: string | null;
  topSkuBase: string | null;
  topStyleName: string | null;
  topQuantity: number;
  topLines: AccountInvoiceLineContext[];
  otherCatalogItemIds: string[];
};

const ACCOUNT_INVOICE_CONTEXT_TOP_LINES = 5;

function aggregateLines(
  rows: Array<{
    sku_base: string;
    style_name: string;
    quantity: number;
    catalog_item_id: string | null;
  }>,
): AccountInvoiceLineContext[] {
  const bySku = new Map<string, AccountInvoiceLineContext>();
  for (const row of rows) {
    const prev = bySku.get(row.sku_base);
    if (!prev) {
      bySku.set(row.sku_base, {
        skuBase: row.sku_base,
        styleName: row.style_name,
        quantity: row.quantity,
        catalogItemId: row.catalog_item_id,
      });
    } else {
      prev.quantity += row.quantity;
      if (row.style_name.length > prev.styleName.length) prev.styleName = row.style_name;
      if (!prev.catalogItemId && row.catalog_item_id) prev.catalogItemId = row.catalog_item_id;
    }
  }
  return [...bySku.values()].sort(
    (a, b) => b.quantity - a.quantity || a.skuBase.localeCompare(b.skuBase),
  );
}

function contextFromInvoice(
  invoice: {
    id: string;
    invoice_number: string;
    invoice_date: string;
    bill_to_name: string | null;
  },
  lineRows: Array<{
    sku_base: string;
    style_name: string;
    quantity: number;
    catalog_item_id: string | null;
  }>,
): AccountInvoiceContext {
  const topLines = aggregateLines(lineRows).slice(0, ACCOUNT_INVOICE_CONTEXT_TOP_LINES);
  const top = topLines[0];
  const otherCatalogItemIds = topLines
    .slice(1)
    .map((l) => l.catalogItemId)
    .filter((id): id is string => Boolean(id));

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    billToName: invoice.bill_to_name,
    topCatalogItemId: top?.catalogItemId ?? null,
    topSkuBase: top?.skuBase ?? null,
    topStyleName: top?.styleName ?? null,
    topQuantity: top?.quantity ?? 0,
    topLines,
    otherCatalogItemIds,
  };
}

/**
 * Latest invoice per account (by invoice_date, then imported_at).
 */
export async function loadLatestInvoiceContextForAccounts(
  client: DbClient,
  accountIds: number[],
): Promise<Map<number, AccountInvoiceContext>> {
  const ids = [...new Set(accountIds.filter((id) => Number.isFinite(id)))];
  const out = new Map<number, AccountInvoiceContext>();
  if (ids.length === 0) return out;

  const { data: invoices, error } = await client
    .from('account_invoices')
    .select('id, account_id, invoice_number, invoice_date, bill_to_name, imported_at')
    .in('account_id', ids)
    .order('invoice_date', { ascending: false })
    .order('imported_at', { ascending: false });

  if (error || !invoices?.length) return out;

  const latestInvoiceByAccount = new Map<number, (typeof invoices)[number]>();
  for (const row of invoices) {
    if (!latestInvoiceByAccount.has(row.account_id)) {
      latestInvoiceByAccount.set(row.account_id, row);
    }
  }

  const invoiceIds = [...latestInvoiceByAccount.values()].map((r) => r.id);
  const { data: lines, error: linesError } = await client
    .from('account_invoice_lines')
    .select('invoice_id, sku_base, style_name, quantity, catalog_item_id')
    .in('invoice_id', invoiceIds);

  if (linesError || !lines) return out;

  const linesByInvoice = new Map<string, typeof lines>();
  for (const line of lines) {
    const bucket = linesByInvoice.get(line.invoice_id) ?? [];
    bucket.push(line);
    linesByInvoice.set(line.invoice_id, bucket);
  }

  for (const [accountId, invoice] of latestInvoiceByAccount.entries()) {
    const invoiceLines = linesByInvoice.get(invoice.id) ?? [];
    if (invoiceLines.length === 0) continue;
    out.set(accountId, contextFromInvoice(invoice, invoiceLines));
  }

  return out;
}

export async function loadLatestInvoiceContextForAccount(
  client: DbClient,
  accountId: number,
): Promise<AccountInvoiceContext | null> {
  const map = await loadLatestInvoiceContextForAccounts(client, [accountId]);
  return map.get(accountId) ?? null;
}
