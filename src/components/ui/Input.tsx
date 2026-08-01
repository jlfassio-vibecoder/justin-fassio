import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const inputBase =
  'w-full min-h-9 px-3.5 py-1.5 font-body text-sm text-ink bg-surface border border-ink/15 rounded-md hover:border-ink/45 focus-visible:outline-none focus-visible:border-accent transition-colors';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, 'rounded-full', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, 'rounded-full', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'min-h-[90px] resize-y', className)} {...props} />;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs text-ink/70">{children}</label>;
}

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col', className)}>{children}</div>;
}
