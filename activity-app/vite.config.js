import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function bardoRoutesBannerPlugin() {
  return {
    name: 'bardo-routes-banner',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address();
        const port = typeof address === 'object' && address?.port ? address.port : 5173;
        const host = `http://localhost:${port}`;

        setTimeout(() => {
          console.log('\n');
          console.log('\x1b[36m%s\x1b[0m', '  ✦ BARDO — Accesos Directos a Pantallas de Desarrollo ✦');
          console.log('\x1b[90m%s\x1b[0m', '  ─────────────────────────────────────────────────────────────');
          console.log('  \x1b[1m📚 Documentos:\x1b[0m');
          console.log(`     • Biblioteca          ➜  \x1b[34m\x1b[4m${host}/#library\x1b[0m`);
          console.log(`     • Lector (Ejemplo)    ➜  \x1b[34m\x1b[4m${host}/#doc-welcome\x1b[0m`);
          console.log('\n  \x1b[1m🗓️  Reuniones:\x1b[0m');
          console.log(`     • Inicio (Reuniones)  ➜  \x1b[34m\x1b[4m${host}/#planner\x1b[0m`);
          console.log(`     • Editor de reunión   ➜  \x1b[34m\x1b[4m${host}/#planner/editor\x1b[0m`);
          console.log(`     • Reunión en vivo     ➜  \x1b[34m\x1b[4m${host}/#planner/agenda\x1b[0m`);
          console.log(`     • Acta de reunión     ➜  \x1b[34m\x1b[4m${host}/#planner/minutes\x1b[0m`);
          console.log(`     • Resumen (Recap)     ➜  \x1b[34m\x1b[4m${host}/#planner/recap\x1b[0m`);
          console.log('\x1b[90m%s\x1b[0m', '  ─────────────────────────────────────────────────────────────\n');
        }, 100);
      });
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [react(), tailwindcss(), bardoRoutesBannerPlugin()],
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
          if (id.includes('@radix-ui') || id.includes('@gravity-ui') || id.includes('lucide-react')) return 'ui-vendor';
          return undefined;
        },
      },
    },
  },
});
