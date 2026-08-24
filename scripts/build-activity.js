import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const docsAppDir = resolve(rootDir, 'activity-app');

console.log('📦 Construyendo Activity React frontend (HeroUI) en ./activity...');

execSync('npm run build', {
  cwd: docsAppDir,
  stdio: 'inherit',
});

const outHtml = resolve(rootDir, 'activity/index.html');
if (!existsSync(outHtml)) {
  throw new Error(`El build de la Activity no generó ${outHtml}`);
}

console.log('✅ Activity frontend construida exitosamente en ./activity');
