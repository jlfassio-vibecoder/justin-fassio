import { supabase } from '@/lib/supabase';

export async function fetchBuyerLikedProductIds(
  userId: string,
): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('buyer_product_likes')
    .select('catalog_item_id')
    .eq('user_id', userId);

  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((row) => row.catalog_item_id),
    error: null,
  };
}

export async function toggleBuyerProductLike(
  userId: string,
  catalogItemId: string,
  liked: boolean,
): Promise<{ ok: true; liked: boolean } | { ok: false; error: string }> {
  if (liked) {
    const { error } = await supabase.from('buyer_product_likes').upsert(
      {
        user_id: userId,
        catalog_item_id: catalogItemId,
      },
      { onConflict: 'user_id,catalog_item_id' },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true, liked: true };
  }

  const { error } = await supabase
    .from('buyer_product_likes')
    .delete()
    .eq('user_id', userId)
    .eq('catalog_item_id', catalogItemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, liked: false };
}
