import { useState, type SubmitEvent } from 'react';
import { MentionTextarea } from '@/components/MentionTextarea';
import { Button } from '@/components/ui/Button';
import { Field, FieldLabel } from '@/components/ui/Input';
import { updateProspectNotes } from '@/lib/prospects';
import { useOptionalLineContext } from '@/lib/lineContext';

interface AccountNotesEditorProps {
  accountId: number;
  initialNotes: string | null;
  onSaved?: (notes: string | null) => void;
}

export function AccountNotesEditor({ accountId, initialNotes, onSaved }: AccountNotesEditorProps) {
  const line = useOptionalLineContext();
  const [draft, setDraft] = useState(initialNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus('idle');
    setError(null);

    const next = draft.trim() || null;
    const result = await updateProspectNotes(accountId, next, {
      writesEnabled: line.multiLineWrites,
      salesLineId: line.multiLineWrites ? line.salesLineId : null,
    });
    setBusy(false);

    if (result.error) {
      setStatus('error');
      setError(result.error);
      return;
    }

    setDraft(result.data?.notes ?? '');
    setStatus('saved');
    onSaved?.(result.data?.notes ?? null);
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => void handleSave(e)}>
      <Field>
        <FieldLabel>Account notes</FieldLabel>
        <MentionTextarea
          rows={3}
          placeholder="Buyer preferences, ship window… Use # for products, @ for contacts"
          value={draft}
          onChange={(value) => {
            setDraft(value);
            if (status !== 'idle') setStatus('idle');
            if (error) setError(null);
          }}
          accountId={accountId}
          disabled={busy}
        />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink/60 m-0 min-h-[1.25rem] text-xs" role="status">
          {busy ? 'Saving…' : null}
          {!busy && status === 'saved' ? 'Saved' : null}
          {!busy && status === 'error' && error ? error : null}
        </p>
        <Button type="submit" variant="secondary" className="px-3 py-1 text-xs" disabled={busy}>
          Save notes
        </Button>
      </div>
    </form>
  );
}
