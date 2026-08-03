/**
 * Best-effort in-memory sliding-window rate limit for /api/agent.
 * Per serverless isolate only — upgrade to Upstash (or similar) if abuse spans instances.
 */

export const AGENT_RATE_LIMIT_MAX = 20;
export const AGENT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const hitsByKey = new Map<string, number[]>();

export type AgentRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

function prune(timestamps: number[], now: number): number[] {
  const cutoff = now - AGENT_RATE_LIMIT_WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

/**
 * Record a hit for `key` and return whether the request is allowed.
 * Call only after approved-staff auth succeeds (key = user id).
 */
export function checkAgentRateLimit(key: string, now = Date.now()): AgentRateLimitResult {
  const pruned = prune(hitsByKey.get(key) ?? [], now);
  if (pruned.length >= AGENT_RATE_LIMIT_MAX) {
    const oldest = pruned[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + AGENT_RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    hitsByKey.set(key, pruned);
    return { ok: false, retryAfterSec };
  }
  pruned.push(now);
  hitsByKey.set(key, pruned);
  return { ok: true };
}

/** 429 JSON body + Retry-After for agent rate limit responses. */
export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ ok: false, error: 'Rate limit exceeded' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSec),
    },
  });
}

/** Clear window state between Vitest cases. */
export function resetAgentRateLimitForTests(): void {
  hitsByKey.clear();
}
