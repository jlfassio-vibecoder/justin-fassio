import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
}

export function DialogBackdrop({ open, onClose, children, panelClassName }: DialogProps) {
  if (!open) return null;
  return (
    <div
      className="p-4.1 fixed inset-0 z-50 grid place-items-center bg-neutral-900/50"
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
