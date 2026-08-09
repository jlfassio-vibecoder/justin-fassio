import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import {
  createGmailDraftClient,
  discardGmailDraftClient,
  replyGmailThreadClient,
  sendGmailDraftClient,
  sendGmailMessageClient,
  updateGmailDraftClient,
} from '@/lib/gmailClientBrowser';

export type GmailComposeMode = 'compose' | 'reply' | 'reply_all' | 'draft';

export type GmailComposeModalProps = {
  open: boolean;
  mode: GmailComposeMode;
  initialTo?: string;
  initialCc?: string;
  initialSubject?: string;
  initialBody?: string;
  threadId?: string | null;
  messageId?: string | null;
  draftId?: string | null;
  onClose: () => void;
  onSent: (result: { threadId: string }) => void;
  onDraftChanged: () => void;
  onNeedsComposeGrant?: () => void;
};

export function GmailComposeModal({
  open,
  mode,
  initialTo = '',
  initialCc = '',
  initialSubject = '',
  initialBody = '',
  threadId = null,
  messageId = null,
  draftId: initialDraftId = null,
  onClose,
  onSent,
  onDraftChanged,
  onNeedsComposeGrant,
}: GmailComposeModalProps) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc);
  const [subject, setSubject] = useState(initialSubject);
  const [bodyText, setBodyText] = useState(initialBody);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReply = mode === 'reply' || mode === 'reply_all';
  const title =
    mode === 'reply'
      ? 'Reply'
      : mode === 'reply_all'
        ? 'Reply all'
        : mode === 'draft'
          ? 'Edit draft'
          : 'Compose';

  function handleGate(result: { needsGmailCompose?: boolean; error: string }) {
    setError(result.error);
    if (result.needsGmailCompose) onNeedsComposeGrant?.();
  }

  async function handleSend() {
    if (busy) return;
    setBusy(true);
    setError(null);

    if (isReply && threadId) {
      const result = await replyGmailThreadClient({
        threadId,
        mode,
        bodyText,
        messageId: messageId ?? undefined,
      });
      setBusy(false);
      if (!result.ok) {
        handleGate(result);
        return;
      }
      onSent({ threadId: result.threadId });
      onClose();
      return;
    }

    if (draftId) {
      const updated = await updateGmailDraftClient({
        draftId,
        to,
        cc: cc || undefined,
        subject,
        bodyText,
        threadId: threadId ?? undefined,
      });
      if (!updated.ok) {
        setBusy(false);
        handleGate(updated);
        return;
      }
      const sent = await sendGmailDraftClient(draftId);
      setBusy(false);
      if (!sent.ok) {
        handleGate(sent);
        return;
      }
      onSent({ threadId: sent.threadId });
      onDraftChanged();
      onClose();
      return;
    }

    const result = await sendGmailMessageClient({
      to,
      cc: cc || undefined,
      subject,
      bodyText,
    });
    setBusy(false);
    if (!result.ok) {
      handleGate(result);
      return;
    }
    onSent({ threadId: result.threadId });
    onClose();
  }

  async function handleSaveDraft() {
    if (busy || isReply) return;
    setBusy(true);
    setError(null);
    if (draftId) {
      const result = await updateGmailDraftClient({
        draftId,
        to,
        cc: cc || undefined,
        subject,
        bodyText,
        threadId: threadId ?? undefined,
      });
      setBusy(false);
      if (!result.ok) {
        handleGate(result);
        return;
      }
      onDraftChanged();
      return;
    }
    const result = await createGmailDraftClient({
      to,
      cc: cc || undefined,
      subject,
      bodyText,
      threadId: threadId ?? undefined,
    });
    setBusy(false);
    if (!result.ok) {
      handleGate(result);
      return;
    }
    setDraftId(result.draft.id);
    onDraftChanged();
  }

  async function handleDiscard() {
    if (busy || !draftId) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await discardGmailDraftClient(draftId);
    setBusy(false);
    if (!result.ok) {
      handleGate(result);
      return;
    }
    onDraftChanged();
    onClose();
  }

  return (
    <DialogBackdrop open={open} onClose={() => (!busy ? onClose() : undefined)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gmail-compose-title"
        className="border-ink/10 bg-surface flex max-h-[90vh] flex-col gap-3 overflow-auto rounded-md border p-5 shadow-lg"
      >
        <DialogTitle>
          <span id="gmail-compose-title">{title}</span>
        </DialogTitle>
        <p className="text-ink/55 m-0 text-xs">
          Sends through your connected Gmail account. OGR Email Product still uses Resend.
          Attachments on send coming later.
        </p>

        {!isReply ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/70">To</span>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border-ink/15 bg-bg text-ink rounded-md border px-3 py-2"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/70">Cc</span>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="border-ink/15 bg-bg text-ink rounded-md border px-3 py-2"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/70">Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="border-ink/15 bg-bg text-ink rounded-md border px-3 py-2"
              />
            </label>
          </>
        ) : (
          <p className="text-ink/70 m-0 text-sm">
            Subject: <span className="text-ink">{subject || '(no subject)'}</span>
          </p>
        )}

        <label className="flex min-h-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-ink/70">Message</span>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={10}
            className="border-ink/15 bg-bg text-ink min-h-[12rem] resize-y rounded-md border px-3 py-2 font-sans"
          />
        </label>

        {error ? (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {draftId || mode === 'draft' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void handleDiscard()}
            >
              Discard
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          )}
          {!isReply ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleSaveDraft()}
            >
              Save draft
            </Button>
          ) : null}
          <Button type="button" variant="primary" disabled={busy} onClick={() => void handleSend()}>
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </DialogBackdrop>
  );
}
