import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { fetchContactsForAccount } from '@/lib/accountContacts';
import {
  accountProductEmailRecipientHint,
  defaultAccountProductEmailContact,
  toAccountProductEmailRecipientOptions,
  type AccountProductEmailRecipientOption,
} from '@/lib/accountProductEmailRecipient';
import {
  catalogFetchOptionsForAccountEmail,
  fetchCatalogItems,
  resolvePrimaryImageSrc,
  type CatalogItem,
} from '@/lib/catalog';
import {
  CATALOG_CATEGORY_FILTER_OPTIONS,
  filterCatalogItems,
  type CatalogFlagFilter,
} from '@/lib/catalogFilters';

export type AccountEmailProductPick = {
  item: CatalogItem;
  to: string;
  recipientName: string;
  accountContactId: string | null;
  recipientHint: string | null;
  recipientOptions: AccountProductEmailRecipientOption[];
};

export type AccountEmailProductPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onPick: (pick: AccountEmailProductPick) => void;
  accountId: number;
  salesLineId: string | null;
  lineSlug: string | null;
};

function isPublishedEmailableCatalogItem(item: CatalogItem): boolean {
  return item.isPubliclyPublished && Boolean(item.publicSlug?.trim());
}

function catalogThumbSrc(item: CatalogItem): string | null {
  const src = resolvePrimaryImageSrc(item);
  if (!src) return null;
  if (/^https?:\/\//i.test(src) || src.startsWith('/')) return src;
  return null;
}

export function AccountEmailProductPickerModal({
  open,
  onClose,
  onPick,
  accountId,
  salesLineId,
  lineSlug,
}: AccountEmailProductPickerModalProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [flag, setFlag] = useState<CatalogFlagFilter>('ALL');
  const [recipientOptions, setRecipientOptions] = useState<AccountProductEmailRecipientOption[]>(
    [],
  );
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [recipientHint, setRecipientHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.all([
      fetchCatalogItems(catalogFetchOptionsForAccountEmail(salesLineId, lineSlug)),
      fetchContactsForAccount(accountId),
    ]).then(([catalogResult, contactsResult]) => {
      if (!active) return;
      setLoading(false);
      if (catalogResult.error) {
        setItems([]);
        setError(catalogResult.error);
        return;
      }
      if (contactsResult.error) {
        setItems([]);
        setError(contactsResult.error);
        return;
      }
      setItems(catalogResult.data.filter(isPublishedEmailableCatalogItem));
      const contacts = contactsResult.data;
      const options = toAccountProductEmailRecipientOptions(contacts);
      const defaultContact = defaultAccountProductEmailContact(contacts);
      setRecipientOptions(options);
      setSelectedContactId(defaultContact?.id ?? null);
      setRecipientHint(accountProductEmailRecipientHint(contacts));
      setError(null);
    });
    return () => {
      active = false;
    };
  }, [open, accountId, salesLineId, lineSlug]);

  const filtered = useMemo(
    () => filterCatalogItems(items, { search, category, flag }),
    [items, search, category, flag],
  );

  if (!open) return null;

  const selected = recipientOptions.find((option) => option.id === selectedContactId) ?? null;
  const showRecipientSelect = recipientOptions.length >= 2;

  function handleEmailThis(item: CatalogItem) {
    onPick({
      item,
      to: selected?.email ?? '',
      recipientName: selected?.name ?? '',
      accountContactId: selected?.id ?? null,
      recipientHint,
      recipientOptions,
    });
  }

  return (
    <DialogBackdrop open overlayClassName="z-[60]" panelClassName="max-w-[720px]" onClose={onClose}>
      <div className="bg-surface p-4.1 flex max-h-[min(90dvh,800px)] flex-col gap-3 overflow-hidden rounded-xl shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>Email a product</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-ink/60 hover:text-ink rounded p-1"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2.75} />
          </button>
        </div>

        <p className="text-ink/65 m-0 text-sm">
          Choose a published product to email from this account.
        </p>

        <div className="flex flex-col gap-2">
          {showRecipientSelect ? (
            <Field>
              <FieldLabel>Recipient</FieldLabel>
              <Select
                aria-label="Recipient"
                value={selectedContactId ?? ''}
                onChange={(event) => setSelectedContactId(event.target.value || null)}
              >
                {recipientOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.email})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {!showRecipientSelect && selected ? (
            <p className="text-ink/70 m-0 text-sm">
              To: {selected.name} ({selected.email})
            </p>
          ) : null}
          {recipientHint ? <p className="text-ink/55 m-0 text-xs">{recipientHint}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[180px] flex-1"
            placeholder="Search SKU, name, tagline, or color…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            className="w-auto"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATALOG_CATEGORY_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select
            className="w-auto"
            value={flag}
            onChange={(event) => setFlag(event.target.value as CatalogFlagFilter)}
          >
            <option value="ALL">All Flags</option>
            <option value="NEW">NEW 2026</option>
            <option value="NAMEDROP">Name Drop Eligible</option>
          </Select>
        </div>

        {loading ? <p className="text-ink/60 m-0 text-sm">Loading products…</p> : null}
        {error ? (
          <p className="text-accent-800 m-0 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {!loading && !error && filtered.length === 0 ? (
            <p className="text-ink/60 m-0 text-sm">No published products match.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface sticky top-0 text-left">
                  <th className="text-ink/55 px-2 py-2 text-[11px] font-medium tracking-wider uppercase">
                    Image
                  </th>
                  <th className="text-ink/55 px-2 py-2 text-[11px] font-medium tracking-wider uppercase">
                    SKU
                  </th>
                  <th className="text-ink/55 px-2 py-2 text-[11px] font-medium tracking-wider uppercase">
                    Name
                  </th>
                  <th className="text-ink/55 px-2 py-2 text-[11px] font-medium tracking-wider uppercase">
                    Color
                  </th>
                  <th className="px-2 py-2">
                    <span className="sr-only">Email</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const thumb = catalogThumbSrc(item);
                  return (
                    <tr key={item.id} className="border-ink/10 border-t">
                      <td className="px-2 py-2">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-10 w-10 rounded-md object-cover" />
                        ) : (
                          <span className="bg-ink/10 block h-10 w-10 rounded-md" />
                        )}
                      </td>
                      <td className="px-2 py-2 font-medium">{item.sku}</td>
                      <td className="px-2 py-2">{item.name}</td>
                      <td className="text-ink/70 px-2 py-2">{item.color || '—'}</td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleEmailThis(item)}
                        >
                          Email this
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </DialogBackdrop>
  );
}
