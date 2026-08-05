/**
 * Lightweight in-memory rate limit for public wholesale order submissions.
 * Per serverless isolate only.
 */

export const WHOLESALE_ORDER_RATE_LIMIT_MAX = 8;
export const WHOLESALE_ORDER_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const hitsByKey = new Map<string, number[]>();

export type WholesaleOrderRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

function prune(timestamps: number[], now: number): number[] {
  const cutoff = now - WHOLESALE_ORDER_RATE_LIMIT_WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

export function checkWholesaleOrderRateLimit(
  key: string,
  now = Date.now(),
): WholesaleOrderRateLimitResult {
  const pruned = prune(hitsByKey.get(key) ?? [], now);
  if (pruned.length >= WHOLESALE_ORDER_RATE_LIMIT_MAX) {
    const oldest = pruned[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + WHOLESALE_ORDER_RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    hitsByKey.set(key, pruned);
    return { ok: false, retryAfterSec };
  }
  pruned.push(now);
  hitsByKey.set(key, pruned);
  return { ok: true };
}

export function resetWholesaleOrderRateLimitForTests(): void {
  hitsByKey.clear();
}
