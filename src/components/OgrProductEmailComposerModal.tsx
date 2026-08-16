import { useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Textarea } from '@/components/ui/Input';
import {
  cancelAgentProductOutreachDraftClient,
  generateAgentProductOutreachDraft,
  sendAgentProductOutreachDraft,
  updateAgentProductOutreachDraftClient,
} from '@/lib/agentProductOutreachDraftClient';
import {
  defaultOgrProductEmailSubject,
  OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  OGR_PRODUCT_EMAIL_DEFAULT_INTRO,
} from '@/lib/ogrProductOutreachEmail';
import {
  isValidOgrProductEmailRecipient,
  OGR_PRODUCT_EMAIL_MAX_PROSE,
  OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME,
  OGR_PRODUCT_EMAIL_MAX_SUBJECT,
  OGR_PRODUCT_EMAIL_MAX_TO,
} from '@/lib/ogrProductEmailLimits';
import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';
import { sendOgrProductEmail } from '@/lib/sendOgrProductEmailClient';
import { useOptionalLineContext } from '@/lib/lineContext';
import { staffAiPostFields } from '@/lib/staffAiClientContext';

const MAX_TO = OGR_PRODUCT_EMAIL_MAX_TO;
const MAX_RECIPIENT_NAME = OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME;
const MAX_SUBJECT = OGR_PRODUCT_EMAIL_MAX_SUBJECT;
const MAX_PROSE = OGR_PRODUCT_EMAIL_MAX_PROSE;

export type OgrProductEmailComposerDraft = {
  id: string;
  to: string;
  toName: string;
  subject: string;
  introText: string;
  closingText: string;
  prospectId: number;
  accountContactId: string;
  catalogItemId: string;
  prospectName?: string;
  productSku?: string;
  productSlug?: string;
  productIsNew?: boolean;
};

export type OgrProductEmailComposerModalProps = {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  /** Called after cancel draft so parent can refresh history. */
  onDraftCancelled?: () => void;
  productId: string;
  productName: string;
  /** Already-rendered Phase 5 card fragment (not the full outreach document). */
  cardHtml: string;
  /** When set, opens in agent-draft review mode (PATCH then send-draft). */
  draft?: OgrProductEmailComposerDraft | null;
};

function buildCardPreviewSrcDoc(cardHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank" rel="noopener"></head><body style="margin:0;padding:12px;background:#ffffff;font-family:Georgia,serif;">${cardHtml}</body></html>`;
}

