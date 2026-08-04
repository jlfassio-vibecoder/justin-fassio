import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const inputBase =
  'min-h-9 px-3.5 py-1.5 font-body text-sm text-ink bg-surface border border-ink/15 rounded-md hover:border-ink/45 focus-visible:outline-none focus-visible:border-accent transition-colors';

/** `cn` does not merge Tailwind utilities; skip default `w-full` when a width class is passed. */
function withDefaultFullWidth(className?: string): string {
  return /\bw-/.test(className ?? '') ? '' : 'w-full';
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(inputBase, withDefaultFullWidth(className), 'rounded-full', className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(inputBase, withDefaultFullWidth(className), 'rounded-full', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(inputBase, withDefaultFullWidth(className), 'min-h-[90px] resize-y', className)}
      {...props}
    />
  );
});

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-ink/70 mb-1 block text-xs">{children}</label>;
}

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col', className)}>{children}</div>;
}
