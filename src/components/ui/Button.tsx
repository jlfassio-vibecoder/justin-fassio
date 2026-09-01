import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-600 active:bg-accent-700',
  secondary: 'border-border hover:bg-ink/[0.07] active:bg-ink/[0.14] border',
  ghost: 'text-accent px-1.1 hover:bg-accent/10 active:bg-accent/[0.18]',
  icon: 'h-9 w-9 bg-transparent p-0',
};

export function Button({ variant = 'secondary', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'font-heading inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-transparent px-4 py-2 text-sm leading-tight no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
