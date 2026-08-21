import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const artifactDir = resolve('.artifacts/release');
mkdirSync(artifactDir, { recursive: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['audit', '--json'], { encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024 });
if (result.error) throw result.error;
let report;
try { report = JSON.parse(result.stdout || '{}'); }
catch { throw new Error(`npm audit did not return JSON: ${(result.stderr || result.stdout || '').slice(0, 2000)}`); }

writeFileSync(resolve(artifactDir, 'npm-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const counts = report.metadata?.vulnerabilities || {};
const vulnerabilities = Object.entries(report.vulnerabilities || {}).map(([name, item]) => ({
  name,
  severity: item?.severity || 'unknown',
  direct: Boolean(item?.isDirect),
  range: item?.range || null,
  fixAvailable: item?.fixAvailable ?? null,
  via: Array.isArray(item?.via) ? item.via.map((entry) => typeof entry === 'string' ? entry : {
    source: entry?.source || null,
    name: entry?.name || null,
    severity: entry?.severity || null,
    title: entry?.title || null,
    url: entry?.url || null,
    range: entry?.range || null,
  }) : [],
  effects: Array.isArray(item?.effects) ? item.effects : [],
}));
writeFileSync(resolve(artifactDir, 'npm-audit-summary.json'), `${JSON.stringify({ counts, vulnerabilities }, null, 2)}\n`, 'utf8');
console.log(`[audit] total=${counts.total || 0} critical=${counts.critical || 0} high=${counts.high || 0} moderate=${counts.moderate || 0} low=${counts.low || 0}`);
for (const item of vulnerabilities) console.log(`[audit] ${item.severity} ${item.name} direct=${item.direct} fix=${JSON.stringify(item.fixAvailable)}`);
if (Number(counts.critical || 0) > 0) process.exit(2);
