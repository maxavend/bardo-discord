// Ventana principal. Carga la web de Bardo con las protecciones de Electron:
// contexto aislado, sandbox, sin Node en la página, navegación solo dentro de
// Bardo y micrófono solo para Bardo (grabación de reuniones).
import {BrowserWindow, nativeTheme, screen, session, shell} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isAppUrl, isExternalWebUrl, ORIGIN} from './config.js';
import {readJson, writeJson} from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.join(here, '../preload/preload.cjs');
const OFFLINE_PAGE = path.join(here, '../../static/offline.html');
const STATE_FILE = 'window-state.json';
const DEFAULT_SIZE = {width: 1280, height: 820};
// Fondos del arranque de Bardo: sin destello blanco antes de que cargue la web.
const BACKGROUND = {dark: '#16131c', light: '#fbfafc'};

let permissionsReady = false;

/** El micrófono (grabar reuniones) y el portapapeles, solo para páginas de Bardo. */
function configurePermissions() {
  if (permissionsReady) return;
  permissionsReady = true;
  const allowed = new Set(['media', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const fromBardo = isAppUrl(details.requestingUrl || contents.getURL());
    const audioOnly = permission !== 'media' || !(details.mediaTypes || []).includes('video');
    callback(fromBardo && allowed.has(permission) && audioOnly);
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => (
    requestingOrigin === ORIGIN && allowed.has(permission)
  ));
}

function visibleOn(bounds) {
  return screen.getAllDisplays().some(({workArea}) => (
    bounds.x < workArea.x + workArea.width && bounds.x + bounds.width > workArea.x
    && bounds.y < workArea.y + workArea.height && bounds.y + bounds.height > workArea.y
  ));
}

export async function createMainWindow({onNavigateOutside} = {}) {
  configurePermissions();
  const saved = await readJson(STATE_FILE, {});
  const bounds = saved?.bounds && visibleOn(saved.bounds) ? saved.bounds : DEFAULT_SIZE;

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'Bardo',
    backgroundColor: nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light,
    autoHideMenuBar: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      navigateOnDragDrop: false,
    },
  });
  if (saved?.maximized) window.maximize();
  window.once('ready-to-show', () => window.show());

  const remember = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    void writeJson(STATE_FILE, {bounds: window.isMaximized() ? (saved?.bounds || window.getBounds()) : window.getBounds(), maximized: window.isMaximized()});
  };
  let rememberTimer = null;
  const scheduleRemember = () => { clearTimeout(rememberTimer); rememberTimer = setTimeout(remember, 400); };
  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) window.on(event, scheduleRemember);
  window.on('close', remember);

  const {webContents} = window;
  // Nuevas ventanas y enlaces externos van al navegador del sistema.
  webContents.setWindowOpenHandler(({url}) => {
    if (isAppUrl(url)) {
      void window.loadURL(url);
    } else if (isExternalWebUrl(url)) {
      void shell.openExternal(url);
    }
    return {action: 'deny'};
  });
  webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url) || url.startsWith('file:')) return;
    event.preventDefault();
    if (isExternalWebUrl(url)) onNavigateOutside?.(url);
  });
  webContents.on('will-redirect', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isExternalWebUrl(url)) onNavigateOutside?.(url);
  });
  webContents.on('will-attach-webview', event => event.preventDefault());
  // Sin red: una pantalla propia con «Reintentar», nunca la página de error de Chromium.
  webContents.on('did-fail-load', (event, errorCode, description, url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ABORTED */) return;
    void window.loadFile(OFFLINE_PAGE, {query: {retry: url && isAppUrl(url) ? url : ORIGIN}});
  });
  webContents.on('render-process-gone', (event, details) => {
    if (details.reason !== 'clean-exit') void window.loadURL(ORIGIN);
  });
  webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    window.setTitle(title && !/\bBardo\b/.test(title) ? `${title} · Bardo` : title || 'Bardo');
  });

  return window;
}

export function setWindowTheme(window, theme) {
  nativeTheme.themeSource = theme === 'dark' || theme === 'light' ? theme : 'system';
  if (!window.isDestroyed()) window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light);
}
