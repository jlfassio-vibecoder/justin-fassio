import { useEffect } from 'react';
import { X } from 'lucide-react';
import { DialogBackdrop } from '@/components/ui/Dialog';

export type ProductImagePreviewOverlayProps = {
  open: boolean;
  onClose: () => void;
  src: string;
  title: string;
  /** Overlay stacking class. Defaults to `z-[70]`. */
  overlayClassName?: string;
};

export function ProductImagePreviewOverlay({
  open,
  onClose,
  src,
  title,
  overlayClassName = 'z-[70]',
}: ProductImagePreviewOverlayProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <DialogBackdrop
      open
      overlayClassName={overlayClassName}
      panelClassName="max-w-[min(96vw,960px)]"
      onClose={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface relative flex max-h-[min(92dvh,960px)] flex-col gap-3 rounded-xl p-4 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-heading m-0 text-lg">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="text-ink/60 hover:text-ink shrink-0 rounded p-1"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" strokeWidth={2.75} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <img src={src} alt={title} className="max-h-[min(85dvh,900px)] w-full object-contain" />
        </div>
      </div>
    </DialogBackdrop>
  );
}
