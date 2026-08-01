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
        'flex gap-2 rounded-xl bg-surface p-3.1',
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
  return <p className={cn('text-[10px] tracking-[0.1em] uppercase text-accent', className)}>{children}</p>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-heading text-[17px] leading-tight', className)}>{children}</p>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('m-0 text-[13px] opacity-80 flex-1', className)}>{children}</p>;
}

export function CardMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('flex items-center gap-1.5 text-[11px] text-ink/50', className)}>{children}</p>;
}
