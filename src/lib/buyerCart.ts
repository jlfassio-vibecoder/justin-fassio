import { supabase } from '@/lib/supabase';
import type { WholesaleOrderDraft, WholesaleOrderLine } from '@/lib/wholesaleOrderDraft';

export type BuyerCartItem = {
  id: string;
  catalogItemId: string;
  sku: string;
  name: string;
  size: string;
  quantity: number;
  wholesaleUsd: number | null;
  primaryImageUrl: string | null;
};

function mapCartRow(
  row: {
    id: string;
    catalog_item_id: string;
    sku: string;
    name: string;
    size: string;
    quantity: number;
    wholesale_usd: number | null;
    primary_image_url: string | null;
  },
  pricingUnlocked: boolean,
): BuyerCartItem {
  return {
    id: row.id,
    catalogItemId: row.catalog_item_id,
    sku: row.sku,
    name: row.name,
    size: row.size,
    quantity: row.quantity,
    // Copilot suggestion applied: never surface denormalized wholesale after revoke.
    wholesaleUsd: pricingUnlocked ? row.wholesale_usd : null,
    primaryImageUrl: row.primary_image_url,
  };
}

export function cartItemsToDraft(items: BuyerCartItem[]): WholesaleOrderDraft {
  return {
    lines: items.map((item) => ({
      productId: item.catalogItemId,
      sku: item.sku,
      name: item.name,
      size: item.size,
      wholesaleUsd: item.wholesaleUsd ?? 0,
      quantity: item.quantity,
      primaryImageUrl: item.primaryImageUrl,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchBuyerCartItems(
  userId: string,
): Promise<{ data: BuyerCartItem[]; error: string | null }> {
  const [{ data, error }, pricing] = await Promise.all([
    supabase
      .from('buyer_cart_items')
      .select('id, catalog_item_id, sku, name, size, quantity, wholesale_usd, primary_image_url')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    supabase.rpc('buyer_has_wholesale_pricing'),
  ]);

  if (error) return { data: [], error: error.message };
  const pricingUnlocked = pricing.data === true;
  return {
    data: (data ?? []).map((row) => mapCartRow(row, pricingUnlocked)),
    error: null,
  };
}

/** Replace server cart with local draft lines (merge-by-upsert then delete extras). */
export async function syncBuyerCartFromDraft(
  userId: string,
  lines: WholesaleOrderLine[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pricedLines = lines.filter((l) => l.quantity > 0 && Number.isFinite(l.wholesaleUsd));
  const { data: unlocked } = await supabase.rpc('buyer_has_wholesale_pricing');
  const pricingUnlocked = unlocked === true;

  const { data: existing, error: existingError } = await supabase
    .from('buyer_cart_items')
    .select('id, catalog_item_id, size')
    .eq('user_id', userId);

  if (existingError) return { ok: false, error: existingError.message };

  const keepKeys = new Set(pricedLines.map((l) => `${l.productId}::${l.size}`));
  const toDelete = (existing ?? [])
    .filter((row) => !keepKeys.has(`${row.catalog_item_id}::${row.size}`))
    .map((row) => row.id);

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('buyer_cart_items')
      .delete()
      .in('id', toDelete);
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  for (const line of pricedLines) {
    const { error } = await supabase.from('buyer_cart_items').upsert(
      {
        user_id: userId,
        catalog_item_id: line.productId,
        sku: line.sku,
        name: line.name,
        size: line.size,
        quantity: line.quantity,
        wholesale_usd: pricingUnlocked ? line.wholesaleUsd : null,
        primary_image_url: line.primaryImageUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,catalog_item_id,size' },
    );
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function clearBuyerCart(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('buyer_cart_items').delete().eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Serializes cart syncs so rapid edits cannot finish out of order. */
let cartSyncChain: Promise<unknown> = Promise.resolve();

export function enqueueBuyerCartSync(
  userId: string,
  lines: WholesaleOrderLine[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const run = cartSyncChain.then(() => syncBuyerCartFromDraft(userId, lines));
  cartSyncChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
