// Preload de Bardo para escritorio. Expone una API mínima en window.bardoDesktop.
// La página nunca recibe el refresh ni el token de acceso: solo pide acciones.
// El proceso main valida en cada llamada que la pide una página de Bardo.
const {contextBridge, ipcRenderer} = require('electron');

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result?.ok) return result.value;
  const error = new Error(result?.message || 'Algo salió mal. Vuelve a intentarlo.');
  error.code = result?.code || 'failed';
  throw error;
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('bardoDesktop', Object.freeze({
  version: 1,
  info: () => call('bardo:info'),
  session: () => call('bardo:session'),
  signIn: () => call('bardo:sign-in'),
  cancelSignIn: () => call('bardo:cancel-sign-in'),
  reopenSignIn: () => call('bardo:reopen-sign-in'),
  signOut: () => call('bardo:sign-out'),
  api: (path, options) => call('bardo:api', path, options),
  setTheme: theme => call('bardo:set-theme', theme),
  openExternal: url => call('bardo:open-external', url),
  onCommand: callback => subscribe('bardo:command', callback),
  onSignInProgress: callback => subscribe('bardo:sign-in-progress', callback),
}));
