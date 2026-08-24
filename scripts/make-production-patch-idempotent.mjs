import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'scripts/apply-production-worker.mjs';
let source = readFileSync(filePath, 'utf8');

const marker = 'Production Worker already contains materialized inline Activity launch';
if (source.includes(marker)) {
  console.log('Production patch is already idempotent.');
  process.exit(0);
}

const anchor = "let source = readFileSync(filePath, 'utf8');\n";
if (!source.includes(anchor)) {
  throw new Error('No encontré el ancla de lectura en apply-production-worker.mjs');
}

const guard = `\n// A materialized production Worker already contains every integration below.\n// Do not try to reconstruct the legacy remote-callback path on top of it.\nif (\n  source.includes('return jsonResponse({ type: 12 });') &&\n  source.includes('handleDiscordAuthApi') &&\n  source.includes('handleDocsApi') &&\n  source.includes('persistLaunchContext')\n) {\n  console.log('Production Worker already contains materialized inline Activity launch; no patch required.');\n  process.exit(0);\n}\n`;

source = source.replace(anchor, `${anchor}${guard}`);
writeFileSync(filePath, source);
console.log('apply-production-worker.mjs is now idempotent for the materialized Worker.');
