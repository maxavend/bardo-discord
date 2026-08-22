import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename, join, normalize } from 'node:path';
import { readdir, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resizePng } from './png-resize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'src/activity');
const outDir = resolve(rootDir, 'activity');
const artifactDir = resolve(rootDir, '.artifacts');

function slash(value) { return normalize(value).replaceAll('\\', '/'); }
function kib(bytes) { return Math.round((Number(bytes || 0) / 1024) * 10) / 10; }

async function cleanOutDir() {
  await mkdir(outDir, { recursive: true });
  const entries = await readdir(outDir);
  for (const entry of entries) await rm(join(outDir, entry), { recursive: true, force: true });
}

function resolveImportedOutput(outputs, from, importPath) {
  const direct = slash(join(dirname(from), importPath));
  if (outputs[direct]) return direct;
  const clean = slash(importPath).replace(/^\.\//, '');
  return Object.keys(outputs).find((key) => key === clean || key.endsWith(`/${clean}`) || basename(key) === basename(clean)) || null;
}

function staticClosure(outputs, seeds) {
  const seen = new Set();
  const queue = seeds.filter(Boolean);
  while (queue.length) {
    const key = queue.shift();
    if (!key || seen.has(key) || !outputs[key]) continue;
    seen.add(key);
    for (const dependency of outputs[key].imports || []) {
      if (dependency.kind === 'dynamic-import' || dependency.external) continue;
      const resolved = resolveImportedOutput(outputs, key, dependency.path);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

function outputsWithInput(outputs, suffix) {
  const normalizedSuffix = slash(suffix);
  return Object.entries(outputs)
    .filter(([, meta]) => Object.keys(meta.inputs || {}).some((input) => slash(input).endsWith(normalizedSuffix)))
    .map(([key]) => key);
}

async function createBuildReport(metafile, avatarAssets) {
  const outputs = metafile.outputs;
  const sizes = {};
  for (const key of Object.keys(outputs)) {
    const filePath = resolve(rootDir, key);
    const bytes = await readFile(filePath);
    sizes[key] = { rawBytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length };
  }

  const entry = (suffix) => Object.entries(outputs)
    .find(([, meta]) => slash(meta.entryPoint || '').endsWith(slash(suffix)))?.[0] || null;
  const shellSeeds = [entry('src/activity/main.js'), entry('.artifacts/bardo-tailwind.css')];
  const shell = staticClosure(outputs, shellSeeds);

  const chromeInputs = ['src/activity/app/bootstrap.jsx'];
  const routeInputs = {
    home: [...chromeInputs, 'src/activity/features/home/home-page.jsx', 'src/activity/product-integration.js', 'src/activity/ui/migration-adapters.js'],
    documents: [
      ...chromeInputs,
      'src/activity/features/documents/document-trigger.jsx',
      'src/activity/editor-reliability.js', 'src/activity/import-bootstrap.js', 'src/activity/app.js',
      'src/activity/export-security.js', 'src/activity/product-integration.js', 'src/activity/ui/migration-adapters.js',
    ],
    kanban: [...chromeInputs, 'src/activity/board.js', 'src/activity/member-picker-remote.js', 'src/activity/product-integration.js', 'src/activity/ui/migration-adapters.js'],
    planner: [
      ...chromeInputs,
      'src/activity/event.js', 'src/activity/planner-member-directory.js',
      'src/activity/product-integration.js', 'src/activity/ui/migration-adapters.js',
    ],
  };

  const sum = (set, field) => [...set].reduce((total, key) => total + Number(sizes[key]?.[field] || 0), 0);
  const routes = {};
  for (const [name, inputs] of Object.entries(routeInputs)) {
    const routeSet = new Set(shell);
    for (const input of inputs) {
      const closure = staticClosure(outputs, outputsWithInput(outputs, input));
      for (const key of closure) routeSet.add(key);
    }
    routes[name] = {
      rawBytes: sum(routeSet, 'rawBytes'),
      gzipBytes: sum(routeSet, 'gzipBytes'),
      files: [...routeSet].sort(),
    };
  }

  const chunks = Object.entries(outputs)
    .filter(([key]) => /\.(?:js|css)$/.test(key))
    .map(([key, meta]) => {
      const inputs = Object.keys(meta.inputs || {});
      const lazyPdf = inputs.some((input) => /(?:pdfjs|unpdf)/i.test(input));
      return {
        file: key,
        rawBytes: sizes[key].rawBytes,
        gzipBytes: sizes[key].gzipBytes,
        inputs: inputs.slice(0, 12),
        lazyPdf,
        justification: lazyPdf ? 'Parser PDF existente y lazy; no forma parte de Home, Kanban ni Planner inicial.' : null,
      };
    })
    .sort((a, b) => b.gzipBytes - a.gzipBytes);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    budgets: {
      criticalShellGzipBytes: 80 * 1024,
      initialRouteGzipBytes: 250 * 1024,
      maxUnjustifiedChunkGzipBytes: 500 * 1024,
      avatarBytes: 50 * 1024,
    },
    shell: {
      rawBytes: sum(shell, 'rawBytes'),
      gzipBytes: sum(shell, 'gzipBytes'),
      files: [...shell].sort(),
    },
    routes,
    avatarAssets,
    chunks,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(resolve(artifactDir, 'activity-build.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const lines = [
    `critical-shell: ${kib(report.shell.gzipBytes)} KiB gzip`,
    ...Object.entries(routes).map(([name, value]) => `${name}: ${kib(value.gzipBytes)} KiB gzip`),
    ...avatarAssets.map((asset) => `${asset.size}x${asset.size} avatar: ${kib(asset.bytes)} KiB`),
    '',
    'Largest gzip chunks:',
    ...chunks.slice(0, 10).map((chunk) => `- ${chunk.file}: ${kib(chunk.gzipBytes)} KiB${chunk.lazyPdf ? ' (lazy PDF)' : ''}`),
  ];
  await writeFile(resolve(artifactDir, 'activity-build.txt'), `${lines.join('\n')}\n`, 'utf8');
  console.log(`📊 ${lines.slice(0, 7).join(' · ')}`);
}

async function emitAvatarAssets() {
  const source = await readFile(resolve(srcDir, 'bardo-avatar.png'));
  const assets = [];
  for (const size of [72, 144]) {
    const buffer = resizePng(source, size);
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8).toUpperCase();
    const file = `bardo-avatar-${size}-${hash}.png`;
    await writeFile(resolve(outDir, file), buffer);
    assets.push({ size, file, bytes: buffer.length });
  }
  return assets;
}

async function bundle() {
  console.log('📦 Limpiando y empaquetando Activity frontend con módulos lazy...');
  await cleanOutDir();

  const result = await build({
    entryPoints: [
      resolve(srcDir, 'main.js'),
      resolve(artifactDir, 'bardo-tailwind.css'),
    ],
    outdir: outDir,
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2022'],
    minify: true,
    sourcemap: false,
    metafile: true,
    logLevel: 'info',
  });

  const outputs = Object.keys(result.metafile.outputs);
  let appFile = '';
  let styleFile = '';
  for (const output of outputs) {
    const fileName = basename(output);
    if (fileName.startsWith('main-') && fileName.endsWith('.js')) appFile = fileName;
    else if (fileName.startsWith('bardo-tailwind-') && fileName.endsWith('.css')) styleFile = fileName;
  }
  if (!appFile || !styleFile) throw new Error(`No se generaron los bundles esperados. Salidas: ${outputs.join(', ')}`);

  const avatarAssets = await emitAvatarAssets();
  const avatar72 = avatarAssets.find((asset) => asset.size === 72);
  const avatar144 = avatarAssets.find((asset) => asset.size === 144);

  console.log(`✨ Entry bundles: ${appFile}, ${styleFile}`);
  console.log(`🧩 Chunks lazy generados: ${outputs.filter((output) => output.includes('/chunks/')).length}`);
  console.log(`🖼️ Avatar servido: ${avatar72.bytes} B (72px), ${avatar144.bytes} B (144px); fuente 1024px queda solo en build.`);

  const templatePath = resolve(srcDir, 'index.html');
  let html = await readFile(templatePath, 'utf8');
  html = html.replace('<!-- STYLES -->', `<link rel="stylesheet" href="/${styleFile}" />`);
  html = html.replace('<!-- SCRIPTS -->', `<script type="module" src="/${appFile}"></script>`);
  html = html.replaceAll('<!-- AVATAR_SRC -->', `/${avatar72.file}`);
  html = html.replaceAll('<!-- AVATAR_SRCSET -->', `srcset="/${avatar72.file} 72w, /${avatar144.file} 144w" sizes="36px"`);
  await writeFile(resolve(outDir, 'index.html'), html, 'utf8');
  await createBuildReport(result.metafile, avatarAssets);
  console.log('✅ activity/index.html y reporte de performance actualizados');
}

bundle().catch((err) => { console.error('❌ Error empaquetando Activity:', err); process.exit(1); });
