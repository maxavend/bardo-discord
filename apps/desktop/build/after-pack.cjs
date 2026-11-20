// Endurece el binario de Electron antes de firmarlo: sin modo Node por
// variables de entorno ni inspector, cookies cifradas y solo la app empaquetada.
const path = require('node:path');
const {flipFuses, FuseVersion, FuseV1Options} = require('@electron/fuses');

module.exports = async function afterPack(context) {
  const {electronPlatformName, appOutDir, packager} = context;
  const name = packager.appInfo.productFilename;
  const executable = electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${name}.app`)
    : path.join(appOutDir, electronPlatformName === 'win32' ? `${name}.exe` : name);
  await flipFuses(executable, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
