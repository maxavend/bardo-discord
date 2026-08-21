import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const report = JSON.parse(await readFile(resolve('.artifacts/activity-build.json'), 'utf8'));
const failures = [];
const warnings = [];
const kib = (bytes) => Math.round((Number(bytes || 0) / 1024) * 10) / 10;

if (report.shell.gzipBytes > report.budgets.criticalShellGzipBytes) {
  failures.push(`critical shell ${kib(report.shell.gzipBytes)} KiB > ${kib(report.budgets.criticalShellGzipBytes)} KiB`);
}
for (const [name, route] of Object.entries(report.routes || {})) {
  if (route.gzipBytes > report.budgets.initialRouteGzipBytes) {
    failures.push(`${name} initial route ${kib(route.gzipBytes)} KiB > ${kib(report.budgets.initialRouteGzipBytes)} KiB`);
  }
}
for (const asset of report.avatarAssets || []) {
  if (asset.bytes > report.budgets.avatarBytes) {
    failures.push(`avatar ${asset.size}px ${kib(asset.bytes)} KiB > ${kib(report.budgets.avatarBytes)} KiB`);
  }
}
for (const chunk of report.chunks || []) {
  if (chunk.gzipBytes <= report.budgets.maxUnjustifiedChunkGzipBytes) continue;
  if (chunk.lazyPdf && chunk.justification) warnings.push(`${chunk.file}: ${kib(chunk.gzipBytes)} KiB — ${chunk.justification}`);
  else failures.push(`unjustified chunk ${chunk.file} ${kib(chunk.gzipBytes)} KiB > ${kib(report.budgets.maxUnjustifiedChunkGzipBytes)} KiB`);
}

console.log(`[budgets] shell ${kib(report.shell.gzipBytes)} KiB gzip`);
for (const [name, route] of Object.entries(report.routes || {})) console.log(`[budgets] ${name} ${kib(route.gzipBytes)} KiB gzip`);
for (const asset of report.avatarAssets || []) console.log(`[budgets] avatar ${asset.size}px ${kib(asset.bytes)} KiB`);
for (const warning of warnings) console.warn(`[budgets] justified exception: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`[budgets] FAIL ${failure}`);
  process.exit(1);
}
console.log('[budgets] PASS — Activity bundle and asset budgets are within the Phase 6 contract.');
