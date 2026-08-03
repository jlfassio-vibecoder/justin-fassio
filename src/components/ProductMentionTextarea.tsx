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
import { fetchCatalogItems, type CatalogItem } from '@/lib/catalog';
import {
  applyMentionReplacement,
  filterProductMentions,
  formatProductMention,
  parseMentionTrigger,
} from '@/lib/productMentions';

export interface ProductMentionTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> {
  value: string;
  onChange: (value: string) => void;
  /** Line Sheet items; when omitted/empty, fetched on first `#` open. */
  items?: CatalogItem[];
}

function formatWholesaleUsd(priceUsd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(priceUsd);
}

export function ProductMentionTextarea({
  value,
  onChange,
  items,
  disabled,
  className,
  ...textareaProps
}: ProductMentionTextareaProps) {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const fetchedOnce = useRef(false);
  const blurTimerRef = useRef<number | null>(null);

  const [caret, setCaret] = useState(0);
  const [suppressOpen, setSuppressOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [fetched, setFetched] = useState<CatalogItem[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const catalog = items && items.length > 0 ? items : (fetched ?? []);
  const trigger = parseMentionTrigger(value, caret);
  const open = trigger != null && !suppressOpen;
  const matches = trigger != null ? filterProductMentions(catalog, trigger.query) : [];
  const activeIndex = matches.length === 0 ? 0 : Math.min(highlight, matches.length - 1);

  useEffect(() => {
    if (!open) return;
    if (items && items.length > 0) return;
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    let active = true;
    setFetching(true);
    setFetchError(null);
    void fetchCatalogItems().then((result) => {
      if (!active) return;
      setFetching(false);
      if (result.error) {
        setFetchError(result.error);
        setFetched([]);
        return;
      }
      setFetched(result.data);
    });
    return () => {
      active = false;
    };
  }, [open, items]);

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

  function selectItem(item: CatalogItem) {
    const active = parseMentionTrigger(value, caret);
    if (!active) return;
    const insertion = formatProductMention(item);
    const result = applyMentionReplacement(value, active.start, caret, insertion);
    pendingCaretRef.current = result.caret;
    setSuppressOpen(true);
    setCaret(result.caret);
    onChange(result.value);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || trigger == null) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setSuppressOpen(true);
      return;
    }

    if (matches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => (i + 1) % matches.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => (i - 1 + matches.length) % matches.length);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const item = matches[activeIndex] ?? matches[0];
      if (item) selectItem(item);
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
        aria-activedescendant={
          open && matches[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined
        }
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
          {fetching && catalog.length === 0 ? (
            <li className="text-ink/60 px-3 py-2 text-sm">Loading line sheet…</li>
          ) : null}
          {fetchError ? (
            <li className="text-accent-800 px-3 py-2 text-sm" role="alert">
              {fetchError}
            </li>
          ) : null}
          {!fetching && !fetchError && matches.length === 0 ? (
            <li className="text-ink/60 px-3 py-2 text-sm">No matching products</li>
          ) : null}
          {matches.map((item, index) => (
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
              onClick={() => selectItem(item)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{item.sku}</span>
                <span className="text-ink/70 shrink-0 text-xs">
                  {formatWholesaleUsd(item.priceUsd)}
                </span>
              </div>
              <div className="text-ink/80">{item.name}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
