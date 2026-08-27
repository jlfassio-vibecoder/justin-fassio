import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getAppliedTheme,
  getStoredTheme,
  subscribeTheme,
  toggleTheme,
} from '@/lib/theme';

describe('theme helpers', () => {
  const store = new Map<string, string>();
  let setItemImpl: (key: string, value: string) => void;

  beforeEach(() => {
    store.clear();
    setItemImpl = (key, value) => {
      store.set(key, value);
    };
    const stub = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        setItemImpl(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };
    vi.stubGlobal('localStorage', stub);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: stub,
    });
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
  });

  it('defaults to light when nothing is stored', () => {
    expect(getStoredTheme()).toBe('light');
    expect(getAppliedTheme()).toBe('light');
  });

  it('applyTheme sets data-theme and localStorage', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(getAppliedTheme()).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('applyTheme notifies theme subscribers', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeTheme(onChange);
    applyTheme('dark');
    expect(onChange).toHaveBeenCalled();
    unsubscribe();
  });

  it('toggleTheme flips light and dark', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });

  it('getStoredTheme treats unknown values as light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(getStoredTheme()).toBe('light');
  });

  it('applyTheme ignores localStorage failures', () => {
    setItemImpl = () => {
      throw new Error('quota');
    };
    expect(() => applyTheme('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
