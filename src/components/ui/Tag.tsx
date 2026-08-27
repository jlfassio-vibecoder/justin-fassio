import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'accent' | 'accent-2' | 'neutral' | 'outline';

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  accent: 'bg-accent-100 text-accent-800',
  'accent-2': 'bg-accent-2-100 text-accent-2-800',
  neutral: 'bg-neutral-100 text-neutral-800',
  outline: 'border border-accent text-accent',
};

export function Tag({ variant = 'neutral', className, children, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xl px-2.5 py-[3px] text-[11px] tracking-wide',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
