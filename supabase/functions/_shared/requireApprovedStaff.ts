import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from './cors.ts';

export type ApprovedStaffResult =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; response: Response };

/**
 * Validates Bearer JWT + is_approved_staff RPC. Returns a user-scoped Supabase client on success.
 * Callers should handle OPTIONS via corsHeaders before invoking this, or accept the OPTIONS response here.
 */
export async function requireApprovedStaff(req: Request): Promise<ApprovedStaffResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Missing bearer token' }, 401),
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Server misconfigured' }, 500),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Unauthorized' }, 401),
    };
  }

  const { data: approved, error: rpcError } = await supabase.rpc('is_approved_staff');

  if (rpcError) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: rpcError.message }, 500),
    };
  }

  if (!approved) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Forbidden' }, 403),
    };
  }

  return { ok: true, supabase };
}

export function handleCorsOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}
