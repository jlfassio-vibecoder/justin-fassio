/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Astro 6's Vite types and Vitest's Vite types disagree; getViteConfig still merges `test`.
export default getViteConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
} as Parameters<typeof getViteConfig>[0]);
