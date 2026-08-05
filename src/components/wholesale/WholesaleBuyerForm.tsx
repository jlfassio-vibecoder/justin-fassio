import { useId, useState } from 'react';
import type { WholesaleOrderDraft } from '@/lib/wholesaleOrderDraft';
import { orderTotals } from '@/lib/wholesaleOrderDraft';

type Props = {
  draft: WholesaleOrderDraft;
  onSuccess: (requestNumber: string) => void;
};

const RETAIL_CHANNELS = [
  'Independent specialty retail',
  'Outdoor / sporting goods',
  'Gift / lifestyle',
  'Golf / resort',
  'Online only',
  'Other',
];

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

type FormState = {
  businessName: string;
  buyerName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  postalCode: string;
  retailChannel: string;
  isExistingCustomer: 'yes' | 'no';
  website: string;
  gstHstNumber: string;
  poNumber: string;
  notes: string;
  preferredContactMethod: string;
  companyFax: string;
};

const emptyForm: FormState = {
  businessName: '',
  buyerName: '',
  email: '',
  phone: '',
  city: '',
  province: '',
  postalCode: '',
  retailChannel: '',
  isExistingCustomer: 'no',
  website: '',
  gstHstNumber: '',
  poNumber: '',
  notes: '',
  preferredContactMethod: '',
  companyFax: '',
};

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function WholesaleBuyerForm({ draft, onSuccess }: Props) {
  const formId = useId();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { totalUnits } = orderTotals(draft);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    if (draft.lines.length === 0) {
      setError('Add at least one product before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/wholesale/order-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: newIdempotencyKey(),
          businessName: form.businessName,
          buyerName: form.buyerName,
          email: form.email,
          phone: form.phone,
          city: form.city,
          province: form.province,
          postalCode: form.postalCode,
          retailChannel: form.retailChannel,
          isExistingCustomer: form.isExistingCustomer === 'yes',
          website: form.website || null,
          gstHstNumber: form.gstHstNumber || null,
          poNumber: form.poNumber || null,
          notes: form.notes || null,
          preferredContactMethod: form.preferredContactMethod || null,
          companyFax: form.companyFax || null,
          lines: draft.lines.map((l) => ({
            productId: l.productId,
            sku: l.sku,
            name: l.name,
            size: l.size,
            wholesaleUsd: l.wholesaleUsd,
            quantity: l.quantity,
          })),
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        requestNumber?: string;
      };
      if (!res.ok || !payload.ok || !payload.requestNumber) {
        throw new Error(payload.error ?? 'Could not submit order request.');
      }
      onSuccess(payload.requestNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit order request.');
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    'border-divider bg-bg px-3.1 focus:border-accent-700 rounded-lg border py-2 text-sm outline-none w-full';

  return (
    <section
      id="buyer-form"
      className="border-divider elev-md bg-bg p-4.1 flex flex-col gap-4 rounded-xl border shadow-md"
    >
      <div>
        <span className="bg-accent-100 text-accent-800 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] tracking-wide">
          Contact
        </span>
        <h2 className="font-heading mt-2.1 m-0 text-2xl">Buyer information</h2>
        <p className="text-ink/65 m-0 mt-1 text-sm">
          Tell us who to confirm this request with. {totalUnits} unit
          {totalUnits === 1 ? '' : 's'} in your draft.
        </p>
      </div>

      <form
        className="gap-3.1 grid sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span>Store or business name *</span>
          <input
            required
            className={fieldClass}
            value={form.businessName}
            onChange={(e) => setField('businessName', e.target.value)}
            autoComplete="organization"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Buyer name *</span>
          <input
            required
            className={fieldClass}
            value={form.buyerName}
            onChange={(e) => setField('buyerName', e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Email *</span>
          <input
            required
            type="email"
            className={fieldClass}
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Phone *</span>
          <input
            required
            type="tel"
            className={fieldClass}
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            autoComplete="tel"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>City *</span>
          <input
            required
            className={fieldClass}
            value={form.city}
            onChange={(e) => setField('city', e.target.value)}
            autoComplete="address-level2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Province *</span>
          <select
            required
            className={fieldClass}
            value={form.province}
            onChange={(e) => setField('province', e.target.value)}
          >
            <option value="">Select</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Postal code *</span>
          <input
            required
            className={fieldClass}
            value={form.postalCode}
            onChange={(e) => setField('postalCode', e.target.value)}
            autoComplete="postal-code"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Retail channel *</span>
          <select
            required
            className={fieldClass}
            value={form.retailChannel}
            onChange={(e) => setField('retailChannel', e.target.value)}
          >
            <option value="">Select</option>
            {RETAIL_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="m-0 border-0 p-0 sm:col-span-2">
          <legend className="mb-1 text-sm">Existing Old Guys Rule customer? *</legend>
          <div className="gap-3.1 flex">
            {(['no', 'yes'] as const).map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={`${formId}-existing`}
                  checked={form.isExistingCustomer === v}
                  onChange={() => setField('isExistingCustomer', v)}
                />
                {v === 'yes' ? 'Yes' : 'No'}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span>Website</span>
          <input
            className={fieldClass}
            value={form.website}
            onChange={(e) => setField('website', e.target.value)}
            autoComplete="url"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>GST/HST number</span>
          <input
            className={fieldClass}
            value={form.gstHstNumber}
            onChange={(e) => setField('gstHstNumber', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>PO number</span>
          <input
            className={fieldClass}
            value={form.poNumber}
            onChange={(e) => setField('poNumber', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Preferred contact method</span>
          <input
            className={fieldClass}
            value={form.preferredContactMethod}
            onChange={(e) => setField('preferredContactMethod', e.target.value)}
            placeholder="Email, phone, text…"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span>Notes</span>
          <textarea
            className={`${fieldClass} min-h-[88px]`}
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            maxLength={4000}
          />
        </label>

        {/* Honeypot */}
        <label className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          Company fax
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.companyFax}
            onChange={(e) => setField('companyFax', e.target.value)}
          />
        </label>

        {error ? (
          <p className="text-accent-800 m-0 text-sm sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting || draft.lines.length === 0}
            className="bg-accent-700 px-6.1 py-2.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full text-sm disabled:opacity-40"
          >
            {submitting ? 'Submitting…' : 'Submit order request'}
          </button>
        </div>
      </form>
    </section>
  );
}
