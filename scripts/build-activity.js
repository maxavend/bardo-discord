import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename, join } from 'node:path';
import { readdir, rm, readFile, writeFile, mkdir } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const srcDir = resolve(rootDir, 'src/activity');
const outDir = resolve(rootDir, 'activity');

async function cleanOutDir() {
  await mkdir(outDir, { recursive: true });
  const entries = await readdir(outDir);
  for (const entry of entries) {
    const fullPath = join(outDir, entry);
    await rm(fullPath, { recursive: true, force: true });
  }
}

async function bundle() {
  console.log('📦 Limpiando y empaquetando Activity frontend con fingerprinting...');
  await cleanOutDir();

  const result = await build({
    entryPoints: [
      resolve(srcDir, 'app.js'),
      resolve(srcDir, 'styles.css'),
    ],
    outdir: outDir,
    entryNames: '[name]-[hash]',
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    minify: false,
    sourcemap: false,
    metafile: true,
    logLevel: 'info',
  });

  const outputs = Object.keys(result.metafile.outputs);
  let appFile = '';
  let styleFile = '';

  for (const output of outputs) {
    const fileName = basename(output);
    if (fileName.startsWith('app-') && fileName.endsWith('.js')) {
      appFile = fileName;
    } else if (fileName.startsWith('styles-') && fileName.endsWith('.css')) {
      styleFile = fileName;
    }
  }

  if (!appFile || !styleFile) {
    throw new Error(`No se generaron los bundles esperados. Salidas: ${outputs.join(', ')}`);
  }

  console.log(`✨ Bundles generados: ${appFile}, ${styleFile}`);

  const templatePath = resolve(srcDir, 'index.html');
  let html = await readFile(templatePath, 'utf8');

  html = html.replace('<!-- STYLES -->', `<link rel="stylesheet" href="/${styleFile}" />`);
  html = html.replace('<!-- SCRIPTS -->', `<script type="module" src="/${appFile}"></script>`);

  await writeFile(resolve(outDir, 'index.html'), html, 'utf8');
  console.log('✅ activity/index.html actualizado con assets fingerprinted');
}

bundle().catch((err) => {
  console.error('❌ Error empaquetando Activity:', err);
  process.exit(1);
});
