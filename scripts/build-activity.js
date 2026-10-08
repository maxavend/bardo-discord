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

console.log('✅ Activity frontend construida exitosamente en ./activity\n');

const host = process.env.DEV_HOST || 'http://localhost:8787';
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
