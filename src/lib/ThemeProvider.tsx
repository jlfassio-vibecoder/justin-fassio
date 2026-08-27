import { useCallback, useState, type ReactNode } from 'react';
import { ThemeContext } from '@/lib/ThemeContext';
import { applyTheme, getAppliedTheme, toggleTheme, type Theme } from '@/lib/theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getAppliedTheme());

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(toggleTheme(theme));
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}
