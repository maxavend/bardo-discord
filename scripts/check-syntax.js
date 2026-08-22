import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'scripts'];
const files = [];

function collect(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

for (const root of roots) {
  if (statSync(root).isDirectory()) collect(root);
}

files.sort();
let failures = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    failures += 1;
    console.error(`[syntax] failed: ${relative(process.cwd(), file)}`);
  }
}

if (failures > 0) {
  console.error(`[syntax] ${failures} file(s) failed Node syntax validation.`);
  process.exit(1);
}

console.log(`[syntax] ${files.length} JavaScript files validated.`);
