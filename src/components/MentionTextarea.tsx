import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { Textarea } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import {
  accountContactRoleLabel,
  fetchContactsForAccount,
  searchContactsByName,
  type AccountContact,
} from '@/lib/accountContacts';
import { fetchCatalogItems, type CatalogItem } from '@/lib/catalog';
import {
  applyMentionReplacement,
  filterContactMentions,
  filterProductMentions,
  formatContactMention,
  formatProductMention,
  parseActiveMention,
} from '@/lib/mentions';

export interface MentionTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> {
  value: string;
  onChange: (value: string) => void;
  /** Line Sheet items; when omitted/empty, fetched on first `#` open. */
  items?: CatalogItem[];
  /** Scope `@` suggestions to this retailer; falls back to global name search. */
  accountId?: number | null;
  /** Optional preloaded contacts (skips fetch when non-empty). */
  contacts?: AccountContact[];
}

function formatWholesaleUsd(priceUsd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(priceUsd);
}

export function MentionTextarea({
  value,
  onChange,
  items,
  accountId = null,
  contacts: contactsProp,
  disabled,
  className,
  ...textareaProps
}: MentionTextareaProps) {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const catalogFetchedOnce = useRef(false);
  const contactsFetchedFor = useRef<number | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  const [caret, setCaret] = useState(0);
  const [suppressOpen, setSuppressOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [fetchedCatalog, setFetchedCatalog] = useState<CatalogItem[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogFetching, setCatalogFetching] = useState(false);
  const [fetchedContacts, setFetchedContacts] = useState<AccountContact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsFetching, setContactsFetching] = useState(false);
  const [globalHits, setGlobalHits] = useState<AccountContact[] | null>(null);

  const catalog = items && items.length > 0 ? items : (fetchedCatalog ?? []);
  const scopedContacts =
    contactsProp && contactsProp.length > 0 ? contactsProp : (fetchedContacts ?? []);

  const trigger = parseActiveMention(value, caret);
  const open = trigger != null && !suppressOpen;

  const productMatches =
    trigger?.kind === 'product' ? filterProductMentions(catalog, trigger.query) : [];

  const contactSource =
    trigger?.kind === 'contact'
      ? accountId != null || (contactsProp && contactsProp.length > 0)
        ? scopedContacts
        : trigger.query.trim().length < 1
          ? []
          : (globalHits ?? [])
      : [];
  const contactMatches =
    trigger?.kind === 'contact' ? filterContactMentions(contactSource, trigger.query) : [];

  const matchCount = trigger?.kind === 'contact' ? contactMatches.length : productMatches.length;
  const activeIndex = matchCount === 0 ? 0 : Math.min(highlight, matchCount - 1);

  const loadingList =
    (trigger?.kind === 'product' && catalogFetching && catalog.length === 0) ||
    (trigger?.kind === 'contact' && contactsFetching && contactSource.length === 0);
  const listError =
    trigger?.kind === 'product' ? catalogError : trigger?.kind === 'contact' ? contactsError : null;

  useEffect(() => {
    if (!open || trigger?.kind !== 'product') return;
    if (items && items.length > 0) return;
    if (catalogFetchedOnce.current) return;
    catalogFetchedOnce.current = true;
    let active = true;
    setCatalogFetching(true);
    setCatalogError(null);
    void fetchCatalogItems().then((result) => {
      if (!active) return;
      setCatalogFetching(false);
      if (result.error) {
        setCatalogError(result.error);
        setFetchedCatalog([]);
        return;
      }
      setFetchedCatalog(result.data);
    });
    return () => {
      active = false;
    };
  }, [open, trigger?.kind, items]);

  useEffect(() => {
    if (!open || trigger?.kind !== 'contact') return;

    if (contactsProp && contactsProp.length > 0) return;

    if (accountId != null) {
      if (contactsFetchedFor.current === accountId) return;
      let active = true;
      contactsFetchedFor.current = accountId;
      setContactsFetching(true);
      setContactsError(null);
      void fetchContactsForAccount(accountId).then((result) => {
        if (!active) return;
        setContactsFetching(false);
        if (result.error) {
          setContactsError(result.error);
          setFetchedContacts([]);
          return;
        }
        setFetchedContacts(result.data);
      });
      return () => {
        active = false;
      };
    }

    const q = trigger.query.trim();
    if (q.length < 1) {
      return;
    }

    let active = true;
    setContactsFetching(true);
    setContactsError(null);
    setGlobalHits(null);
    const timer = window.setTimeout(() => {
      void searchContactsByName(q).then((result) => {
        if (!active) return;
        setContactsFetching(false);
        if (result.error) {
          setContactsError(result.error);
          setGlobalHits([]);
          return;
        }
        setContactsError(null);
        setGlobalHits(result.data);
      });
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, trigger?.kind, trigger?.query, accountId, contactsProp]);

  useLayoutEffect(() => {
    const nextCaret = pendingCaretRef.current;
    if (nextCaret == null) return;
    pendingCaretRef.current = null;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(nextCaret, nextCaret);
  });

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  function syncCaretFromEl() {
    const el = textareaRef.current;
    if (el) setCaret(el.selectionStart ?? 0);
  }

  function commitInsertion(insertion: string) {
    const active = parseActiveMention(value, caret);
    if (!active) return;
    const result = applyMentionReplacement(value, active.start, caret, insertion);
    pendingCaretRef.current = result.caret;
    setSuppressOpen(true);
    setCaret(result.caret);
    onChange(result.value);
  }

  function selectProduct(item: CatalogItem) {
    commitInsertion(formatProductMention(item));
  }

  function selectContact(contact: AccountContact) {
    commitInsertion(formatContactMention(contact));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || trigger == null) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setSuppressOpen(true);
      return;
    }

    if (matchCount === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => (i + 1) % matchCount);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => (i - 1 + matchCount) % matchCount);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (trigger.kind === 'product') {
        const item = productMatches[activeIndex] ?? productMatches[0];
        if (item) selectProduct(item);
      } else {
        const contact = contactMatches[activeIndex] ?? contactMatches[0];
        if (contact) selectContact(contact);
      }
    }
  }

  return (
    <div className="relative">
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        className={className}
        disabled={disabled}
        value={value}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-activedescendant={open && matchCount > 0 ? `${listId}-opt-${activeIndex}` : undefined}
        onChange={(e) => {
          setSuppressOpen(false);
          setHighlight(0);
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCaretFromEl}
        onClick={syncCaretFromEl}
        onSelect={syncCaretFromEl}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => setSuppressOpen(true), 120);
        }}
        onFocus={() => {
          if (blurTimerRef.current != null) {
            window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
          }
        }}
      />

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="border-ink/15 bg-surface absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border shadow-lg"
        >
          {loadingList ? (
            <li className="text-ink/60 px-3 py-2 text-sm">
              {trigger?.kind === 'contact' ? 'Loading contacts…' : 'Loading line sheet…'}
            </li>
          ) : null}
          {listError ? (
            <li className="text-accent-800 px-3 py-2 text-sm" role="alert">
              {listError}
            </li>
          ) : null}
          {!loadingList && !listError && matchCount === 0 ? (
            <li className="text-ink/60 px-3 py-2 text-sm">
              {trigger?.kind === 'contact' ? 'No matching contacts' : 'No matching products'}
            </li>
          ) : null}

          {trigger?.kind === 'product'
            ? productMatches.map((item, index) => (
                <li
                  key={item.sku}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    index === activeIndex ? 'bg-accent/15' : 'hover:bg-ink/[0.04]'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => selectProduct(item)}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{item.sku}</span>
                    <span className="text-ink/70 shrink-0 text-xs">
                      {formatWholesaleUsd(item.priceUsd)}
                    </span>
                  </div>
                  <div className="text-ink/80">{item.name}</div>
                </li>
              ))
            : null}

          {trigger?.kind === 'contact'
            ? contactMatches.map((contact, index) => (
                <li
                  key={contact.id}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    index === activeIndex ? 'bg-accent/15' : 'hover:bg-ink/[0.04]'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => selectContact(contact)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{contact.fullName}</span>
                    <Tag variant="neutral">{accountContactRoleLabel(contact.role)}</Tag>
                  </div>
                  {contact.title ? (
                    <div className="text-ink/70 text-xs">{contact.title}</div>
                  ) : null}
                </li>
              ))
            : null}
        </ul>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer MentionTextarea — alias for existing imports. */
export { MentionTextarea as ProductMentionTextarea };
export type { MentionTextareaProps as ProductMentionTextareaProps };
