import { useMemo, type SubmitEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { X } from 'lucide-react';
import { useAiAssist } from '@/hooks/useAiAssist';
import { formatAssistChipLabel } from '@/lib/aiAssistPrefill';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Textarea } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function AIAssistantModal() {
  const { open, setOpen, chip, setChip, composer, setComposer } = useAiAssist();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent',
        prepareSendMessagesRequest: async ({ id, messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { id, messages, ...body },
            headers,
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat({
    transport,
  });

  const busy = status === 'submitted' || status === 'streaming';

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = composer.trim();
    if (!trimmed || busy) return;
    setComposer('');
    clearError();
    await sendMessage({ text: trimmed });
  }

  function handleNewChat() {
    setMessages([]);
    setChip(null);
    setComposer('');
    clearError();
  }

  return (
    <>
      <Button type="button" variant="ghost" className="text-xs" onClick={() => setOpen(true)}>
        AI assist
      </Button>

      <DialogBackdrop
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <form
          className="bg-surface p-4.1 flex max-h-[min(80dvh,720px)] max-w-[560px] flex-col gap-3 rounded-xl shadow-lg"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>AI sales assist</DialogTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
              aria-label="Close"
            >
              <X size={18} strokeWidth={2.75} />
            </button>
          </div>

          <p className="text-ink/70 m-0 text-sm">
            Multi-turn chat via <code>/api/agent</code> (approved staff only). CRM tools load when
            you name a prospect #.
          </p>

          {chip ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-bg text-ink/80 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium">
                {formatAssistChipLabel(chip)}
                <button
                  type="button"
                  className="text-ink/50 hover:text-ink inline-flex"
                  aria-label="Dismiss context"
                  onClick={() => setChip(null)}
                >
                  <X size={12} strokeWidth={2.75} />
                </button>
              </span>
            </div>
          ) : null}

          <div className="border-ink/10 flex max-h-64 min-h-[140px] flex-col gap-2 overflow-auto rounded-md border p-3 text-sm">
            {messages.length === 0 ? (
              <p className="text-ink/50 m-0">
                No messages yet. Ask about a prospect or draft a follow-up.
              </p>
            ) : (
              messages.map((message) => {
                const text = messageText(message);
                if (!text) return null;
                return (
                  <div key={message.id} className="whitespace-pre-wrap">
                    <span className="text-ink/50 text-[11px] font-semibold tracking-wide uppercase">
                      {message.role === 'user' ? 'You' : 'Assist'}
                    </span>
                    <div className="mt-0.5">{text}</div>
                  </div>
                );
              })
            )}
            {busy ? <p className="text-ink/50 m-0 text-xs">Streaming…</p> : null}
          </div>

          <Field>
            <FieldLabel>Message</FieldLabel>
            <Textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder="e.g. Summarize prospect 12 call history…"
              rows={3}
              disabled={busy}
            />
          </Field>

          {error ? (
            <p className="m-0 text-sm text-red-700" role="alert">
              {error.message}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={handleNewChat}>
              New chat
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !composer.trim()}>
              {busy ? 'Streaming…' : 'Send'}
            </Button>
          </div>
        </form>
      </DialogBackdrop>
    </>
  );
}
