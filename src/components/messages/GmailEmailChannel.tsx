import { useEffect, useState } from 'react';
import { ConnectGoogleWorkspaceCard } from '@/components/google/ConnectGoogleWorkspaceCard';
import { GmailThreadList } from '@/components/messages/GmailThreadList';
import { GmailThreadPanel } from '@/components/messages/GmailThreadPanel';
import type { GoogleConnectionPublic } from '@/lib/google/connectionTypes';
import type {
  GmailLabelFilter,
  GmailThreadDetail,
  GmailThreadSummary,
} from '@/lib/google/gmailTypes';
import { getGmailThreadClient, listGmailThreadsClient } from '@/lib/gmailClientBrowser';
import { fetchGoogleConnection } from '@/lib/googleConnectionClient';

export function GmailEmailChannel() {
  const [connection, setConnection] = useState<GoogleConnectionPublic | null>(null);
  const [connLoading, setConnLoading] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);

  const [label, setLabel] = useState<GmailLabelFilter>('INBOX');
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [threads, setThreads] = useState<GmailThreadSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GmailThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [listReloadToken, setListReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await fetchGoogleConnection();
      if (!active) return;
      if (!result.ok) {
        setConnection(null);
        setConnError(result.error);
        setConnLoading(false);
        return;
      }
      setConnection(result.connection);
      setConnError(null);
      setConnLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!connection?.connected || !connection.hasGmailReadonly) return;
    let active = true;
    void (async () => {
      setListLoading(true);
      setListError(null);
      const result = await listGmailThreadsClient({
        label,
        q: activeQuery || undefined,
      });
      if (!active) return;
      if (!result.ok) {
        setThreads([]);
        setNextPageToken(null);
        setListError(result.error);
        setListLoading(false);
        if (result.needsGmailReadonly || result.needsConnect) {
          setConnection((prev) =>
            prev
              ? {
                  ...prev,
                  hasGmailReadonly: result.needsGmailReadonly ? false : prev.hasGmailReadonly,
                  connected: result.needsConnect ? false : prev.connected,
                }
              : prev,
          );
        }
        return;
      }
      setThreads(result.threads);
      setNextPageToken(result.nextPageToken);
      setListLoading(false);
      setSelectedId((prev) => {
        if (prev && result.threads.some((t) => t.id === prev)) return prev;
        return result.threads[0]?.id ?? null;
      });
    })();
    return () => {
      active = false;
    };
  }, [connection?.connected, connection?.hasGmailReadonly, label, activeQuery, listReloadToken]);

  useEffect(() => {
    if (!selectedId || !connection?.hasGmailReadonly) {
      return;
    }
    let active = true;
    void (async () => {
      const result = await getGmailThreadClient(selectedId);
      if (!active) return;
      if (!result.ok) {
        setDetail(null);
        setDetailError(result.error);
        setDetailLoading(false);
        return;
      }
      setDetail(result.thread);
      setDetailError(null);
      setDetailLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [selectedId, connection?.hasGmailReadonly, listReloadToken]);

  if (connLoading) {
    return <p className="text-ink/60 m-0 text-sm">Checking Google connection…</p>;
  }

  if (connError) {
    return (
      <p className="text-accent-800 m-0 text-sm" role="alert">
        {connError}
      </p>
    );
  }

  if (!connection?.connected || !connection.hasGmailReadonly) {
    return <ConnectGoogleWorkspaceCard />;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div>
        {listError ? (
          <p className="text-accent-800 m-0 mb-2 text-sm" role="alert">
            {listError}
          </p>
        ) : null}
        <GmailThreadList
          threads={threads}
          selectedId={selectedId}
          label={label}
          search={searchInput}
          loading={listLoading}
          hasMore={Boolean(nextPageToken)}
          onSelect={(thread) => {
            setSelectedId(thread.id);
            setDetail(null);
            setDetailError(null);
            setDetailLoading(true);
          }}
          onLabelChange={(next) => {
            setLabel(next);
            setSelectedId(null);
            setDetail(null);
            setDetailError(null);
            setDetailLoading(false);
          }}
          onSearchChange={setSearchInput}
          onSearchSubmit={() => {
            setActiveQuery(searchInput.trim());
            setSelectedId(null);
            setDetail(null);
            setDetailError(null);
            setDetailLoading(false);
          }}
          onRefresh={() => setListReloadToken((n) => n + 1)}
          onLoadMore={() => {
            if (!nextPageToken || listLoading) return;
            void (async () => {
              setListLoading(true);
              const result = await listGmailThreadsClient({
                label,
                q: activeQuery || undefined,
                pageToken: nextPageToken,
              });
              if (!result.ok) {
                setListError(result.error);
                setListLoading(false);
                return;
              }
              setThreads((prev) => [...prev, ...result.threads]);
              setNextPageToken(result.nextPageToken);
              setListLoading(false);
            })();
          }}
        />
      </div>
      <div className="border-ink/10 bg-surface min-h-[20rem] rounded-md border p-4">
        <GmailThreadPanel thread={detail} loading={detailLoading} error={detailError} />
      </div>
    </div>
  );
}
