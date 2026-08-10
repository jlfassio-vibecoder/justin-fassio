import { CalendarClientError } from '@/lib/google/calendarClient';

/** Safe log fields only — never include tokens or full Google payloads. */
export function logCalendarClientFailure(workflow: string, err: CalendarClientError): void {
  console.error('[calendar]', {
    workflow,
    error: 'calendar_failed',
    status: err.status ?? null,
    message: truncateSafe(err.message),
  });
}

export function calendarClientErrorJsonResponse(
  workflow: string,
  err: CalendarClientError,
  fallback: string,
): Response {
  logCalendarClientFailure(workflow, err);
  const mapped = calendarClientErrorToClientMessage(err, fallback);
  const status = mapped.httpStatus ?? 502;
  const body: Record<string, unknown> = { error: mapped.error };
  if (mapped.needsReconnect) body.needsReconnect = true;
  if (mapped.needsCalendarEvents) body.needsCalendarEvents = true;
  if (mapped.retryAfterSeconds != null) body.retryAfterSeconds = mapped.retryAfterSeconds;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (mapped.retryAfterSeconds != null) {
    headers['Retry-After'] = String(mapped.retryAfterSeconds);
  }
  return new Response(JSON.stringify({ ok: false, ...body }), {
    status,
    headers,
  });
}

function truncateSafe(message: string, max = 240): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function isQuotaOrRateLimit(err: CalendarClientError, text: string): boolean {
  return (
    err.status === 429 ||
    text.includes('rate limit') ||
    text.includes('quota exceeded') ||
    text.includes('quotaexceeded') ||
    text.includes('ratelimitexceeded') ||
    text.includes('usageratelimitexceeded')
  );
}

/**
 * Staff-facing message for known Calendar provider failures.
 * Keep generic for unknown cases (avoid leaking internals).
 */
export function calendarClientErrorToClientMessage(
  err: CalendarClientError,
  fallback: string,
): {
  error: string;
  needsReconnect?: boolean;
  needsCalendarEvents?: boolean;
  httpStatus?: number;
  retryAfterSeconds?: number;
} {
  const text = err.message.toLowerCase();

  if (isQuotaOrRateLimit(err, text)) {
    return {
      error: 'Google Calendar rate limit reached. Wait a moment and try again.',
      httpStatus: 429,
    };
  }

  if (
    text.includes('has not been used in project') ||
    text.includes('is disabled') ||
    text.includes('access not configured') ||
    text.includes('accessnotconfigured')
  ) {
    return {
      error:
        'Google Calendar API is not enabled for this Google Cloud project. Enable the Calendar API, then retry.',
    };
  }

  if (
    text.includes('insufficient authentication scopes') ||
    text.includes('insufficientpermissions') ||
    text.includes('access_token_scope_insufficient') ||
    err.status === 401
  ) {
    return {
      error:
        'Google rejected Calendar access. Disconnect and reconnect Google Workspace, then grant Calendar again.',
      needsReconnect: true,
      needsCalendarEvents: true,
    };
  }

  if (err.status === 403 && (text.includes('forbidden') || text.includes('permission'))) {
    return {
      error:
        'Calendar permission was denied. Confirm the Workspace account can use Calendar and that Calendar scopes were granted.',
      needsReconnect: true,
    };
  }

  return { error: fallback };
}
