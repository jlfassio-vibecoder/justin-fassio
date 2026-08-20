import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { resolvePricingMarketForBuyerProspect } from '@/lib/resolveAccountPricingMarket';
import { getServiceRoleClient } from '@/lib/supabaseAdmin';
import type { Database } from '@/types/database';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      Vary: 'Authorization',
    },
  });
}

/**
 * Privileged read of the caller's own OGR line-account market flags.
 * Verifies the buyer JWT first; service role is used only to load that
 * prospect's active SLT country_code (RLA/SLT are staff-only under RLS).
 */
export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Missing bearer token' }, 401);
  }

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, prospect_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    return json({ ok: false, error: profileError.message }, 500);
  }
  if (profile?.role !== 'buyer') {
    return json({ ok: true, market: null });
  }
  if (profile.prospect_id == null) {
    return json({ ok: true, market: null });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return json({ ok: true, market: null });
  }

  const market = await resolvePricingMarketForBuyerProspect(admin, profile.prospect_id);
  return json({ ok: true, market });
};
