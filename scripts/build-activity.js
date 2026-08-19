import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

async function bundle() {
  console.log('📦 Empaquetando Discord Embedded App SDK para static assets...');
  await build({
    entryPoints: [resolve(rootDir, 'node_modules/@discord/embedded-app-sdk/output/index.mjs')],
    outfile: resolve(rootDir, 'activity/vendor/discord-sdk.js'),
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    minify: false,
    sourcemap: false,
    logLevel: 'info',
  });
  console.log('✅ Discord Embedded App SDK empaquetado en activity/vendor/discord-sdk.js');
}

bundle().catch((err) => {
  console.error('❌ Error empaquetando Discord SDK:', err);
  process.exit(1);
});
