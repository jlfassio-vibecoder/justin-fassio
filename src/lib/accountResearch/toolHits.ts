/** Normalized SERP / Exa hit used by candidate builders. */
export type ToolHit = { url?: string; title?: string; snippet?: string; date?: string };

function snippetFromRow(r: Record<string, unknown>): string | undefined {
  if (typeof r.snippet === 'string' && r.snippet.trim()) return r.snippet;
  if (typeof r.description === 'string' && r.description.trim()) return r.description;
  if (typeof r.text === 'string' && r.text.trim()) return r.text;
  if (typeof r.summary === 'string' && r.summary.trim()) return r.summary;
  if (Array.isArray(r.highlights)) {
    const parts = r.highlights.filter(
      (h): h is string => typeof h === 'string' && h.trim().length > 0,
    );
    if (parts.length > 0) return parts.join(' ');
  }
  return undefined;
}

function pushHit(hits: ToolHit[], row: Record<string, unknown>) {
  const url = typeof row.url === 'string' ? row.url : undefined;
  if (!url) return;
  hits.push({
    url,
    title: typeof row.title === 'string' ? row.title : undefined,
    snippet: snippetFromRow(row),
    date:
      typeof row.date === 'string'
        ? row.date
        : typeof row.publishedDate === 'string'
          ? row.publishedDate
          : typeof row.lastUpdated === 'string'
            ? row.lastUpdated
            : undefined,
  });

  const extras = row.extras;
  if (!extras || typeof extras !== 'object') return;
  const links = (extras as { links?: unknown }).links;
  if (!Array.isArray(links)) return;
  for (const link of links) {
    if (typeof link === 'string' && link.trim()) {
      hits.push({
        url: link,
        title: typeof row.title === 'string' ? row.title : undefined,
        snippet: snippetFromRow(row),
      });
    }
  }
}

/** Pull results from Gateway tool payloads (Perplexity or Exa shape). */
export function extractSearchToolHits(search: {
  toolResults?: ReadonlyArray<{ output?: unknown; result?: unknown }>;
  steps?: ReadonlyArray<{
    toolResults?: ReadonlyArray<{ output?: unknown; result?: unknown }>;
  }>;
}): ToolHit[] {
  const hits: ToolHit[] = [];

  const consume = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    if ('error' in payload && typeof (payload as { error?: unknown }).error === 'string') return;
    const obj = payload as { results?: unknown };
    if (!Array.isArray(obj.results)) return;
    for (const row of obj.results) {
      if (!row || typeof row !== 'object') continue;
      pushHit(hits, row as Record<string, unknown>);
    }
  };

  for (const tr of search.toolResults ?? []) {
    consume(tr.output !== undefined ? tr.output : tr.result);
  }
  for (const step of search.steps ?? []) {
    for (const tr of step.toolResults ?? []) {
      consume(tr.output !== undefined ? tr.output : tr.result);
    }
  }

  return hits;
}
