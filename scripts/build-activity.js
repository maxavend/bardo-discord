import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename, join } from 'node:path';
import { readdir, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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
    entryPoints: [resolve(srcDir, 'main.js')],
    outdir: outDir,
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
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
    if (fileName.startsWith('main-') && fileName.endsWith('.js')) {
      appFile = fileName;
    } else if (fileName.startsWith('main-') && fileName.endsWith('.css')) {
      styleFile = fileName;
    }
  }

  if (!appFile || !styleFile) {
    throw new Error(`No se generaron los bundles esperados. Salidas: ${outputs.join(', ')}`);
  }

  const avatarPath = resolve(srcDir, 'bardo-avatar.png');
  const avatarBuffer = await readFile(avatarPath);
  const avatarHash = createHash('md5').update(avatarBuffer).digest('hex').slice(0, 8).toUpperCase();
  const avatarFileName = `bardo-avatar-${avatarHash}.png`;
  await writeFile(resolve(outDir, avatarFileName), avatarBuffer);

  console.log(`✨ Entry bundles: ${appFile}, ${styleFile}, ${avatarFileName}`);
  console.log(`🧩 Chunks lazy generados: ${outputs.filter((output) => output.includes('/chunks/')).length}`);

  const templatePath = resolve(srcDir, 'index.html');
  let html = await readFile(templatePath, 'utf8');

  html = html.replace('<!-- STYLES -->', `<link rel="stylesheet" href="/${styleFile}" />`);
  html = html.replace('<!-- SCRIPTS -->', `<script type="module" src="/${appFile}"></script>`);
  html = html.replace('<!-- AVATAR_SRC -->', `/${avatarFileName}`);

  await writeFile(resolve(outDir, 'index.html'), html, 'utf8');
  console.log('✅ activity/index.html actualizado con assets fingerprinted');
}

bundle().catch((err) => {
  console.error('❌ Error empaquetando Activity:', err);
  process.exit(1);
});
