import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  /** Overlay stacking class. Defaults to `z-50`; account-flow overlays use `z-[60]`. */
  overlayClassName?: string;
}

export function DialogBackdrop({
  open,
  onClose,
  children,
  panelClassName,
  overlayClassName = 'z-50',
}: DialogProps) {
  if (!open) return null;
  return (
    <div
      className={cn(
        'p-4.1 fixed inset-0 grid place-items-center overflow-y-auto bg-neutral-900/50',
        overlayClassName,
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn('w-full', panelClassName ?? 'max-w-[560px]')}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <p className="font-heading text-xl">{children}</p>;
}
