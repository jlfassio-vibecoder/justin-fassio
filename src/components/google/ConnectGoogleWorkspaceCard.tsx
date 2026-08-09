import { useEffect, useState } from 'react';
import { Link2, Link2Off, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { GoogleConnectionPublic } from '@/lib/google/connectionTypes';
import {
  disconnectGoogleWorkspace,
  fetchGoogleConnection,
  startGoogleOAuth,
} from '@/lib/googleConnectionClient';

export function ConnectGoogleWorkspaceCard() {
  const [connection, setConnection] = useState<GoogleConnectionPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await fetchGoogleConnection();
      if (!active) return;
      if (!result.ok) {
        setConnection(null);
        setError(result.error);
        setLoading(false);
        return;
      }
      setConnection(result.connection);
      setError(null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  async function handleConnect(
    scopes: 'identity' | 'gmail_readonly' | 'gmail_compose' = 'identity',
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await startGoogleOAuth({ scopes });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    window.location.assign(result.authorizeUrl);
  }

  async function handleDisconnect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await disconnectGoogleWorkspace();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLoading(true);
    setReloadToken((n) => n + 1);
  }

  const needsGmailGrant = Boolean(connection?.connected && !connection.hasGmailReadonly);
  const needsComposeGrant = Boolean(
    connection?.connected && connection.hasGmailReadonly && !connection.hasGmailCompose,
  );

  return (
    <div className="border-ink/10 bg-surface flex flex-col gap-4 rounded-md border p-5">
      <div>
        <h3 className="font-heading m-0 text-lg">Email (Google Workspace)</h3>
        <p className="text-ink/65 m-0 mt-1 text-sm">
          Connect the company Google Workspace account for Gmail. Ordinary business email uses
          Gmail; OGR Email Product continues to send through Resend.
        </p>
      </div>

      {loading ? <p className="text-ink/60 m-0 text-sm">Checking connection…</p> : null}

      {!loading && connection?.connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-ink m-0 text-sm">
            Connected as <span className="font-medium">{connection.googleEmail}</span>
            {connection.status ? <span className="text-ink/55"> · {connection.status}</span> : null}
          </p>
          {needsGmailGrant ? (
            <p className="text-ink/70 m-0 text-sm">
              Gmail read access is not granted yet. Grant access to browse Inbox, Sent, and Drafts
              here (read-only).
            </p>
          ) : needsComposeGrant ? (
            <p className="text-ink/70 m-0 text-sm">
              Gmail read access is granted. Grant send/drafts to compose, reply, and manage drafts
              here.
            </p>
          ) : (
            <p className="text-ink/70 m-0 text-sm">
              Gmail read and send/drafts access are granted.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {needsGmailGrant ? (
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void handleConnect('gmail_readonly')}
              >
                <Mail strokeWidth={2.75} className="size-4" aria-hidden />
                Grant Gmail access
              </Button>
            ) : null}
            {needsComposeGrant ? (
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void handleConnect('gmail_compose')}
              >
                <Mail strokeWidth={2.75} className="size-4" aria-hidden />
                Grant Gmail send/drafts
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void handleConnect(
                  needsGmailGrant
                    ? 'gmail_readonly'
                    : needsComposeGrant
                      ? 'gmail_compose'
                      : 'identity',
                )
              }
            >
              <Link2 strokeWidth={2.75} className="size-4" aria-hidden />
              Reconnect
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              <Link2Off strokeWidth={2.75} className="size-4" aria-hidden />
              Disconnect
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && !connection?.connected ? (
        <div className="flex flex-col gap-3">
          <p className="text-ink/70 m-0 text-sm">No Google Workspace account connected yet.</p>
          <div>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => void handleConnect('identity')}
            >
              <Link2 strokeWidth={2.75} className="size-4" aria-hidden />
              Connect Google Workspace
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-accent-800 m-0 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
