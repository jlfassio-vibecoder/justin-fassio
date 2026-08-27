export type Theme = 'light' | 'dark';

/** localStorage key — namespaced so it does not collide with other apps on localhost. */
export const THEME_STORAGE_KEY = 'rcc-theme';

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function getAppliedTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const applied = document.documentElement.getAttribute('data-theme');
  return applied === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private browsing, quota, etc.)
  }
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
