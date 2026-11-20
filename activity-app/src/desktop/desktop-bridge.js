// Puente con Bardo para escritorio (Electron). El preload expone
// window.bardoDesktop; la página nunca ve los tokens de la app, solo pide
// acciones (iniciar sesión, abrir un canal, cerrar sesión).
export function desktopBridge() {
  if (typeof window === 'undefined') return null;
  const bridge = window.bardoDesktop;
  return bridge && bridge.version === 1 ? bridge : null;
}

export const isDesktopApp = () => Boolean(desktopBridge());

const isMacLike = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || globalThis.navigator?.userAgent || '');

/** Tecla de comando según el sistema: ⌘ en macOS, Ctrl en Windows. */
export const modKey = () => (isMacLike() ? '⌘' : 'Ctrl');
export const shiftKey = () => (isMacLike() ? '⇧' : 'Mayús');

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body ?? null), {status, headers: {'Content-Type': 'application/json'}});
}

function abortError() {
  return new DOMException('La solicitud se canceló.', 'AbortError');
}

/**
 * Las pantallas previas al canal hablan con /api/web/* en el navegador y con
 * /api/app/* (vía el proceso main) en la app. Devuelve siempre un Response, así
 * el selector de canales es el mismo en las dos.
 */
export async function gateFetch(path, {method = 'GET', query = null, body, signal} = {}) {
  const bridge = desktopBridge();
  if (!bridge) {
    const search = query ? `?${new URLSearchParams(query)}` : '';
    return fetch(`/api/web/${path}${search}`, {
      method,
      headers: {Accept: 'application/json', ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
      ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
      cache: 'no-store',
      signal,
    });
  }
  if (signal?.aborted) throw abortError();
  const call = path === 'session'
    ? bridge.session().then(session => (session.signedIn && session.user
      ? {status: 200, body: {user: session.user}}
      : {status: 401, body: {error: 'auth_required'}}))
    : bridge.api(path, {method, query, body});
  const aborted = new Promise((resolve, reject) => signal?.addEventListener('abort', () => reject(abortError()), {once: true}));
  let result;
  try {
    result = await Promise.race([call, aborted]);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Sin conexión: el mismo tipo de error que un fetch fallido en el navegador.
    throw new TypeError(error?.message || 'No pudimos conectar con Bardo.');
  }
  return jsonResponse(result.body, result.status);
}
