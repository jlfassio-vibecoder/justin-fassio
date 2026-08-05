import { supabase } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/catalog';
import type { CatalogItemPatch } from '@/lib/updateCatalogItem';

async function bearerToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function patchCatalogItem(input: {
  sku: string;
  id: string;
  patch: CatalogItemPatch;
}): Promise<{ ok: true; item: CatalogItem } | { ok: false; error: string }> {
  const token = await bearerToken();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch(`/api/catalog/items/${encodeURIComponent(input.sku)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id: input.id, patch: input.patch }),
  });

  let payload: { ok?: boolean; item?: CatalogItem; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Update failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.item) {
    return { ok: false, error: payload.error || `Update failed (${res.status})` };
  }
  return { ok: true, item: payload.item };
}
