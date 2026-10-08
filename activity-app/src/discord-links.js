/**
 * Abrir enlaces externos desde la Activity. Dentro de Discord el iframe no
 * navega ni abre pestañas de forma fiable (`target=_blank`, descargas,
 * `window.print`), así que se usa `openExternalLink` del SDK, que muestra el
 * aviso de Discord y abre el navegador del usuario.
 */

const SAFE_EXTERNAL_URL = /^https?:\/\//i;

export function isSafeExternalUrl(url) {
  return SAFE_EXTERNAL_URL.test(String(url || '').trim());
}

/**
 * Abre `url` fuera de Discord. Devuelve true si se pudo pedir la apertura
 * (el usuario aún puede cancelar el aviso de Discord), false si no.
 */
export async function openExternalUrl(url, {sdk = globalThis.window?.__BARDO_DISCORD_SDK__, openWindow} = {}) {
  const href = String(url || '').trim();
  if (!isSafeExternalUrl(href)) return false;
  if (sdk?.commands?.openExternalLink) {
    try {
      const result = await sdk.commands.openExternalLink({url: href});
      return result?.opened !== false;
    } catch (error) {
      console.warn('Bardo: Discord no pudo abrir el enlace', error);
      return false;
    }
  }
  const open = openWindow || globalThis.window?.open?.bind(globalThis.window);
  if (!open) return false;
  try {
    open(href, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}
