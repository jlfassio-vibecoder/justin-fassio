import type { AgentSupabase } from '@/lib/agentAuth';
import { sourceFreshnessMap } from '@/lib/accountResearch/freshness';
import type {
  AccountResearchCitation,
  AccountResearchRun,
  AccountResearchSourceSearch,
} from '@/types/database';

export type AccountResearchSnapshot = {
  run: AccountResearchRun;
  sources: AccountResearchSourceSearch[];
  citationsBySourceId: Record<string, AccountResearchCitation[]>;
  sourceFreshness: Record<string, boolean>;
};

export async function loadAccountResearchSnapshot(
  supabase: AgentSupabase,
  runId: string,
): Promise<AccountResearchSnapshot | null> {
  const { data: run, error: runError } = await supabase
    .from('account_research_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  if (runError || !run) return null;

  const { data: sources, error: sourcesError } = await supabase
    .from('account_research_source_searches')
    .select('*')
    .eq('research_run_id', runId)
    .order('created_at', { ascending: true });
  if (sourcesError) return null;

  const sourceRows = (sources ?? []) as AccountResearchSourceSearch[];
  const sourceIds = sourceRows.map((s) => s.id);

  let citations: AccountResearchCitation[] = [];
  if (sourceIds.length > 0) {
    const { data: citationRows, error: citationError } = await supabase
      .from('account_research_citations')
      .select('*')
      .in('source_search_id', sourceIds)
      .order('observed_at', { ascending: false });
    if (citationError) return null;
    citations = (citationRows ?? []) as AccountResearchCitation[];
  }

  const citationsBySourceId: Record<string, AccountResearchCitation[]> = {};
  for (const source of sourceRows) citationsBySourceId[source.id] = [];
  for (const citation of citations) {
    const list = citationsBySourceId[citation.source_search_id] ?? [];
    list.push(citation);
    citationsBySourceId[citation.source_search_id] = list;
  }

  return {
    run: run as AccountResearchRun,
    sources: sourceRows,
    citationsBySourceId,
    sourceFreshness: sourceFreshnessMap(sourceRows),
  };
}
