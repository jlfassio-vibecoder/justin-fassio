import type { AccountEnrichmentJobStatus, AccountImportBatchStatus } from '@/types/database';

export const STALE_RUNNING_MS = 120_000;

export const ENRICHABLE_BATCH_STATUSES: readonly AccountImportBatchStatus[] = [
  'committed',
  'enriching',
  'enrichment_partial',
  'completed',
];

export type EnrichmentJobCounts = {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  pendingFieldChanges: number;
  total: number;
};

export type EnrichmentSnapshotRow = {
  id: string;
  retailerId: number;
  status: AccountEnrichmentJobStatus;
  error: string | null;
};

export type EnrichmentSnapshot = {
  batchId: string;
  batchStatus: AccountImportBatchStatus;
  jobs: EnrichmentJobCounts;
  rows: EnrichmentSnapshotRow[];
  pauseReason: 'rate_limit' | null;
};

export function isEnrichableBatchStatus(status: string): boolean {
  return (ENRICHABLE_BATCH_STATUSES as readonly string[]).includes(status);
}

export function isStaleRunning(updatedAt: string, now = Date.now()): boolean {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return true;
  return now - ts >= STALE_RUNNING_MS;
}

export function isGatewayRateLimitError(error: string): boolean {
  return /429|rate limit|too many requests/i.test(error);
}

export function cityStateAgrees(input: {
  city: string;
  region: string | null;
  address: string | null;
  brief: string | null;
}): boolean {
  const city = input.city.trim().toLowerCase();
  if (!city) return false;
  const hay = `${input.address ?? ''} ${input.brief ?? ''}`.toLowerCase();
  if (!hay.includes(city)) return false;
  const region = (input.region ?? '').trim().toLowerCase();
  const mentionsOregon = /\bor\b|oregon/.test(hay);
  const mentionsWashington = /\bwa\b|washington/.test(hay);
  if (region === 'oregon' || region === 'or') {
    if (mentionsWashington && !mentionsOregon) return false;
  }
  if (region === 'washington' || region === 'wa') {
    if (mentionsOregon && !mentionsWashington) return false;
  }
  return true;
}

export function hasMultipleOfficialSites(urls: string[] | null | undefined): boolean {
  if (!urls || urls.length < 2) return false;
  const hosts = new Set<string>();
  for (const raw of urls) {
    try {
      hosts.add(new URL(raw).hostname.replace(/^www\./i, '').toLowerCase());
    } catch {
      hosts.add(raw.trim().toLowerCase());
    }
  }
  return hosts.size > 1;
}

export function deriveBatchEnrichmentStatus(
  jobs: Array<{ status: string }>,
): AccountImportBatchStatus | null {
  if (jobs.length === 0) return null;
  if (jobs.some((job) => job.status === 'queued' || job.status === 'running')) return 'enriching';
  if (jobs.some((job) => job.status === 'failed')) return 'enrichment_partial';
  const completed = jobs.some((job) => job.status === 'completed');
  const cancelled = jobs.some((job) => job.status === 'cancelled');
  if (completed && cancelled) return 'enrichment_partial';
  if (completed) return 'completed';
  return 'cancelled';
}

export function retailersNeedingJobs(
  eligibleRetailerIds: number[],
  existingNonCancelledRetailerIds: number[],
): number[] {
  const have = new Set(existingNonCancelledRetailerIds);
  return eligibleRetailerIds.filter((id) => !have.has(id));
}

export function canResumeEnrich(snapshot: EnrichmentSnapshot): boolean {
  if (snapshot.jobs.queued + snapshot.jobs.running + snapshot.jobs.failed > 0) return true;
  return snapshot.jobs.total === 0 && isEnrichableBatchStatus(snapshot.batchStatus);
}

export function canRetryFailedEnrich(snapshot: EnrichmentSnapshot): boolean {
  return snapshot.jobs.failed > 0;
}

export function mergeProfileNotes(existing: string | null | undefined, addition: string): string {
  const current = existing?.trim() ?? '';
  if (!current) return addition;
  if (current.includes(addition)) return current;
  return `${current}\n\n${addition}`;
}
