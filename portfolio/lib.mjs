// Utilidades compartidas: servidor estático del build, contexto de navegador
// sembrado con los datos ficticios y reloj fijo.
import {createServer} from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname, join, normalize} from 'node:path';
import {buildSeed} from './mock/build-seed.mjs';
import {NOW_ISO, TIME_ZONE} from './mock/data.mjs';

const require = createRequire(new URL('../activity-app/package.json', import.meta.url));
export const {chromium} = require('@playwright/test');

/**
 * Chrome instalado (headless) en vez del headless-shell de Playwright: en este
 * Mac el headless-shell se cierra solo a los ~30 s, incluso con about:blank.
 */
export async function launchBrowser() {
  try {
    return await chromium.launch({channel: 'chrome'});
  } catch {
    return chromium.launch();
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.mjs': 'text/javascript', '.webp': 'image/webp',
};

export function serveStatic(root, port = 4190) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    res.writeHead(200, {'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${port}`})));
}

export const VIEWPORTS = {
  desktop: {viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, isMobile: false, hasTouch: false},
  mobile: {viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true},
};

/** Contexto con los datos sembrados, reloj fijo y zona horaria de Santiago. */
export async function seededContext(browser, {device = 'desktop', theme = 'dark', scale, now = NOW_ISO, clock = true} = {}) {
  const preset = VIEWPORTS[device];
  const context = await browser.newContext({
    ...preset,
    ...(scale ? {deviceScaleFactor: scale} : {}),
    colorScheme: theme,
    locale: 'es-CL',
    timezoneId: TIME_ZONE,
    reducedMotion: 'no-preference',
  });
  if (clock) await context.clock.install({time: new Date(now)});
  await context.addInitScript(seed => {
    try {
      if (!localStorage.getItem('bardo.portfolio.seeded')) {
        localStorage.clear();
        for (const [key, value] of Object.entries(seed.storage)) {
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
        localStorage.setItem('bardo.portfolio.seeded', '1');
      }
    } catch {}
    for (const [key, value] of Object.entries(seed.globals)) window[key] = JSON.parse(JSON.stringify(value));
  }, buildSeed({theme}));
  return context;
}

export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(`console: ${message.text()}`);
  });
  return errors;
}
