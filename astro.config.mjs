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
    optimizeDeps: {
      include: ['@supabase/supabase-js', 'lucide-react', 'react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});

