// Configuración de Bardo Desktop. El origen es el mismo de la web: la
// ventana carga ese sitio y la app habla con su API. Se puede cambiar con
// BARDO_ORIGIN (desarrollo local o staging), siempre https o loopback.
export const PRODUCTION_ORIGIN = 'https://bardo-discord.bardo-discord.workers.dev';
export const CLIENT_ID = 'bardo_desktop';
export const APP_SCOPES = 'bardo:read bardo:write bardo:share bardo:app';
export const PROTOCOL = 'bardo';
// Página de Discord para invitar al bot (la misma que muestra la web).
export const INSTALL_URL = 'https://discord.com/oauth2/authorize?client_id=1539704001535156254';

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Origen permitido, o lanza: la app nunca carga ni envía tokens a otro sitio. */
export function resolveOrigin(raw = process.env.BARDO_ORIGIN) {
  const value = String(raw || '').trim() || PRODUCTION_ORIGIN;
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error(`BARDO_ORIGIN debe ser https o loopback: ${value}`);
  }
  return url.origin;
}

export const ORIGIN = resolveOrigin();

/** Solo direcciones del propio Bardo pueden mostrarse dentro de la ventana. */
export function isAppUrl(raw) {
  try {
    return new URL(raw).origin === ORIGIN;
  } catch {
    return false;
  }
}

/** Enlaces que se abren en el navegador del sistema: solo http(s). */
export function isExternalWebUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
