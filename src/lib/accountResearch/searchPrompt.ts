/** Force the model to pass our query string through to Exa Search unchanged. */
export function buildForcedExaSearchPrompt(args: {
  queryText: string;
  platformFocus: string;
  extraLines?: string[];
}): string {
  return [
    'You research public web evidence for a wholesale apparel sales rep.',
    'Call the exa_search tool exactly once.',
    `Set the tool parameter "query" to exactly this string (character-for-character, no edits):`,
    args.queryText,
    'Do not rewrite, expand, shorten, or translate the query.',
    'Never invent URLs. Prefer tool results only.',
    `Platform focus: ${args.platformFocus}`,
    ...(args.extraLines ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}
