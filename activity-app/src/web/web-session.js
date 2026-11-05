// Bardo en el navegador: decide qué mostrar al arrancar fuera de Discord. La
// sesión es una cookie HttpOnly; el token de cada canal vive solo en memoria y
// se pide de nuevo en cada carga, así un cambio de permisos en Discord se nota.
import {installBardoApiSession} from '../production-launch-auth.js';

const LAST_CHANNELS_KEY = 'bardo.web.channels.v1';
const MAX_RECENT_CHANNELS = 5;

const AUTH_ERRORS = {
  cancelled: 'Cancelaste el inicio de sesión en Discord. Vuelve a intentarlo cuando quieras.',
  expired: 'El inicio de sesión tardó demasiado. Vuelve a intentarlo.',
  discord_unavailable: 'Discord no respondió. Espera unos segundos y vuelve a intentarlo.',
  too_many: 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.',
  failed: 'No pudimos iniciar tu sesión con Discord. Vuelve a intentarlo.',
  not_configured: 'El inicio de sesión todavía no está configurado en Bardo. Avisa a quien administra el bot.',
};

export const isWebApp = () => Boolean(typeof window !== 'undefined' && window.__BARDO_WEB__);

/** Dirección de esta misma vista en la web, para un destino dentro del canal. */
export function webChannelUrl(guildId, channelId, target = null) {
  const params = new URLSearchParams({guild: guildId, channel: channelId});
  if (target) params.set('document', target);
  return `${window.location.origin}/?${params}`;
}

export const signInUrl = () => {
  const {pathname, search, hash} = window.location;
  return `/auth/discord?return_to=${encodeURIComponent(`${pathname}${search}${hash}`)}`;
};

export function goToChannel(guildId, channelId) {
  window.location.assign(webChannelUrl(guildId, channelId));
}

export const goToChannelPicker = () => window.location.assign('/?pick=1');

export async function signOutOfWeb() {
  try {
    await fetch('/api/web/logout', {method: 'POST', headers: {Accept: 'application/json'}});
  } finally {
    window.location.assign('/');
  }
}

/** Solo ids, por persona: un equipo compartido no mezcla canales recientes. */
export function readRecentChannels(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_CHANNELS_KEY) || 'null');
    return saved?.userId === userId && Array.isArray(saved.channels) ? saved.channels : [];
  } catch {
    return [];
  }
}

function rememberChannel(userId, guildId, channelId) {
  try {
    const others = readRecentChannels(userId).filter(item => item.channelId !== channelId);
    localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify({
      userId,
      channels: [{guildId, channelId}, ...others].slice(0, MAX_RECENT_CHANNELS),
    }));
  } catch {
    // Sin almacenamiento, la próxima vez se elige el canal de nuevo.
  }
}

function forgetChannel(userId, channelId) {
  try {
    const channels = readRecentChannels(userId).filter(item => item.channelId !== channelId);
    localStorage.setItem(LAST_CHANNELS_KEY, JSON.stringify({userId, channels}));
  } catch {
    // Igual se muestra el selector.
  }
}

function takeAuthError() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_error');
  if (!code) return null;
  url.searchParams.delete('auth_error');
  window.history.replaceState(null, '', url);
  return AUTH_ERRORS[code] || AUTH_ERRORS.failed;
}

/** Destino pedido por la dirección, igual que los botones «Abrir» de Discord. */
function launchCustomId(params) {
  const target = params.get('document')?.trim();
  if (!target) return null;
  return target.startsWith('bardo:open:') ? target : `bardo:open:${target}`;
}

async function readSession() {
  let response;
  try {
    response = await fetch('/api/web/session', {headers: {Accept: 'application/json'}, cache: 'no-store'});
  } catch {
    return {offline: true};
  }
  // Web apagada, o un servidor de desarrollo sin Worker: sigue el modo local.
  if (response.status === 404 || !(response.headers.get('content-type') || '').includes('application/json')) return null;
  if (response.status === 401) return {signedOut: true};
  if (!response.ok) return {offline: true};
  return response.json().catch(() => null);
}

async function openChannel(user, guildId, channelId, customId) {
  const response = await fetch('/api/web/channel-session', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({guildId, channelId}),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.bardo_token) {
    const error = new Error(payload?.message || 'No pudimos abrir este canal. Inténtalo de nuevo.');
    error.status = response.status;
    throw error;
  }

  installBardoApiSession({token: payload.bardo_token, customId});
  window.__BARDO_WEB__ = true;
  window.__BARDO_PRODUCTION__ = true;
  window.__BARDO_SESSION_TOKEN__ = payload.bardo_token;
  window.__BARDO_GUILD_ID__ = guildId;
  window.__BARDO_CHANNEL_ID__ = channelId;
  window.__BARDO_USER__ = payload.user || user;
  window.__BARDO_CUSTOM_ID__ = customId;
  rememberChannel(user.id, guildId, channelId);
  // La dirección nombra el canal: recargar o abrir otra pestaña no lo cambia.
  const url = new URL(window.location.href);
  if (url.searchParams.get('channel') !== channelId) {
    url.searchParams.delete('pick');
    url.searchParams.set('guild', guildId);
    url.searchParams.set('channel', channelId);
    window.history.replaceState(null, '', url);
  }

  return {
    embedded: true,
    ready: true,
    sdk: null,
    guildId,
    channelId,
    user: window.__BARDO_USER__,
    customId,
    sessionToken: payload.bardo_token,
    instanceId: null,
  };
}

/**
 * null: la web no está activa aquí y Bardo sigue en modo local.
 * {gate: 'signin' | 'picker' | 'error', …}: se muestra esa pantalla.
 * Si no: el mismo resultado que la autenticación dentro de Discord.
 */
export async function bootWebApp() {
  const authError = takeAuthError();
  const session = await readSession();
  if (!session) return null;
  if (session.offline) return {gate: 'error', message: 'No pudimos conectar con Bardo. Revisa tu conexión e inténtalo de nuevo.'};
  if (session.signedOut) return {gate: 'signin', message: authError};

  const {user} = session;
  window.__BARDO_WEB__ = true;
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('guild') && params.get('channel')
    ? {guildId: params.get('guild'), channelId: params.get('channel')}
    : null;
  const remembered = params.has('pick') ? null : readRecentChannels(user.id)[0];
  const target = requested || remembered;
  if (!target) return {gate: 'picker', user, message: authError};

  try {
    return await openChannel(user, target.guildId, target.channelId, requested ? launchCustomId(params) : null);
  } catch (error) {
    // Sin permiso o sin Discord: nunca una pantalla en blanco, se elige otro canal.
    if (error.status === 403) forgetChannel(user.id, target.channelId);
    return {gate: 'picker', user, message: error.message};
  }
}
