import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { copyTextToClipboard } from '@/lib/copyTextToClipboard';

const COPIED_MS = 1800;

type CopyUrlButtonProps = {
  /** Plain text to copy (URL, account name, etc.). */
  url: string;
  className?: string;
  /** Accessible label when idle. Defaults to "Copy URL". */
  label?: string;
};

export function CopyUrlButton({ url, className, label = 'Copy URL' }: CopyUrlButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const ok = await copyTextToClipboard(url);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  }

  const trimmed = url.trim();
  if (!trimmed) return null;

  return (
    <button
      type="button"
      onClick={(e) => void handleCopy(e)}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'text-ink/45 hover:text-ink inline-flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 transition-colors',
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5" strokeWidth={2.75} aria-hidden />
      ) : (
        <Copy className="size-3.5" strokeWidth={2.75} aria-hidden />
      )}
    </button>
  );
}

type CopyableUrlProps = {
  url: string;
  className?: string;
  linkClassName?: string;
  /** When set, link text differs from the href (e.g. "Open source"). */
  children?: ReactNode;
};

export function CopyableUrl({ url, className, linkClassName, children }: CopyableUrlProps) {
  const trimmed = url.trim();
  if (!trimmed) return null;

  return (
    <span className={cn('inline-flex max-w-full items-start gap-1', className)}>
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('text-accent-800 break-all hover:underline', linkClassName)}
      >
        {children ?? trimmed}
      </a>
      <CopyUrlButton url={trimmed} className="mt-0.5" />
    </span>
  );
}
