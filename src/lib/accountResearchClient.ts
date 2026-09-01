import type { AccountResearchV1Scope } from '@/lib/accountResearch/constants';
import type { SuggestionWithCitations } from '@/lib/accountResearch/suggestions';
import type { MatchItemResponse } from '@/lib/accountProductMatch';
import { supabase } from '@/lib/supabase';
import type { Prospect } from '@/lib/prospects';
import type {
  AccountProductMatchEmptyReason,
  AccountProductMatchRun,
  AccountResearchCitation,
  AccountResearchRun,
  AccountResearchSourceLock,
  AccountResearchSourceSearch,
} from '@/types/database';

export type ApiFail = { ok: false; error: string };

export type AccountResearchSnapshotDto = {
  run: AccountResearchRun;
  sources: AccountResearchSourceSearch[];
  citationsBySourceId: Record<string, AccountResearchCitation[]>;
  sourceFreshness: Record<string, boolean>;
  locksBySourceType: Record<string, AccountResearchSourceLock>;
};

export type LatestAccountResearchResult =
  | {
      ok: true;
      outcome: 'none';
      run: null;
      locksBySourceType: Record<string, AccountResearchSourceLock>;
    }
  | ({ ok: true; outcome: 'found' } & AccountResearchSnapshotDto);

export type LockAccountResearchResult =
  | ({ ok: true } & AccountResearchSnapshotDto)
  | {
      ok: true;
      run: null;
      locksBySourceType: Record<string, AccountResearchSourceLock>;
    }
  | ApiFail;

export type StartAccountResearchResult =
  | ({ ok: true; outcome: string } & AccountResearchSnapshotDto)
  | { ok: false; error: string; outcome?: string };

export type ProcessAccountResearchResult =
  | ({
      ok: true;
      processed: boolean;
      sourceId: string | null;
      done: boolean;
    } & AccountResearchSnapshotDto)
  | ApiFail;

export type ProductMatchClientResult =
  | {
      ok: true;
      outcome: 'matched';
      run: AccountProductMatchRun;
      items: MatchItemResponse[];
    }
  | {
      ok: true;
      outcome: 'empty';
      run: AccountProductMatchRun;
      items: [];
      empty_reason: AccountProductMatchEmptyReason;
    }
  | { ok: false; error: string; outcome?: string };

export type LoadedProductMatch = {
  run: AccountProductMatchRun;
  items: MatchItemResponse[];
};

async function staffFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ res: Response; payload: Record<string, unknown> } | ApiFail> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'Not signed in' };

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network request failed',
    };
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Request failed (${res.status})` };
  }
  return { res, payload };
}

function parseLocksBySourceType(locksRaw: unknown): Record<string, AccountResearchSourceLock> {
  if (!locksRaw || typeof locksRaw !== 'object' || Array.isArray(locksRaw)) return {};
  return locksRaw as Record<string, AccountResearchSourceLock>;
}

function parseSnapshot(payload: Record<string, unknown>): AccountResearchSnapshotDto | null {
  const run = payload.run;
  const sources = payload.sources;
  const citationsBySourceId = payload.citationsBySourceId;
  const sourceFreshness = payload.sourceFreshness;
  if (!run || typeof run !== 'object' || !Array.isArray(sources)) return null;
  if (!citationsBySourceId || typeof citationsBySourceId !== 'object') return null;
  if (!sourceFreshness || typeof sourceFreshness !== 'object') return null;
  return {
    run: run as AccountResearchRun,
    sources: sources as AccountResearchSourceSearch[],
    citationsBySourceId: citationsBySourceId as Record<string, AccountResearchCitation[]>,
    sourceFreshness: sourceFreshness as Record<string, boolean>,
    locksBySourceType: parseLocksBySourceType(payload.locksBySourceType),
  };
}

export async function fetchLatestAccountResearch(
  retailerId: number,
  scope: AccountResearchV1Scope = 'all',
): Promise<LatestAccountResearchResult | ApiFail> {
  const qs = new URLSearchParams({
    retailerId: String(retailerId),
    scope,
  });
  const result = await staffFetch(`/api/staff/account-research/latest?${qs.toString()}`);
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }

  if (payload.outcome === 'none' || payload.run == null) {
    return {
      ok: true,
      outcome: 'none',
      run: null,
      locksBySourceType: parseLocksBySourceType(payload.locksBySourceType),
    };
  }

  const snapshot = parseSnapshot(payload);
  if (!snapshot) return { ok: false, error: 'Invalid research snapshot' };
  return { ok: true, outcome: 'found', ...snapshot };
}

export async function startAccountResearch(input: {
  retailerId: number;
  scope?: AccountResearchV1Scope;
  forceRefresh?: boolean;
}): Promise<StartAccountResearchResult> {
  const result = await staffFetch('/api/staff/account-research/run', {
    method: 'POST',
    body: JSON.stringify({
      retailerId: input.retailerId,
      scope: input.scope ?? 'all',
      forceRefresh: input.forceRefresh ?? false,
    }),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
      outcome: typeof payload.outcome === 'string' ? payload.outcome : undefined,
    };
  }

  const snapshot = parseSnapshot(payload);
  if (!snapshot) return { ok: false, error: 'Invalid research snapshot' };
  return {
    ok: true,
    outcome: typeof payload.outcome === 'string' ? payload.outcome : 'started',
    ...snapshot,
  };
}

export async function processAccountResearchSource(
  runId: string,
): Promise<ProcessAccountResearchResult> {
  const result = await staffFetch(`/api/staff/account-research/${runId}/process`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }

  const snapshot = parseSnapshot(payload);
  if (!snapshot) return { ok: false, error: 'Invalid research snapshot' };
  return {
    ok: true,
    processed: payload.processed === true,
    sourceId: typeof payload.sourceId === 'string' ? payload.sourceId : null,
    done: payload.done === true,
    ...snapshot,
  };
}

export type VerifyYelpDirectoryMatchClientResult =
  | ({
      ok: true;
      match: {
        businessName: string;
        confidence: string;
        matchMethod: string;
        score: number;
        listingUrl: string;
        categories: string[];
      };
      citationIds: string[];
    } & AccountResearchSnapshotDto)
  | ApiFail;

export async function verifyYelpDirectoryMatch(
  runId: string,
): Promise<VerifyYelpDirectoryMatchClientResult> {
  const result = await staffFetch(`/api/staff/account-research/${runId}/yelp-verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error:
        typeof payload.error === 'string' ? payload.error : `Yelp verify failed (${res.status})`,
    };
  }

  const snapshot = parseSnapshot(payload);
  if (!snapshot) return { ok: false, error: 'Invalid research snapshot' };

  const matchPayload = payload.match;
  if (!matchPayload || typeof matchPayload !== 'object') {
    return { ok: false, error: 'Invalid Yelp match payload' };
  }

  const match = matchPayload as Record<string, unknown>;
  return {
    ok: true,
    match: {
      businessName: String(match.businessName ?? ''),
      confidence: String(match.confidence ?? ''),
      matchMethod: String(match.matchMethod ?? ''),
      score: Number(match.score ?? 0),
      listingUrl: String(match.listingUrl ?? ''),
      categories: Array.isArray(match.categories) ? match.categories.map(String) : [],
    },
    citationIds: Array.isArray(payload.citationIds) ? payload.citationIds.map(String) : [],
    ...snapshot,
  };
}

