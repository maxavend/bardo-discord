import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

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

function findChrome() {
  const candidates = [];
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) candidates.push(process.env.CHROME_PATH);
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) candidates.push(found.stdout.trim());
  }
  for (const macPath of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']) {
    if (existsSync(macPath)) candidates.push(macPath);
  }
  for (const binary of candidates) {
    const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
    const match = String(version.stdout || version.stderr || '').match(/(\d+)\.\d+\.\d+\.\d+/);
    if (match) return { binary, major: Number(match[1]), version: match[0] };
  }
  throw new Error('Chrome/Chromium is required for the axe accessibility gate.');
}

async function matchingChromeDriver() {
  const chrome = findChrome();
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const installed = spawnSync(npx, ['--yes', 'browser-driver-manager@2.0.1', 'install', `chrome@${chrome.major}`], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (installed.error) throw installed.error;
  if (installed.status !== 0) throw new Error(`Could not install ChromeDriver for Chrome ${chrome.version}: ${installed.stderr || installed.stdout}`);

  const envPath = resolve(homedir(), '.browser-driver-manager/.env');
  const envFile = await readFile(envPath, 'utf8');
  const raw = envFile.match(/^CHROMEDRIVER_TEST_PATH=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error(`browser-driver-manager did not write CHROMEDRIVER_TEST_PATH to ${envPath}`);
  const driverPath = isAbsolute(raw) ? raw : resolve(homedir(), raw);
  if (!existsSync(driverPath)) throw new Error(`ChromeDriver path does not exist: ${driverPath}`);
  const driverVersion = spawnSync(driverPath, ['--version'], { encoding: 'utf8' });
  const driverMajor = Number(String(driverVersion.stdout || driverVersion.stderr || '').match(/ChromeDriver\s+(\d+)/)?.[1] || 0);
  if (driverMajor !== chrome.major) throw new Error(`ChromeDriver major ${driverMajor} does not match Chrome ${chrome.major}`);
  console.log(`AXE_DRIVER Chrome=${chrome.version} ChromeDriverMajor=${driverMajor}`);
  return { chrome, driverPath };
}

const driver = await matchingChromeDriver();

function runAxe(url) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = [
    '--yes', '@axe-core/cli@4.13.0',
    '--stdout',
    '--load-delay=900',
    '--timeout=120',
    '--tags=wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa',
    `--chromedriver-path=${driver.driverPath}`,
    '--chrome-options=headless=new,no-sandbox,disable-setuid-sandbox,disable-dev-shm-usage',
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

function parseAxeJson(raw, view) {
  // axe-cli may print a human-readable load-delay line before its JSON payload.
  // Accept only that prefix shape by locating the first JSON token; the payload
  // itself must still parse strictly as JSON so malformed evidence fails closed.
  const firstArray = raw.indexOf('[');
  const firstObject = raw.indexOf('{');
  const starts = [firstArray, firstObject].filter((value) => value >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  if (start < 0) throw new Error(`axe-cli returned no JSON payload for ${view}: ${raw.slice(0, 1200)}`);
  const json = raw.slice(start).trim();
  try { return JSON.parse(json); }
  catch { throw new Error(`axe-cli returned malformed JSON output for ${view}: ${raw.slice(0, 1200)}`); }
}

const views = ['docs', 'kanban', 'planner', 'home'];
const evidence = {
  schemaVersion: 1,
  axeCliVersion: '4.13.0',
  chromeVersion: driver.chrome.version,
  chromeMajor: driver.chrome.major,
  generatedAt: new Date().toISOString(),
  tags: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'],
  views: {},
  totals: { violations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
};

try {
  for (const view of views) {
    const url = `http://127.0.0.1:4174/test/visual/fixture.html?view=${view}`;
    const raw = await runAxe(url);
    const parsed = parseAxeJson(raw, view);
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
        nodeDetails: Array.isArray(violation.nodes) ? violation.nodes.map((node) => ({
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary,
          any: Array.isArray(node.any) ? node.any.map(({ id, impact, message, data }) => ({ id, impact, message, data })) : [],
        })) : [],
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
