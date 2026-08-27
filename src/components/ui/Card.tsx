import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Elevation = 'sm' | 'md' | 'lg' | 'none';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  row?: boolean;
  children?: ReactNode;
}

const elevationClasses: Record<Elevation, string> = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  none: '',
};

export function Card({ elevation = 'sm', row = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border-border p-3.1 flex gap-2 rounded-lg border',
        row ? 'flex-row' : 'flex-col',
        elevationClasses[elevation],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardKicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-accent text-[10px] tracking-[0.1em] uppercase', className)}>
      {children}
    </p>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-heading text-[17px] leading-tight', className)}>{children}</p>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-muted m-0 flex-1 text-[13px]', className)}>{children}</p>;
}

export function CardMeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-subtle flex items-center gap-1.5 text-[11px]', className)}>{children}</p>
  );
}