export async function lockAccountResearchSource(input: {
  retailerId: number;
  sourceType: string;
  url: string;
}): Promise<LockAccountResearchResult> {
  const result = await staffFetch('/api/staff/account-research/lock', {
    method: 'POST',
    body: JSON.stringify({
      retailerId: input.retailerId,
      sourceType: input.sourceType,
      url: input.url,
    }),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }

  const snapshot = parseSnapshot(payload);
  if (snapshot) return { ok: true, ...snapshot };
  return {
    ok: true,
    run: null,
    locksBySourceType: parseLocksBySourceType(payload.locksBySourceType),
  };
}

export async function unlockAccountResearchSource(input: {
  retailerId: number;
  sourceType: string;
}): Promise<LockAccountResearchResult> {
  const result = await staffFetch('/api/staff/account-research/lock', {
    method: 'POST',
    body: JSON.stringify({
      retailerId: input.retailerId,
      sourceType: input.sourceType,
      unlock: true,
    }),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }

  const snapshot = parseSnapshot(payload);
  if (snapshot) return { ok: true, ...snapshot };
  return {
    ok: true,
    run: null,
    locksBySourceType: parseLocksBySourceType(payload.locksBySourceType),
  };
}

export async function runAccountResearchUntilDone(
  runId: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (snapshot: AccountResearchSnapshotDto) => void;
    delayMs?: number;
  },
): Promise<ProcessAccountResearchResult> {
  const delayMs = options?.delayMs ?? 1000;

  while (true) {
    if (options?.signal?.aborted) {
      return { ok: false, error: 'Aborted' };
    }

    const step = await processAccountResearchSource(runId);
    if (!step.ok) return step;

    options?.onProgress?.(step);
    if (step.done) return step;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, delayMs);
      if (!options?.signal) return;
      options.signal.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    }).catch(() => {
      /* aborted */
    });

    if (options?.signal?.aborted) {
      return { ok: false, error: 'Aborted' };
    }
  }
}

export async function getAccountResearchRun(
  runId: string,
): Promise<({ ok: true } & AccountResearchSnapshotDto) | ApiFail> {
  const result = await staffFetch(`/api/staff/account-research/${runId}`);
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }

  const snapshot = parseSnapshot(payload);
  if (!snapshot) return { ok: false, error: 'Invalid research snapshot' };
  return { ok: true, ...snapshot };
}

export async function listAccountResearchSuggestions(
  runId: string,
): Promise<{ ok: true; suggestions: SuggestionWithCitations[] } | ApiFail> {
  const result = await staffFetch(`/api/staff/account-research/${runId}/suggestions`);
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }

  const suggestions = Array.isArray(payload.suggestions)
    ? (payload.suggestions as SuggestionWithCitations[])
    : [];
  return { ok: true, suggestions };
}

