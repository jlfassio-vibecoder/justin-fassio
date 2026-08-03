/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  // Keep Vitest's optimizer cache separate from `astro dev` so running tests
  // doesn't invalidate browser `?v=` hashes (504 Outdated Optimize Dep).
  cacheDir: 'node_modules/.vite/vitest',
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
