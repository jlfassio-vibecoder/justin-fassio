import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_RATE_LIMIT_MAX,
  AGENT_RATE_LIMIT_WINDOW_MS,
  checkAgentRateLimit,
  rateLimitResponse,
  resetAgentRateLimitForTests,
} from '@/lib/agentRateLimit';

describe('checkAgentRateLimit', () => {
  beforeEach(() => {
    resetAgentRateLimitForTests();
  });

  it(`allows ${AGENT_RATE_LIMIT_MAX} hits then blocks`, () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < AGENT_RATE_LIMIT_MAX; i++) {
      expect(checkAgentRateLimit('user-a', now + i)).toEqual({ ok: true });
    }
    const blocked = checkAgentRateLimit('user-a', now + AGENT_RATE_LIMIT_MAX);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it('tracks keys independently', () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < AGENT_RATE_LIMIT_MAX; i++) {
      expect(checkAgentRateLimit('user-a', now + i).ok).toBe(true);
    }
    expect(checkAgentRateLimit('user-a', now + 100).ok).toBe(false);
    expect(checkAgentRateLimit('user-b', now + 100).ok).toBe(true);
  });

  it('allows again after the window slides', () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < AGENT_RATE_LIMIT_MAX; i++) {
      checkAgentRateLimit('user-a', now);
    }
    expect(checkAgentRateLimit('user-a', now + 1).ok).toBe(false);
    expect(checkAgentRateLimit('user-a', now + AGENT_RATE_LIMIT_WINDOW_MS + 1).ok).toBe(true);
  });
});

describe('rateLimitResponse', () => {
  it('returns 429 with Retry-After', async () => {
    const res = rateLimitResponse(42);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Rate limit exceeded' });
  });
});
