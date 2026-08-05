import { supabase } from '@/lib/supabase';
import type { CatalogItem } from '@/lib/catalog';

export async function uploadCatalogImage(input: {
  sku: string;
  id: string;
  file: File;
}): Promise<{ ok: true; item: CatalogItem } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };

  const form = new FormData();
  form.set('id', input.id);
  form.set('file', input.file);

  const res = await fetch(`/api/catalog/items/${encodeURIComponent(input.sku)}/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  let payload: { ok?: boolean; item?: CatalogItem; error?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { ok: false, error: `Upload failed (${res.status})` };
  }

  if (!res.ok || !payload.ok || !payload.item) {
    return { ok: false, error: payload.error || `Upload failed (${res.status})` };
  }
  return { ok: true, item: payload.item };
}
