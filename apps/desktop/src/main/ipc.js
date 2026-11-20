// Puente entre la página de Bardo y el proceso main. Solo atiende al marco
// principal de una página de Bardo: un iframe o un sitio ajeno no puede pedir
// tokens ni abrir nada. Los errores vuelven como datos, no como excepciones.
import {app, ipcMain, shell} from 'electron';
import {isAppUrl, isExternalWebUrl, ORIGIN} from './config.js';
import {OfflineError} from './session.js';
import {setWindowTheme} from './window.js';

function fromBardo(event) {
  const frame = event.senderFrame;
  return Boolean(frame) && frame === event.sender.mainFrame && isAppUrl(frame.url);
}

const failure = error => ({
  ok: false,
  code: error?.code || 'failed',
  message: error instanceof OfflineError || error?.code
    ? error.message
    : 'Algo salió mal. Vuelve a intentarlo.',
});

function handle(channel, listener) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromBardo(event)) return {ok: false, code: 'forbidden', message: 'Solicitud no permitida.'};
    try {
      return {ok: true, value: await listener(event, ...args)};
    } catch (error) {
      if (!error?.code) console.error(`Bardo: fallo en ${channel}`, error);
      return failure(error);
    }
  });
}

const API_METHODS = new Set(['GET', 'POST']);

export function registerIpc({sessionManager, getWindow}) {
  handle('bardo:info', async () => ({
    platform: process.platform,
    version: app.getVersion(),
    origin: ORIGIN,
    persisted: sessionManager.persisted,
  }));

  handle('bardo:session', async () => {
    await sessionManager.load();
    return {signedIn: sessionManager.signedIn, user: sessionManager.user};
  });

  handle('bardo:sign-in', async () => {
    const user = await sessionManager.signIn();
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      if (process.platform === 'darwin') app.focus({steal: true});
    }
    return {user};
  });
  handle('bardo:cancel-sign-in', () => sessionManager.cancelSignIn());
  handle('bardo:reopen-sign-in', () => sessionManager.reopenSignIn());
  handle('bardo:sign-out', () => sessionManager.signOut());

  handle('bardo:api', (event, path, options = {}) => {
    const method = String(options?.method || 'GET').toUpperCase();
    if (typeof path !== 'string' || !API_METHODS.has(method)) return {status: 400, body: null};
    const query = options?.query && typeof options.query === 'object' ? {guild_id: options.query.guild_id} : null;
    const body = method === 'POST' && options?.body && typeof options.body === 'object'
      ? {guildId: String(options.body.guildId || ''), channelId: String(options.body.channelId || '')}
      : undefined;
    return sessionManager.api(path, {method, query, body});
  });

  handle('bardo:set-theme', (event, theme) => {
    const window = getWindow();
    if (window) setWindowTheme(window, theme);
  });

  handle('bardo:open-external', (event, url) => {
    if (!isExternalWebUrl(url)) return false;
    void shell.openExternal(url);
    return true;
  });

  // Avisa a la página que el navegador ya confirmó y falta un instante.
  sessionManager.on('authorized', () => getWindow()?.webContents.send('bardo:sign-in-progress', 'authorized'));
}