export async function generateAccountResearchSuggestions(
  runId: string,
  input?: { forceRegenerate?: boolean },
): Promise<{ ok: true; suggestions: SuggestionWithCitations[] } | ApiFail> {
  const result = await staffFetch(`/api/staff/account-research/${runId}/suggestions/generate`, {
    method: 'POST',
    body: JSON.stringify({ forceRegenerate: input?.forceRegenerate ?? false }),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`,
    };
  }

  const suggestions = Array.isArray(payload.suggestions)
    ? (payload.suggestions as SuggestionWithCitations[])
    : [];
  return { ok: true, suggestions };
}

export async function applyAccountResearchSuggestion(
  suggestionId: string,
  input?: { confirmVerifiedOverwrite?: boolean },
): Promise<{ ok: true; prospect: Prospect } | ApiFail> {
  const result = await staffFetch(`/api/staff/account-research/suggestions/${suggestionId}/apply`, {
    method: 'POST',
    body: JSON.stringify({
      confirmVerifiedOverwrite: input?.confirmVerifiedOverwrite ?? false,
    }),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true || !payload.prospect || typeof payload.prospect !== 'object') {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Apply failed (${res.status})`,
    };
  }
  return { ok: true, prospect: payload.prospect as Prospect };
}

export async function rejectAccountResearchSuggestion(
  suggestionId: string,
): Promise<{ ok: true } | ApiFail> {
  const result = await staffFetch(
    `/api/staff/account-research/suggestions/${suggestionId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
  if (!('res' in result)) return result;

  const { res, payload } = result;
  if (!res.ok || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Reject failed (${res.status})`,
    };
  }
  return { ok: true };
}

function parseMatchItems(raw: unknown): MatchItemResponse[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is MatchItemResponse => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.id === 'string' &&
      typeof row.catalog_item_id === 'string' &&
      typeof row.sku === 'string' &&
      typeof row.name === 'string'
    );
  });
}

export async function createAccountProductMatchClient(input: {
  retailerId: number;
  salesLineId: string;
  researchRunId: string;
  ignoreRecentSendDedup?: boolean;
}): Promise<ProductMatchClientResult> {
  const result = await staffFetch('/api/staff/account-product-match/run', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!('res' in result)) return result;

  const { res, payload } = result;
  const classifiedEmpty = res.status === 409 && payload.ok === true && payload.outcome === 'empty';
  if ((!res.ok && !classifiedEmpty) || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload.error === 'string' ? payload.error : `Match failed (${res.status})`,
      outcome: typeof payload.outcome === 'string' ? payload.outcome : undefined,
    };
  }

  const run = payload.run as AccountProductMatchRun;
  if (!run || typeof run !== 'object') {
    return { ok: false, error: 'Invalid match run response' };
  }

  if (payload.outcome === 'empty') {
    return {
      ok: true,
      outcome: 'empty',
      run,
      items: [],
      empty_reason: payload.empty_reason as AccountProductMatchEmptyReason,
    };
  }

  return {
    ok: true,
    outcome: 'matched',
    run,
    items: parseMatchItems(payload.items),
  };
}

export async function loadLatestProductMatch(input: {
  retailerId: number;
  salesLineId: string;
  researchRunId: string;
}): Promise<LoadedProductMatch | null> {
  const { data: run, error } = await supabase
    .from('account_product_match_runs')
    .select('*')
    .eq('retailer_id', input.retailerId)
    .eq('sales_line_id', input.salesLineId)
    .eq('research_run_id', input.researchRunId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !run) return null;

  const { data: itemRows } = await supabase
    .from('account_product_match_items')
    .select('*')
    .eq('match_run_id', run.id)
    .order('rank', { ascending: true });

  const items = itemRows ?? [];
  if (items.length === 0) {
    return { run, items: [] };
  }

  const itemIds = items.map((i) => i.id);
  const { data: junctions } = await supabase
    .from('account_product_match_item_citations')
    .select('match_item_id, citation_id')
    .in('match_item_id', itemIds);

  const citationsByItem = new Map<string, string[]>();
  for (const junction of junctions ?? []) {
    const list = citationsByItem.get(junction.match_item_id) ?? [];
    list.push(junction.citation_id);
    citationsByItem.set(junction.match_item_id, list);
  }

  const catalogIds = items.map((i) => i.catalog_item_id);
  const { data: catalogRows } = await supabase
    .from('catalog_items')
    .select('id, sku, name')
    .in('id', catalogIds);
  const catalogById = new Map((catalogRows ?? []).map((row) => [row.id, row] as const));

  return {
    run,
    items: items.map((item) => {
      const catalog = catalogById.get(item.catalog_item_id);
      return {
        id: item.id,
        rank: item.rank,
        catalog_item_id: item.catalog_item_id,
        sku: catalog?.sku ?? '',
        name: catalog?.name ?? '',
        product_fit: item.product_fit,
        rationale: item.rationale,
        citation_ids: citationsByItem.get(item.id) ?? [],
      };
    }),
  };
}
