// Bardo Desktop (macOS y Windows). La ventana muestra la web de Bardo;
// este proceso guarda la sesión, inicia sesión por el navegador del sistema,
// pone el menú nativo y abre los enlaces bardo:// (por ejemplo, un documento).
import {app, BrowserWindow, dialog, shell} from 'electron';
import path from 'node:path';
import {isExternalWebUrl, ORIGIN, PROTOCOL} from './config.js';
import {registerIpc} from './ipc.js';
import {buildMenu} from './menu.js';
import {SessionManager} from './session.js';
import {createUpdater} from './updates.js';
import {createMainWindow} from './window.js';
import {deepLinkTarget} from './links.js';

let mainWindow = null;
let pendingDeepLink = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function openDeepLink(raw) {
  const target = deepLinkTarget(raw);
  if (!target) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingDeepLink = target;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  void mainWindow.loadURL(target);
}

function registerProtocol() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function start() {
  const sessionManager = new SessionManager({openBrowser: url => shell.openExternal(url)});
  const getWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);
  const send = command => getWindow()?.webContents.send('bardo:command', command);
  const updater = createUpdater({getWindow, sessionManager});

  async function confirmSignOut() {
    const window = getWindow();
    const {response} = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: ['Cerrar sesión', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
      message: '¿Cerrar sesión en este equipo?',
      detail: 'Para volver a entrar solo necesitas tu cuenta de Discord. Tus documentos, reuniones y tareas siguen en Bardo.',
    });
    if (response !== 0) return;
    await sessionManager.signOut();
    void window?.loadURL(ORIGIN);
  }

  async function openWindow() {
    mainWindow = await createMainWindow({onNavigateOutside: url => void shell.openExternal(url)});
    mainWindow.on('closed', () => { mainWindow = null; });
    const target = pendingDeepLink || ORIGIN;
    pendingDeepLink = null;
    await mainWindow.loadURL(target);
  }

  app.on('second-instance', (event, argv) => {
    const link = argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (link) openDeepLink(link);
    else if (getWindow()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    openDeepLink(url);
  });

  app.on('web-contents-created', (event, contents) => {
    contents.on('will-attach-webview', attachEvent => attachEvent.preventDefault());
    contents.setWindowOpenHandler(({url}) => {
      if (isExternalWebUrl(url)) void shell.openExternal(url);
      return {action: 'deny'};
    });
  });

  // La sesión terminó en otro lado (revocada desde la web o caducada): vuelve al inicio de sesión.
  sessionManager.on('signed-out', reason => {
    if (reason === 'expired') void getWindow()?.loadURL(`${ORIGIN}/?auth_error=session_ended`);
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('app.bardo.desktop');
    registerProtocol();
    void sessionManager.load();
    registerIpc({sessionManager, getWindow});
    buildMenu({send, signOut: confirmSignOut, checkForUpdates: updater.checkForUpdates});
    const initialLink = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (initialLink) pendingDeepLink = deepLinkTarget(initialLink);
    await openWindow();
    updater.start();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void openWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
