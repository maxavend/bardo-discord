import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Static build with hashed scripts. Only the interactive demos hydrate.
export default defineConfig({
  output: 'static',
  // /privacidad.html and /terminos.html, served at /privacidad and /terminos.
  build: { format: 'file' },
  trailingSlash: 'never',
  security: {
    csp: {
      directives: ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "form-action 'none'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'"],
      // React and motion use style attributes; scripts remain restricted to self and hashes.
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
