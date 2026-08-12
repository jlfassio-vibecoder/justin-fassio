import { timingSafeEqual } from 'node:crypto';

export type CronAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

/**
 * Vercel Cron auth: Authorization Bearer CRON_SECRET (timing-safe).
 * 503 when secret is unset; 401 on missing/mismatch.
 */
export function requireCronSecret(request: Request): CronAuthResult {
  const secret = (import.meta.env.CRON_SECRET as string | undefined)?.trim() || '';
  if (!secret) {
    return { ok: false, status: 503, error: 'CRON_SECRET is not configured' };
  }

  const header = request.headers.get('authorization')?.trim() || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim() || '';
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}
