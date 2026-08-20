import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['src', 'scripts'];
const files = [];

function collect(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

for (const root of roots) collect(root);

const asyncNames = new Set();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\basync\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g)) asyncNames.add(match[1]);
  for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b/g)) asyncNames.add(match[1]);
}

const failures = [];
const warnings = [];
const directPromise = /^\s*new\s+Promise\s*\(/;
const asyncIife = /^\s*\(?\s*async\s*\([^)]*\)\s*=>/;

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    if (directPromise.test(line) || asyncIife.test(line)) {
      if (!/\b(?:await|return|void)\b/.test(line) && !/\.(?:catch|then|finally)\s*\(/.test(line)) {
        failures.push({ file, line: index + 1, text: trimmed, reason: 'discarded Promise expression' });
      }
    }

    for (const name of asyncNames) {
      const pattern = new RegExp(`^\\s*${name}\\s*\\([^;]*\\);\\s*(?://.*)?$`);
      if (pattern.test(line)) {
        failures.push({ file, line: index + 1, text: trimmed, reason: `unowned call to async function ${name}()` });
      }
    }

    if (/\.catch\s*\(\s*\(?.*\)?\s*=>\s*\{?\s*\}?\s*\)\s*;?\s*$/.test(trimmed) && /catch\s*\(\s*\(?.*=>\s*\{?\s*\}?\s*\)/.test(trimmed)) {
      warnings.push({ file, line: index + 1, text: trimmed, reason: 'empty catch handler; promise is owned but error is intentionally discarded' });
    }
  }
}

for (const warning of warnings) {
  console.warn(`[promises] warning ${relative(process.cwd(), warning.file)}:${warning.line} — ${warning.reason}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[promises] ${relative(process.cwd(), failure.file)}:${failure.line} — ${failure.reason}`);
    console.error(`  ${failure.text}`);
  }
  console.error(`[promises] ${failures.length} definite floating promise candidate(s) found.`);
  process.exit(1);
}

console.log(`[promises] no definite floating promise candidates found across ${files.length} JavaScript files (${warnings.length} warning(s)).`);
