import { useEffect, useState } from 'react';
import { ConnectGoogleWorkspaceCard } from '@/components/google/ConnectGoogleWorkspaceCard';
import { GmailComposeModal, type GmailComposeMode } from '@/components/messages/GmailComposeModal';
import { GmailThreadList } from '@/components/messages/GmailThreadList';
import { GmailThreadPanel } from '@/components/messages/GmailThreadPanel';
import { Button } from '@/components/ui/Button';
import type { GoogleConnectionPublic } from '@/lib/google/connectionTypes';
import type {
  GmailLabelFilter,
  GmailMessageView,
  GmailThreadDetail,
  GmailThreadSummary,
} from '@/lib/google/gmailTypes';
import { normalizeSubjectForReply } from '@/lib/google/gmailMime';
import {
  getGmailDraftClient,
  getGmailThreadClient,
  listGmailDraftsClient,
  listGmailThreadsClient,
} from '@/lib/gmailClientBrowser';
import { fetchGoogleConnection, startGoogleOAuth } from '@/lib/googleConnectionClient';

type ComposeState = {
  mode: GmailComposeMode;
  to: string;
  cc: string;
  subject: string;
  body: string;
  threadId: string | null;
  messageId: string | null;
  draftId: string | null;
};

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
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);

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
      setDetailLoading(true);
      setDetailError(null);
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

  async function grantCompose() {
    if (grantBusy) return;
    setGrantBusy(true);
    const result = await startGoogleOAuth({ scopes: 'gmail_compose' });
    if (!result.ok) {
      setListError(result.error);
      setGrantBusy(false);
      return;
    }
    window.location.assign(result.authorizeUrl);
  }

  function openCompose() {
    setCompose({
      mode: 'compose',
      to: '',
      cc: '',
      subject: '',
      body: '',
      threadId: null,
      messageId: null,
      draftId: null,
    });
  }

  function openReply(mode: 'reply' | 'reply_all', message: GmailMessageView) {
    if (!detail) return;
    setCompose({
      mode,
      to: '',
      cc: '',
      subject: normalizeSubjectForReply(detail.subject || message.subject),
      body: '',
      threadId: detail.id,
      messageId: message.id,
      draftId: null,
    });
  }

  async function openDraftForThread(threadId: string) {
    if (!connection?.hasGmailCompose) return;
    const listed = await listGmailDraftsClient();
    if (!listed.ok) {
      if (listed.needsGmailCompose) {
        setConnection((prev) => (prev ? { ...prev, hasGmailCompose: false } : prev));
      }
      setListError(listed.error);
      return;
    }
    const match = listed.drafts.find((d) => d.threadId === threadId);
    if (!match) {
      setListError('Could not find a draft for this thread');
      return;
    }
    const detailDraft = await getGmailDraftClient(match.id);
    if (!detailDraft.ok) {
      setListError(detailDraft.error);
      return;
    }
    const d = detailDraft.draft;
    const toList = 'toList' in d ? d.toList.join(', ') : d.to;
    const ccList = 'ccList' in d ? d.ccList.join(', ') : '';
    const body = 'bodyText' in d ? d.bodyText : '';
    setCompose({
      mode: 'draft',
      to: toList,
      cc: ccList,
      subject: d.subject,
      body,
      threadId: d.threadId,
      messageId: d.messageId,
      draftId: d.id,
    });
  }

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

  const canCompose = Boolean(connection.hasGmailCompose);

  return (
    <div className="flex flex-col gap-4">
      {!canCompose ? (
        <div className="border-ink/10 bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <p className="text-ink/70 m-0 text-sm">
            Grant Gmail send/drafts to compose, reply, and manage drafts. OGR Email Product still
            uses Resend.
          </p>
          <Button
            type="button"
            variant="primary"
            disabled={grantBusy}
            onClick={() => void grantCompose()}
          >
            Grant Gmail send/drafts
          </Button>
        </div>
      ) : null}

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
            canCompose={canCompose}
            onCompose={openCompose}
            onSelect={(thread) => {
              setSelectedId(thread.id);
              setDetail(null);
              setDetailError(null);
              setDetailLoading(true);
              if (label === 'DRAFT' && canCompose) {
                void openDraftForThread(thread.id);
              }
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
          <GmailThreadPanel
            thread={detail}
            loading={detailLoading}
            error={detailError}
            canCompose={canCompose}
            onReply={openReply}
          />
        </div>
      </div>

      {compose ? (
        <GmailComposeModal
          key={`${compose.mode}:${compose.draftId ?? ''}:${compose.threadId ?? ''}:${compose.messageId ?? ''}:${compose.subject}`}
          open
          mode={compose.mode}
          initialTo={compose.to}
          initialCc={compose.cc}
          initialSubject={compose.subject}
          initialBody={compose.body}
          threadId={compose.threadId}
          messageId={compose.messageId}
          draftId={compose.draftId}
          onClose={() => setCompose(null)}
          onSent={(result) => {
            setSelectedId(result.threadId);
            setListReloadToken((n) => n + 1);
          }}
          onDraftChanged={() => setListReloadToken((n) => n + 1)}
          onNeedsComposeGrant={() => {
            setConnection((prev) => (prev ? { ...prev, hasGmailCompose: false } : prev));
          }}
        />
      ) : null}
    </div>
  );
}
