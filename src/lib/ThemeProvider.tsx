import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { ThemeContext } from '@/lib/ThemeContext';
import {
  applyTheme,
  getAppliedTheme,
  getThemeServerSnapshot,
  subscribeTheme,
  toggleTheme,
  type Theme,
} from '@/lib/theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getAppliedTheme, getThemeServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(toggleTheme(theme));
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}
