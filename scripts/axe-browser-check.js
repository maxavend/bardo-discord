import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve('.');
const artifactDir = resolve('.artifacts/release');
await mkdir(artifactDir, { recursive: true });
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const file = join(root, pathname === '/' ? 'test/visual/fixture.html' : pathname);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(res);
});
await new Promise((resolveListen) => server.listen(4174, '127.0.0.1', resolveListen));

function runAxe(url) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = [
    '--yes', '@axe-core/cli@4.13.0',
    '--stdout',
    '--load-delay=900',
    '--timeout=120',
    '--tags=wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa',
    '--chrome-options=no-sandbox,disable-setuid-sandbox,disable-dev-shm-usage',
    url,
  ];
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`axe-cli failed for ${url} (exit ${code}): ${stderr || stdout}`));
      else resolveRun(stdout);
    });
  });
}

const views = ['docs', 'kanban', 'planner', 'home'];
const evidence = {
  schemaVersion: 1,
  axeCliVersion: '4.13.0',
  generatedAt: new Date().toISOString(),
  tags: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'],
  views: {},
  totals: { violations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
};

try {
  for (const view of views) {
    const url = `http://127.0.0.1:4174/test/visual/fixture.html?view=${view}`;
    const raw = await runAxe(url);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error(`axe-cli returned non-JSON output for ${view}: ${raw.slice(0, 1200)}`); }
    const result = Array.isArray(parsed) ? parsed[0] : parsed;
    const violations = Array.isArray(result?.violations) ? result.violations : [];
    const counts = { violations: violations.length, critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
    for (const violation of violations) {
      const impact = ['critical','serious','moderate','minor'].includes(violation?.impact) ? violation.impact : 'unknown';
      counts[impact] += 1;
    }
    for (const key of Object.keys(evidence.totals)) evidence.totals[key] += counts[key] || 0;
    evidence.views[view] = {
      url,
      counts,
      violations: violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact || null,
        description: violation.description,
        help: violation.help,
        nodes: Array.isArray(violation.nodes) ? violation.nodes.length : 0,
      })),
    };
    console.log(`AXE ${view} violations=${counts.violations} critical=${counts.critical} serious=${counts.serious}`);
  }
  await writeFile(resolve(artifactDir, 'axe-results.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  if (evidence.totals.critical > 0) throw new Error(`axe-core found ${evidence.totals.critical} critical accessibility violation(s)`);
  console.log(`AXE_GATE PASS critical=0 total=${evidence.totals.violations}`);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
