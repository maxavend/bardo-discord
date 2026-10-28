import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Static build to dist/, served by worker/index.js. Only the demos and the
// waitlist ship JavaScript (React islands); the rest of the page is HTML.
export default defineConfig({
  output: 'static',
  // /privacidad.html and /terminos.html, served at /privacidad and /terminos.
  build: { format: 'file' },
  trailingSlash: 'never',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // `npm run dev:ui` proxies the waitlist to `wrangler dev` (npm run dev) on 8790.
    server: { proxy: { '/api': 'http://localhost:8790' } },
  },
});
