import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const root = resolve('.');
const outDir = resolve('.artifacts/ui');
await mkdir(outDir, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = join(root, pathname === '/' ? 'test/visual/fixture.html' : pathname);
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  if (!existsSync(file)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise((resolveListen) => server.listen(4173, '127.0.0.1', resolveListen));

function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  for (const macPath of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']) {
    if (existsSync(macPath)) return macPath;
  }
  throw new Error('Chrome/Chromium is required for Bardo browser evidence.');
}

async function connectChrome(chrome) {
  const profile = await mkdtemp(join(tmpdir(), 'bardo-visual-chrome-'));
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-lcd-text', '--font-render-hinting=none',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  const browserUrl = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Chrome DevTools did not start. ${stderr}`)), 10_000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolveUrl(match[1]); }
    });
    child.on('error', reject);
  });
  const port = new URL(browserUrl).port;
  let page;
  for (let attempt = 0; attempt < 30 && !page; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()).catch(() => []);
    page = targets.find((target) => target.type === 'page');
    if (!page) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (!page) throw new Error('Chrome page target was not available.');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    for (const listener of listeners.get(message.method) || []) listener(message.params);
  });
  const send = (method, params = {}) => new Promise((resolveSend) => {
    sequence += 1;
    pending.set(sequence, resolveSend);
    socket.send(JSON.stringify({ id: sequence, method, params }));
  });
  const once = (method) => new Promise((resolveEvent) => {
    const handler = (params) => {
      listeners.set(method, (listeners.get(method) || []).filter((item) => item !== handler));
      resolveEvent(params);
    };
    listeners.set(method, [...(listeners.get(method) || []), handler]);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  return { child, profile, send, once, socket };
}

async function renderPage(client, { url, width, screenshotPath = null, reducedMotion = false, highContrast = false, darkMode = null }) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.send('Emulation.setScrollbarsHidden', { hidden: Boolean(screenshotPath) });
  await client.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [
      { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
      { name: 'forced-colors', value: highContrast ? 'active' : 'none' },
      ...(darkMode === null ? [] : [{ name: 'prefers-color-scheme', value: darkMode ? 'dark' : 'light' }]),
    ],
  });
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await loaded;
  await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  const evaluated = await client.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true });
  const dom = evaluated.result?.result?.value || '';
  if (screenshotPath) {
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    await writeFile(screenshotPath, Buffer.from(screenshot.result.data, 'base64'));
  }
  return dom;
}

const hash = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16);
const diagnostics = (dom) => (dom.match(/<body[^>]*>/i)?.[0] || '<body unavailable>').slice(0, 1400);
const bodyAttribute = (dom, name) => dom.match(new RegExp(`${name}="([^"]+)"`, 'i'))?.[1] || null;
function assertBrowserContract(dom, label, { a11y = true } = {}) {
  if (!dom.includes('data-ui-check="pass"') || !dom.includes('data-visual-ready="true"')) throw new Error(`${label} layout contract failed: ${diagnostics(dom)}`);
  if (a11y && !dom.includes('data-a11y-check="pass"')) throw new Error(`${label} accessibility contract failed: ${diagnostics(dom)}`);
}
const expectedPath = resolve('test/visual/baseline-signatures.json');
const expectedConfig = existsSync(expectedPath) ? JSON.parse(await readFile(expectedPath, 'utf8')) : {};
const expectedIsPlatformMap = Boolean(expectedConfig.darwin || expectedConfig.linux || expectedConfig.win32);
const expected = expectedIsPlatformMap ? (expectedConfig[process.platform] || {}) : expectedConfig;
const updateBaseline = process.env.UPDATE_VISUAL_BASELINE === '1';
const signatures = {};
const pngHashes = {};
const visualMismatches = [];
const phase3Views=['docs','kanban','planner'];
const phase4Views=['home'];
const requiredViewports=[390,768,1440];
// Coverage parity with Chrome CLI contracts: --screenshot=, --force-prefers-reduced-motion, --force-high-contrast, --force-dark-mode.
const chrome = chromePath();
let client;
try {
  client = await connectChrome(chrome);
  for (const view of [...phase3Views, ...phase4Views]) {
    for (const width of requiredViewports) {
      const key = `${view}-${width}`;
      const shot = join(outDir, `${key}.png`);
      const url = `http://127.0.0.1:4173/test/visual/fixture.html?view=${view}`;
      const dom = await renderPage(client, { url, width, screenshotPath: shot });
      assertBrowserContract(dom, `Visual ${key}`);
      const signature = bodyAttribute(dom, 'data-visual-signature');
      if (!signature) throw new Error(`Visual signature is missing for ${key}: ${diagnostics(dom)}`);
      signatures[key] = signature;
      console.log(`VISUAL_SIGNATURE ${key} ${signature}`);
      if (!updateBaseline && expected[key] && expected[key] !== signature) visualMismatches.push(`${key} expected signature ${expected[key]} got ${signature}`);
      pngHashes[key] = hash(await readFile(shot));
      console.log(`VISUAL_PNG_HASH ${key} ${pngHashes[key]}`);
    }
  }
  if (visualMismatches.length) throw new Error(`Visual regression:\n${visualMismatches.join('\n')}`);
  const homeUrl = 'http://127.0.0.1:4173/test/visual/fixture.html?view=home';
  const reduced = await renderPage(client, { url: homeUrl, width: 768, reducedMotion: true });
  assertBrowserContract(reduced, 'Reduced-motion');
  const contrast = await renderPage(client, { url: homeUrl, width: 768, highContrast: true });
  assertBrowserContract(contrast, 'High-contrast');
  const dark = await renderPage(client, { url: homeUrl, width: 768, darkMode: true });
  assertBrowserContract(dark, 'Dark-mode');
  for (const view of [...phase3Views, ...phase4Views]) {
    const scaled = await renderPage(client, { url: `http://127.0.0.1:4173/test/visual/fixture.html?view=${view}&textScale=2`, width: 390 });
    assertBrowserContract(scaled, `200% text scale ${view}`);
    if (!scaled.includes('data-text-scale="200"')) throw new Error(`200% text scale did not activate for ${view}: ${diagnostics(scaled)}`);
    console.log(`A11Y_TEXT_SCALE ${view} PASS`);
  }
  console.log('A11Y_DARK_MODE PASS');
  console.log('A11Y_REDUCED_MOTION PASS');
  console.log('A11Y_HIGH_CONTRAST PASS');
  await writeFile(join(outDir, 'visual-signatures.json'), `${JSON.stringify(signatures, null, 2)}\n`);
  await writeFile(join(outDir, 'png-hashes.json'), `${JSON.stringify(pngHashes, null, 2)}\n`);
  if (updateBaseline) {
    const nextExpected = expectedIsPlatformMap ? { ...expectedConfig, [process.platform]: signatures } : signatures;
    await writeFile(expectedPath, `${JSON.stringify(nextExpected, null, 2)}\n`);
  }
} finally {
  if (client) {
    await client.send('Browser.close').catch(() => {});
    client.socket.close();
    await new Promise((resolveExit) => client.child.once('exit', resolveExit));
    await rm(client.profile, { recursive: true, force: true });
  }
  await new Promise((resolveClose) => server.close(resolveClose));
}
