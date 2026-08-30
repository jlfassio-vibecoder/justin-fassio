/**
 * Signed visit tokens for outreach → public-site presence binding.
 * Server-only — do not import from client islands.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PRESENCE_VISIT_QUERY_PARAM,
  PRESENCE_VISIT_TOKEN_TTL_MS,
  PRESENCE_ACTIVE_WINDOW_MS,
} from '@/lib/presenceConstants';

export {
  PRESENCE_VISIT_QUERY_PARAM,
  PRESENCE_COOKIE_NAME,
  PRESENCE_CLAIM_TTL_MS,
  PRESENCE_VISIT_TOKEN_TTL_MS,
  PRESENCE_ACTIVE_WINDOW_MS,
} from '@/lib/presenceConstants';

export type PresenceVisitPayload = {
  prospectId: number;
  systemMessageId: string;
  exp: number;
};

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64url');
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export function resolvePresenceSigningSecret(): string | null {
  const dedicated =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      typeof import.meta.env.PRESENCE_VISIT_TOKEN_SECRET === 'string' &&
      import.meta.env.PRESENCE_VISIT_TOKEN_SECRET.trim()) ||
    (typeof process !== 'undefined' && process.env.PRESENCE_VISIT_TOKEN_SECRET?.trim()) ||
    '';
  if (dedicated) return dedicated;
  const fallback =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      typeof import.meta.env.SUPABASE_SERVICE_ROLE_KEY === 'string' &&
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY.trim()) ||
    (typeof process !== 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) ||
    '';
  return fallback || null;
}

function hmacSign(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signPresenceVisitToken(
  input: { prospectId: number; systemMessageId: string },
  opts?: { now?: Date; ttlMs?: number; secret?: string | null },
): string | null {
  const secret = opts?.secret ?? resolvePresenceSigningSecret();
  if (!secret) return null;
  const now = opts?.now ?? new Date();
  const ttl = opts?.ttlMs ?? PRESENCE_VISIT_TOKEN_TTL_MS;
  const payload: PresenceVisitPayload = {
    prospectId: input.prospectId,
    systemMessageId: input.systemMessageId,
    exp: now.getTime() + ttl,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(hmacSign(secret, body));
  return `${body}.${sig}`;
}

export function verifyPresenceVisitToken(
  token: string,
  opts?: { now?: Date; secret?: string | null },
): { ok: true; payload: PresenceVisitPayload } | { ok: false; error: string } {
  const secret = opts?.secret ?? resolvePresenceSigningSecret();
  if (!secret) return { ok: false, error: 'Presence signing secret not configured' };
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: 'Invalid visit token' };
  }
  const [body, sig] = parts;
  let expected: Buffer;
  try {
    expected = hmacSign(secret, body);
  } catch {
    return { ok: false, error: 'Invalid visit token' };
  }
  let provided: Buffer;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return { ok: false, error: 'Invalid visit token' };
  }
  if (!safeEqual(expected, provided)) {
    return { ok: false, error: 'Invalid visit token signature' };
  }
  let payload: PresenceVisitPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8')) as PresenceVisitPayload;
  } catch {
    return { ok: false, error: 'Invalid visit token payload' };
  }
  if (
    typeof payload.prospectId !== 'number' ||
    !Number.isFinite(payload.prospectId) ||
    typeof payload.systemMessageId !== 'string' ||
    !payload.systemMessageId.trim() ||
    typeof payload.exp !== 'number'
  ) {
    return { ok: false, error: 'Invalid visit token fields' };
  }
  const now = opts?.now ?? new Date();
  if (payload.exp < now.getTime()) {
    return { ok: false, error: 'Visit token expired' };
  }
  return { ok: true, payload };
}

/** Append signed `vt` to an absolute http(s) URL. Returns original URL if signing fails. */
export function appendPresenceVisitToken(
  absoluteUrl: string,
  input: { prospectId: number; systemMessageId: string },
  opts?: { now?: Date; secret?: string | null },
): string {
  const token = signPresenceVisitToken(input, opts);
  if (!token) return absoluteUrl;
  try {
    const url = new URL(absoluteUrl);
    url.searchParams.set(PRESENCE_VISIT_QUERY_PARAM, token);
    return url.toString();
  } catch {
    return absoluteUrl;
  }
}

export function isPresenceActive(
  lastSeenAt: string | null | undefined,
  asOf: Date = new Date(),
  windowMs: number = PRESENCE_ACTIVE_WINDOW_MS,
): boolean {
  if (!lastSeenAt) return false;
  const ms = Date.parse(lastSeenAt);
  if (!Number.isFinite(ms)) return false;
  return asOf.getTime() - ms <= windowMs;
}
