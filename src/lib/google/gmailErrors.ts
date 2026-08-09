import { GmailClientError } from '@/lib/google/gmailClient';

/** Safe log fields only — never include tokens, raw MIME, or full response bodies. */
export function logGmailClientFailure(workflow: string, err: GmailClientError): void {
  console.error('[gmail]', {
    workflow,
    error: 'gmail_failed',
    status: err.status ?? null,
    reason: err.reason ?? null,
    message: truncateSafe(err.message),
  });
}

export function gmailClientErrorJsonResponse(
  workflow: string,
  err: GmailClientError,
  fallback: string,
): Response {
  logGmailClientFailure(workflow, err);
  const mapped = gmailClientErrorToClientMessage(err, fallback);
  return new Response(JSON.stringify({ ok: false, ...mapped }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
}

function truncateSafe(message: string, max = 240): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/**
 * Staff-facing message for known Gmail provider failures.
 * Keep generic for unknown cases (avoid leaking internals).
 */
export function gmailClientErrorToClientMessage(
  err: GmailClientError,
  fallback: string,
): { error: string; needsReconnect?: boolean } {
  const text = err.message.toLowerCase();
  const reason = (err.reason ?? '').toLowerCase();

  if (
    text.includes('has not been used in project') ||
    text.includes('is disabled') ||
    text.includes('access not configured') ||
    reason.includes('access_not_configured')
  ) {
    return {
      error:
        'Gmail API is not enabled for this Google Cloud project. Enable the Gmail API, then retry.',
    };
  }

  if (
    text.includes('insufficient authentication scopes') ||
    text.includes('insufficientpermissions') ||
    text.includes('access_token_scope_insufficient') ||
    reason.includes('access_token_scope_insufficient') ||
    err.status === 401
  ) {
    return {
      error:
        'Google rejected Gmail access. Disconnect and reconnect Google Workspace, then grant Gmail again.',
      needsReconnect: true,
    };
  }

  if (err.status === 403 && (text.includes('forbidden') || text.includes('permission'))) {
    return {
      error:
        'Gmail permission was denied. Confirm the Workspace account can use Gmail and that Gmail scopes were granted.',
      needsReconnect: true,
    };
  }

  return { error: fallback };
}
