import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-bg hover:bg-accent-600 active:bg-accent-700',
  secondary: 'border border-ink/15 hover:bg-ink/[0.07] active:bg-ink/[0.14]',
  ghost: 'text-accent px-1.1 hover:bg-accent/10 active:bg-accent/[0.18]',
  icon: 'w-9 h-9 p-0 bg-transparent',
};

export function Button({ variant = 'secondary', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-4 py-2 font-heading text-sm leading-tight no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
