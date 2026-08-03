import { supabase } from '@/lib/supabase';
import type { AccountReorderSettings, AccountReorderSettingsInsert } from '@/types/database';

export const ACCOUNT_REORDER_SETTINGS_SELECT =
  'account_id, last_order_date, next_suggested_contact_date, seasonal_cadence_tags, ai_reorder_notes, updated_at' as const;

export type AccountReorderSettingsRow = AccountReorderSettings;

export async function fetchAccountReorderSettings(
  accountId: number,
): Promise<{ data: AccountReorderSettingsRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('account_reorder_settings')
    .select(ACCOUNT_REORDER_SETTINGS_SELECT)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data as AccountReorderSettingsRow | null) ?? null, error: null };
}

export async function upsertAccountReorderSettings(
  input: AccountReorderSettingsInsert,
): Promise<{ data: AccountReorderSettingsRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('account_reorder_settings')
    .upsert(input, { onConflict: 'account_id' })
    .select(ACCOUNT_REORDER_SETTINGS_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as AccountReorderSettingsRow, error: null };
}
