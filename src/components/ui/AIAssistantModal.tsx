import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Textarea } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

async function streamAgentReply(prompt: string, onChunk: (text: string) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not signed in');
  }

  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep status message
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error('Empty stream');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onChunk(full);
  }
  full += decoder.decode();
  onChunk(full);
}

export function AIAssistantModal() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setReply('');
    try {
      await streamAgentReply(trimmed, setReply);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent request failed');
    } finally {
      setBusy(false);
    }
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
          className="bg-surface p-4.1 flex max-w-[560px] flex-col gap-3 rounded-xl shadow-lg"
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
            Streams from <code>/api/agent</code> via the Vercel AI SDK (approved staff only).
          </p>

          <Field>
            <FieldLabel>Prompt</FieldLabel>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Summarize prospect 12 call history…"
              rows={4}
              required
            />
            <p className="text-ink/60 m-0 text-xs">
              Include a prospect # (e.g. 12) so the agent can load CRM calls.
            </p>
          </Field>

          {error ? (
            <p className="m-0 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {reply ? (
            <div className="border-ink/10 max-h-64 overflow-auto rounded-md border p-3 text-sm whitespace-pre-wrap">
              {reply}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !prompt.trim()}>
              {busy ? 'Streaming…' : 'Send'}
            </Button>
          </div>
        </form>
      </DialogBackdrop>
    </>
  );
}
