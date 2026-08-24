import type { AgentSupabase } from '@/lib/agentAuth';
import {
  isAccountResearchPlatformScope,
  type AccountResearchPlatformScope,
} from '@/lib/accountResearch/constants';
import type { AccountResearchSourceLock } from '@/types/database';

export type SourceLockMap = Partial<
  Record<AccountResearchPlatformScope, AccountResearchSourceLock>
>;

export async function loadSourceLocks(
  supabase: AgentSupabase,
  retailerId: number,
): Promise<SourceLockMap> {
  const { data, error } = await supabase
    .from('account_research_source_locks')
    .select('*')
    .eq('retailer_id', retailerId);
  if (error || !data) return {};

  const out: SourceLockMap = {};
  for (const row of data as AccountResearchSourceLock[]) {
    if (!isAccountResearchPlatformScope(row.source_type)) continue;
    out[row.source_type] = row;
  }
  return out;
}
