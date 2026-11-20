// Actualizaciones. Con la app firmada, electron-updater descarga e instala en
// segundo plano desde GitHub Releases. Además, si la API de Bardo exige una
// versión mínima más nueva, se avisa para no usar una app incompatible.
import {app, dialog, shell} from 'electron';
import electronUpdater from 'electron-updater';
import {ORIGIN} from './config.js';

const {autoUpdater} = electronUpdater;
const RELEASES_URL = 'https://github.com/maxavend/bardo-discord/releases';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function compareVersions(a, b) {
  const parts = value => String(value || '0').split(/[.+-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index += 1) {
    if (x[index] !== y[index]) return x[index] > y[index] ? 1 : -1;
  }
  return 0;
}

export function createUpdater({getWindow, sessionManager}) {
  const enabled = app.isPackaged && process.env.BARDO_DISABLE_UPDATES !== '1';
  let downloaded = false;

  if (enabled) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', error => console.warn('Bardo: no se pudo buscar actualizaciones', error?.message || error));
    autoUpdater.on('update-downloaded', async info => {
      downloaded = true;
      const window = getWindow();
      const {response} = await dialog.showMessageBox(window, {
        type: 'info',
        buttons: ['Reiniciar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
        message: `Bardo ${info.version} está listo`,
        detail: 'Se instalará al reiniciar. Tus cambios se guardan en Bardo, no se pierde nada.',
      });
      if (response === 0) autoUpdater.quitAndInstall();
    });
  }

  async function enforceMinimumVersion() {
    const version = await sessionManager.version();
    if (!version?.minDesktopVersion || compareVersions(app.getVersion(), version.minDesktopVersion) >= 0) return;
    const {response} = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      buttons: ['Descargar la nueva versión', 'Cerrar'],
      defaultId: 0,
      message: 'Necesitas actualizar Bardo',
      detail: `Esta versión (${app.getVersion()}) ya no es compatible. Instala la ${version.minDesktopVersion} o una más nueva.`,
    });
    if (response === 0) void shell.openExternal(RELEASES_URL);
  }

  async function checkForUpdates({manual = false} = {}) {
    void enforceMinimumVersion();
    if (!enabled) {
      if (manual) {
        await dialog.showMessageBox(getWindow(), {
          type: 'info',
          message: 'Las actualizaciones automáticas no están activas',
          detail: app.isPackaged ? 'Se desactivaron en este equipo.' : `Estás usando una versión de desarrollo conectada a ${ORIGIN}.`,
        });
      }
      return;
    }
    if (downloaded) return;
    try {
      const result = await autoUpdater.checkForUpdates();
      if (manual && (!result?.updateInfo || compareVersions(result.updateInfo.version, app.getVersion()) <= 0)) {
        await dialog.showMessageBox(getWindow(), {type: 'info', message: 'Tienes la última versión de Bardo', detail: `Versión ${app.getVersion()}.`});
      }
    } catch {
      if (manual) await dialog.showMessageBox(getWindow(), {type: 'warning', message: 'No pudimos buscar actualizaciones', detail: 'Revisa tu conexión e inténtalo más tarde.'});
    }
  }

  return {
    checkForUpdates,
    start() {
      void checkForUpdates();
      setInterval(() => void checkForUpdates(), CHECK_EVERY_MS).unref?.();
    },
  };
}

export {compareVersions};
