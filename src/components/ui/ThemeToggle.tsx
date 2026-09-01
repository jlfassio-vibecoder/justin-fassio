import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={cn(
        'text-muted hover:bg-accent-100 hover:text-ink inline-flex items-center justify-center rounded-full p-2 transition-colors',
        className,
      )}
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <Sun className="h-4 w-4" strokeWidth={2.75} aria-hidden />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={2.75} aria-hidden />
      )}
    </button>
  );
}
