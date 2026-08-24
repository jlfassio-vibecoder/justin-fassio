import type { APIRoute } from 'astro';
import { requireApprovedStaffClient } from '@/lib/agentAuth';
import { checkAgentRateLimit, rateLimitResponse } from '@/lib/agentRateLimit';
import { isAccountResearchPlatformScope } from '@/lib/accountResearch/constants';
import { jsonAccountResearch, snapshotPayload } from '@/lib/accountResearch/http';
import {
  lockAccountResearchSourceAndRefresh,
  unlockAccountResearchSourceAndClear,
} from '@/lib/accountResearch/lockSource';

export const prerender = false;
export const maxDuration = 60;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireApprovedStaffClient(request);
  if (!auth.ok) return auth.response;

  const limited = checkAgentRateLimit(`account-research:${auth.userId}`);
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonAccountResearch({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const retailerId = Number(record.retailerId);
  const sourceType = record.sourceType;

  if (!Number.isInteger(retailerId) || retailerId <= 0) {
    return jsonAccountResearch({ ok: false, error: 'retailerId is required' }, 400);
  }
  if (!isAccountResearchPlatformScope(sourceType)) {
    return jsonAccountResearch({ ok: false, error: 'Invalid sourceType' }, 400);
  }

  if (record.unlock === true) {
    const result = await unlockAccountResearchSourceAndClear({
      supabase: auth.supabase,
      retailerId,
      sourceType,
    });
    if (!result.ok) {
      return jsonAccountResearch({ ok: false, error: result.error }, result.status);
    }
    return jsonAccountResearch({
      ok: true,
      unlocked: true,
      ...(result.snapshot ? snapshotPayload(result.snapshot) : {}),
    });
  }

  if (typeof record.url !== 'string' || !record.url.trim()) {
    return jsonAccountResearch({ ok: false, error: 'url is required' }, 400);
  }

  const result = await lockAccountResearchSourceAndRefresh({
    supabase: auth.supabase,
    retailerId,
    sourceType,
    url: record.url,
  });
  if (!result.ok) {
    return jsonAccountResearch({ ok: false, error: result.error }, result.status);
  }

  return jsonAccountResearch({
    ok: true,
    locked: true,
    ...(result.snapshot ? snapshotPayload(result.snapshot) : {}),
  });
};
