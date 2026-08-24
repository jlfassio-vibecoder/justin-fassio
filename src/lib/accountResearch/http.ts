import type { AccountResearchSnapshot } from '@/lib/accountResearch/snapshot';

export function jsonAccountResearch(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function snapshotPayload(snapshot: AccountResearchSnapshot) {
  return {
    run: snapshot.run,
    sources: snapshot.sources,
    citationsBySourceId: snapshot.citationsBySourceId,
    sourceFreshness: snapshot.sourceFreshness,
    locksBySourceType: snapshot.locksBySourceType,
  };
}
