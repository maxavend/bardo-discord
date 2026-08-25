import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, '../activity'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@discord/embedded-app-sdk')) return 'discord-sdk';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('@heroui') || id.includes('@gravity-ui')) return 'ui-vendor';
          return undefined;
        },
      },
    },
  },
});
