import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

mkdirSync('.wrangler', { recursive: true });

const command = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
const result = spawnSync(
  command,
  ['types', '.wrangler/worker-configuration.d.ts', '--include-runtime=false'],
  { stdio: 'inherit', env: process.env },
);

if (result.error) {
  console.error('[types] could not start Wrangler:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
