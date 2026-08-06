/** In-memory rate limit for public live-chat APIs (per isolate). */

export const CHAT_RATE_LIMIT_MAX = 40;
export const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/** Stricter cap for minting ephemeral chat auth users (unauthenticated). */
export const CHAT_MINT_RATE_LIMIT_MAX = 8;

const hitsByKey = new Map<string, number[]>();

export type ChatRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

function prune(timestamps: number[], now: number): number[] {
  const cutoff = now - CHAT_RATE_LIMIT_WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

export function checkChatRateLimit(
  key: string,
  now = Date.now(),
  max = CHAT_RATE_LIMIT_MAX,
): ChatRateLimitResult {
  const pruned = prune(hitsByKey.get(key) ?? [], now);
  if (pruned.length >= max) {
    const oldest = pruned[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + CHAT_RATE_LIMIT_WINDOW_MS - now) / 1000));
    hitsByKey.set(key, pruned);
    return { ok: false, retryAfterSec };
  }
  pruned.push(now);
  hitsByKey.set(key, pruned);
  return { ok: true };
}

export function resetChatRateLimitForTests(): void {
  hitsByKey.clear();
}
