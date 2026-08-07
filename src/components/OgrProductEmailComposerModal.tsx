import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Textarea } from '@/components/ui/Input';
import {
  defaultOgrProductEmailSubject,
  OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
} from '@/lib/ogrProductOutreachEmail';
import { sendOgrProductEmail } from '@/lib/sendOgrProductEmailClient';

const MAX_TO = 200;
const MAX_RECIPIENT_NAME = 120;
const MAX_SUBJECT = 200;
const MAX_PROSE = 2000;

export type OgrProductEmailComposerModalProps = {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  productId: string;
  productName: string;
  /** Already-rendered Phase 5 card fragment (not the full outreach document). */
  cardHtml: string;
};

function buildCardPreviewSrcDoc(cardHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank" rel="noopener"></head><body style="margin:0;padding:12px;background:#ffffff;font-family:Georgia,serif;">${cardHtml}</body></html>`;
}

/** Fresh form instance per open — keyed remount resets defaults without setState-in-effect. */
function OgrProductEmailComposerForm({
  onClose,
  onSent,
  productId,
  productName,
  cardHtml,
}: Omit<OgrProductEmailComposerModalProps, 'open'>) {
  const [to, setTo] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState(() => defaultOgrProductEmailSubject(productName));
  const [introText, setIntroText] = useState(OGR_PRODUCT_EMAIL_DEFAULT_INTRO);
  const [closingText, setClosingText] = useState(OGR_PRODUCT_EMAIL_DEFAULT_CLOSING);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmedTo = to.trim();
    if (!trimmedTo || !trimmedTo.includes('@') || trimmedTo.length > MAX_TO) {
      setError('A valid recipient email is required');
      return;
    }
    if (recipientName.trim().length > MAX_RECIPIENT_NAME) {
      setError('Recipient name is too long');
      return;
    }
    if (subject.trim().length > MAX_SUBJECT) {
      setError('Subject is too long');
      return;
    }
    if (introText.trim().length > MAX_PROSE) {
      setError('Intro is too long');
      return;
    }
    if (closingText.trim().length > MAX_PROSE) {
      setError('Closing is too long');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = await sendOgrProductEmail({
        productId,
        to: trimmedTo,
        recipientName: recipientName.trim() || undefined,
        subject: subject.trim() || undefined,
        introText: introText.trim() || undefined,
        closingText: closingText.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSent();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogBackdrop
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <form
        noValidate
        className="bg-surface p-4.1 flex max-h-[min(90dvh,800px)] max-w-[560px] flex-col gap-3 overflow-y-auto rounded-xl shadow-lg"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>Email Product</DialogTitle>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="text-ink/60 hover:text-ink rounded p-1 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2.75} />
          </button>
        </div>

        <p className="text-ink/65 m-0 text-sm">
          Send a single-product outreach email. From address and signature are set on the server.
        </p>

        <Field>
          <FieldLabel>To</FieldLabel>
          <Input
            id="ogr-email-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="buyer@store.com"
            maxLength={MAX_TO}
            disabled={submitting}
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel>Recipient name (optional)</FieldLabel>
          <Input
            id="ogr-email-recipient-name"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Sam"
            maxLength={MAX_RECIPIENT_NAME}
            disabled={submitting}
          />
        </Field>

        <Field>
          <FieldLabel>Subject</FieldLabel>
          <Input
            id="ogr-email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={MAX_SUBJECT}
            disabled={submitting}
          />
        </Field>

        <Field>
          <FieldLabel>Intro</FieldLabel>
          <Textarea
            id="ogr-email-intro"
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            rows={3}
            maxLength={MAX_PROSE}
            disabled={submitting}
          />
        </Field>

        <Field>
          <FieldLabel>Closing</FieldLabel>
          <Textarea
            id="ogr-email-closing"
            value={closingText}
            onChange={(e) => setClosingText(e.target.value)}
            rows={2}
            maxLength={MAX_PROSE}
            disabled={submitting}
          />
        </Field>

        <div>
          <p className="text-ink/55 m-0 mb-2 text-xs font-medium tracking-wide uppercase">
            Product card preview
          </p>
          {cardHtml ? (
            <iframe
              title="Product card preview"
              srcDoc={buildCardPreviewSrcDoc(cardHtml)}
              className="border-ink/15 h-56 w-full rounded-md border bg-white"
              sandbox=""
            />
          ) : (
            <p className="text-ink/55 m-0 text-sm">Card preview unavailable for this product.</p>
          )}
        </div>

        {error ? (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </form>
    </DialogBackdrop>
  );
}

export function OgrProductEmailComposerModal({
  open,
  onClose,
  onSent,
  productId,
  productName,
  cardHtml,
}: OgrProductEmailComposerModalProps) {
  if (!open) return null;
  return (
    <OgrProductEmailComposerForm
      key={productId}
      onClose={onClose}
      onSent={onSent}
      productId={productId}
      productName={productName}
      cardHtml={cardHtml}
    />
  );
}
