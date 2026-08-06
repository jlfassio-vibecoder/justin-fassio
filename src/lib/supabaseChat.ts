import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const hasCredentials = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Separate auth storage from the staff/app client so anonymous chat
 * sessions never clobber an approved-staff login.
 */
export const supabaseChat: SupabaseClient<Database> = createClient<Database>(
  hasCredentials ? supabaseUrl! : 'https://placeholder.supabase.co',
  hasCredentials ? supabaseAnonKey! : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'jf-live-chat-auth',
      flowType: 'pkce',
    },
  },
);