/** Fresh form instance per open — keyed remount resets defaults without setState-in-effect. */
function OgrProductEmailComposerForm({
  onClose,
  onSent,
  onDraftCancelled,
  productId,
  productName,
  cardHtml,
  draft,
}: Omit<OgrProductEmailComposerModalProps, 'open'>) {
  const line = useOptionalLineContext();
  const eaglePeakOutreachBlocked = line.lineSlug === 'eagle-peak' && !line.eaglePeakOutreach;
  const bigFishOutreachBlocked = line.lineSlug === 'big-fish' && !line.bigFishOutreach;
  const isDraftReview = draft != null;
  const [to, setTo] = useState(draft?.to ?? '');
  const [recipientName, setRecipientName] = useState(draft?.toName ?? '');
  const [subject, setSubject] = useState(
    () => draft?.subject ?? defaultOgrProductEmailSubject(productName),
  );
  const [introText, setIntroText] = useState(draft?.introText ?? OGR_PRODUCT_EMAIL_DEFAULT_INTRO);
  const [closingText, setClosingText] = useState(
    draft?.closingText ?? OGR_PRODUCT_EMAIL_DEFAULT_CLOSING,
  );
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = submitting || regenerating;

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function handleRegenerate() {
    if (!draft || busy) return;
    if (eaglePeakOutreachBlocked) {
      setError('Eagle Peak outreach is not enabled');
      return;
    }
    if (bigFishOutreachBlocked) {
      setError('Big Fish outreach is not enabled');
      return;
    }
    if (draft.prospectId == null || !draft.accountContactId || !draft.catalogItemId) {
      setError('Draft is missing CRM associations required to regenerate');
      return;
    }
    const prospectName = draft.prospectName?.trim() ?? '';
    if (!prospectName) {
      setError('Prospect name is required to regenerate');
      return;
    }
    const toEmail = (to.trim() || draft.to).trim();
    if (!isValidOgrProductEmailRecipient(toEmail)) {
      setError('A valid recipient email is required to regenerate');
      return;
    }
    setError(null);
    setRegenerating(true);
    try {
      const aiFields = await staffAiPostFields({
        multiLineAi: line.multiLineAi,
        salesLineId: line.salesLineId,
        prospectId: draft.prospectId,
      });
      const generated = await generateAgentProductOutreachDraft({
        existingDraftId: draft.id,
        salesLineId: aiFields.salesLineId,
        retailerLineAccountId: aiFields.retailerLineAccountId,
        target: {
          preparationDate: formatOutreachPreparationDate(),
          prospectId: draft.prospectId,
          prospectName,
          accountContactId: draft.accountContactId,
          toEmail,
          toName: recipientName.trim() || draft.toName,
          primaryChannel: null,
          secondaryChannels: [],
          catalogItemId: draft.catalogItemId,
          productSku: draft.productSku ?? '',
          productName,
          productSlug: draft.productSlug ?? '',
          productIsNew: draft.productIsNew ?? false,
          productSalesRank: null,
          selectionReasons: {
            priority: null,
            fitScore: null,
            channelMatch: false,
            productFit: 'global_fallback',
            exclusionsChecked: true,
          },
        },
      });
      if (!generated.ok) {
        setError(generated.error);
        return;
      }
      setSubject(generated.subject || subject);
      setIntroText(generated.introText || introText);
      setClosingText(generated.closingText || closingText);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCancelDraft() {
    if (!draft || busy) return;
    setError(null);
    setSubmitting(true);
    try {
      const cancelled = await cancelAgentProductOutreachDraftClient(draft.id);
      if (!cancelled.ok) {
        setError(cancelled.error);
        return;
      }
      onDraftCancelled?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const trimmedTo = to.trim();
    if (!isValidOgrProductEmailRecipient(trimmedTo)) {
      setError('A valid recipient email is required');
      return;
    }
    if (isDraftReview && !recipientName.trim()) {
      setError('Recipient name is required for agent drafts');
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
      if (isDraftReview && draft) {
        const updated = await updateAgentProductOutreachDraftClient(draft.id, {
          to: trimmedTo,
          toName: recipientName.trim(),
          subject: subject.trim(),
          introText: introText.trim(),
          closingText: closingText.trim(),
        });
        if (!updated.ok) {
          setError(updated.error);
          return;
        }
        const sent = await sendAgentProductOutreachDraft(draft.id);
        if (!sent.ok) {
          setError(sent.error);
          return;
        }
        onSent();
        onClose();
        return;
      }

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
        if (!busy) onClose();
      }}
    >
      <form
        noValidate
        className="bg-surface p-4.1 flex max-h-[min(90dvh,800px)] max-w-[560px] flex-col gap-3 overflow-y-auto rounded-xl shadow-lg"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{isDraftReview ? 'Review Product Email' : 'Email Product'}</DialogTitle>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="text-ink/60 hover:text-ink rounded p-1 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2.75} />
          </button>
        </div>

        <p className="text-ink/65 m-0 text-sm">
          {isDraftReview
            ? 'Review this agent draft, edit if needed, then send. From address and signature are set on the server from your staff profile.'
            : 'Send a single-product outreach email. From address and signature are set on the server.'}
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
            disabled={busy}
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel>{isDraftReview ? 'Recipient name' : 'Recipient name (optional)'}</FieldLabel>
          <Input
            id="ogr-email-recipient-name"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Sam"
            maxLength={MAX_RECIPIENT_NAME}
            disabled={busy}
          />
        </Field>

        <Field>
          <FieldLabel>Subject</FieldLabel>
          <Input
            id="ogr-email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={MAX_SUBJECT}
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
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

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {isDraftReview ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCancelDraft()}
                disabled={busy}
              >
                Cancel draft
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleRegenerate()}
                disabled={busy}
              >
                {regenerating ? 'Regenerating…' : 'Regenerate copy'}
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy}>
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
  onDraftCancelled,
  productId,
  productName,
  cardHtml,
  draft = null,
}: OgrProductEmailComposerModalProps) {
  if (!open) return null;
  return (
    <OgrProductEmailComposerForm
      key={draft?.id ?? productId}
      onClose={onClose}
      onSent={onSent}
      onDraftCancelled={onDraftCancelled}
      productId={productId}
      productName={productName}
      cardHtml={cardHtml}
      draft={draft}
    />
  );
}
