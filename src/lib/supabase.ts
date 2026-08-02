import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

const hasCredentials = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasCredentials) {
  // Expected in CI/static builds run without a .env — keeps `astro build`
  // from throwing so pages that don't touch Supabase still prerender.
  // Any code path that actually calls the client at runtime will fail
  // against the placeholder project below; set the env vars to fix that.
  console.warn(
    '[supabase] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are not set — ' +
      'Supabase calls will fail until they are configured in .env (local) ' +
      'or your Vercel project environment variables.',
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  hasCredentials ? supabaseUrl : 'https://placeholder.supabase.co',
  hasCredentials ? supabaseAnonKey : 'placeholder-anon-key',
);

export const isSupabaseConfigured = hasCredentials;
