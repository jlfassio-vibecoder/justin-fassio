/**
 * Resolve optional sales_line_id / line slug query for Phase 2 staff GET routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { isRepresentedLineCode } from '@/lib/lines';

type Client = SupabaseClient<Database>;

export type ResolvedSalesLine = {
  id: string;
  code: string;
  name: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveSalesLineQuery(
  client: Client,
  raw: string | null | undefined,
): Promise<
  { ok: true; line: ResolvedSalesLine | null } | { ok: false; status: 400 | 404; error: string }
> {
  const value = raw?.trim() ?? '';
  if (!value) {
    return { ok: true, line: null };
  }

  if (UUID_RE.test(value)) {
    const { data, error } = await client
      .from('lines')
      .select('id, code, name')
      .eq('id', value)
      .maybeSingle();
    if (error) return { ok: false, status: 400, error: error.message };
    if (!data) return { ok: false, status: 404, error: 'Unknown sales line' };
    if (!isRepresentedLineCode(data.code)) {
      return { ok: false, status: 404, error: 'Unknown sales line' };
    }
    return { ok: true, line: { id: data.id, code: data.code, name: data.name } };
  }

  const code = value.toLowerCase();
  if (!isRepresentedLineCode(code)) {
    return { ok: false, status: 404, error: 'Unknown sales line' };
  }

  const { data, error } = await client
    .from('lines')
    .select('id, code, name')
    .eq('code', code)
    .maybeSingle();
  if (error) return { ok: false, status: 400, error: error.message };
  if (!data) return { ok: false, status: 404, error: 'Unknown sales line' };
  return { ok: true, line: { id: data.id, code: data.code, name: data.name } };
}
