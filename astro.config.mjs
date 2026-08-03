import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Keep island deps prebundled so browser clients don't hit 504 Outdated Optimize Dep
    // when Vite rehashes after npm install / config changes during an active session.
    // Include jsx-dev-runtime so a production-poisoned optimize (from `astro check`)
    // cannot leave jsxDEV undefined for local React islands.
    optimizeDeps: {
      include: [
        '@supabase/supabase-js',
        'lucide-react',
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
  },
});
